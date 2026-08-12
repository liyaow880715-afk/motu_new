const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "motu-node-identity-migration-"));
const databasePath = path.join(testRoot, "migration.db");
const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
const environment = { ...process.env, DATABASE_URL: databaseUrl };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function runNodeSource(source) {
  return run(process.execPath, ["-"], { input: source });
}

function applyMigrationsBeforeNodeIdentity() {
  const migrationRoot = path.join(root, "prisma", "migrations");
  const databaseLiteral = JSON.stringify(databasePath.replace(/\\/g, "/"));
  runNodeSource(`
    const fs = require("node:fs");
    const path = require("node:path");
    const { DatabaseSync } = require("node:sqlite");
    const root = ${JSON.stringify(root)};
    const db = new DatabaseSync(${databaseLiteral});
    for (const name of fs.readdirSync(path.join(root, "prisma", "migrations")).sort()) {
      if (name >= "20260812150000_add_page_node_identity_links") break;
      const file = path.join(root, "prisma", "migrations", name, "migration.sql");
      if (fs.existsSync(file)) db.exec(fs.readFileSync(file, "utf8"));
    }
    db.close();
  `);
  void migrationRoot;
}

function main() {
  try {
    applyMigrationsBeforeNodeIdentity();
    const fixture = runNodeSource(`
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(${JSON.stringify(databasePath.replace(/\\/g, "/"))});
      const now = "2026-08-12 08:00:00";
      db.prepare('INSERT INTO "Project" ("id", "name", "platform", "style", "status", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run("project-1", "Migration fixture", "pinduoduo", "conversion_focused", "PLANNED", now, now);
      db.prepare('INSERT INTO "PageSection" ("id", "projectId", "sectionKey", "type", "title", "goal", "copy", "visualPrompt", "order", "status", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run("section-1", "project-1", "hero_01", "HERO", "Hero", "Goal", "Copy", "Prompt", 0, "SUCCESS", now, now);
      db.prepare('INSERT INTO "PageDocument" ("id", "projectId", "schemaVersion", "authority", "nextPublishNumber", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run("document-1", "project-1", 1, "LEGACY", 1, now, now);
      db.prepare('INSERT INTO "PageRevision" ("id", "documentId", "number", "kind", "source", "schemaVersion", "pageData", "rootNodeStableId", "editSequence", "contentHash", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run("revision-1", "document-1", 0, "DRAFT", "LEGACY_BOOTSTRAP", 1, "{}", "root:project-1", 0, "hash", now, now);
      db.prepare('INSERT INTO "PageNode" ("id", "revisionId", "stableId", "nodeType", "sortOrder", "data", "sourceType", "sourceKey", "sourceRecordId", "legacySectionId", "nodeHash", "status", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run("node-1", "revision-1", "section:hero_01", "commerce.section", 0, "{}", "legacy.section", "hero_01", "section-1", "section-1", "node-hash", "active", now, now);
      db.prepare('INSERT INTO "GenerationTask" ("id", "projectId", "sectionId", "taskType", "status", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run("task-1", "project-1", "section-1", "GENERATE", "SUCCESS", now, now);
      db.prepare('INSERT INTO "SectionVersion" ("id", "sectionId", "versionNumber", "promptSnapshot", "copySnapshot", "isActive", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run("version-1", "section-1", 1, "{\\"prompt\\":\\"old\\"}", "{\\"copy\\":\\"old\\"}", 1, now);
      db.close();
    `);
    void fixture;

    run(process.execPath, ["scripts/apply-prisma-migrations.cjs"]);
    const result = JSON.parse(runNodeSource(`
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(${JSON.stringify(databasePath.replace(/\\/g, "/"))});
      const identity = db.prepare('SELECT * FROM "PageNodeIdentity" WHERE "documentId" = ? AND "stableId" = ?').get("document-1", "section:hero_01");
      const node = db.prepare('SELECT "nodeIdentityId" FROM "PageNode" WHERE "id" = ?').get("node-1");
      const task = db.prepare('SELECT "pageNodeIdentityId", "pageRevisionId", "pageNodeStableId" FROM "GenerationTask" WHERE "id" = ?').get("task-1");
      const version = db.prepare('SELECT "sectionId", "pageNodeIdentityId", "pageRevisionId", "pageNodeStableId" FROM "SectionVersion" WHERE "id" = ?').get("version-1");
      db.prepare('DELETE FROM "PageSection" WHERE "id" = ?').run("section-1");
      const afterDelete = db.prepare('SELECT "sectionId", "pageNodeIdentityId" FROM "SectionVersion" WHERE "id" = ?').get("version-1");
      db.close();
      process.stdout.write(JSON.stringify({ identity, node, task, version, afterDelete }));
    `));

    assert.ok(result.identity, "migration must create an identity for existing page nodes");
    assert.equal(result.node.nodeIdentityId, result.identity.id, "migration must link existing PageNode to its identity");
    assert.equal(result.task.pageNodeIdentityId, result.identity.id, "migration must backfill GenerationTask identity");
    assert.equal(result.task.pageRevisionId, "revision-1", "migration must backfill GenerationTask draft revision");
    assert.equal(result.task.pageNodeStableId, "section:hero_01", "migration must backfill GenerationTask stableId");
    assert.equal(result.version.pageNodeIdentityId, result.identity.id, "migration must backfill SectionVersion identity");
    assert.equal(result.version.pageRevisionId, "revision-1", "migration must backfill SectionVersion draft revision");
    assert.equal(result.version.pageNodeStableId, "section:hero_01", "migration must backfill SectionVersion stableId");
    assert.equal(result.afterDelete.sectionId, null, "SectionVersion must survive legacy section deletion");
    assert.equal(result.afterDelete.pageNodeIdentityId, result.identity.id, "SectionVersion identity must survive legacy section deletion");
    process.stdout.write(JSON.stringify({ migrated: true, historyRetained: true }));
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

main();
