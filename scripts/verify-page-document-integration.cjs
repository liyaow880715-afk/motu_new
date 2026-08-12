const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "motu-mxpage-integration-"));
const databasePath = path.join(testRoot, "integration.db");
const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
const desktopPort = 5191;
const webPort = 5192;
const desktopBaseUrl = `http://127.0.0.1:${desktopPort}`;
const environment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  APP_RUNTIME: "desktop",
  PORT: String(desktopPort),
};

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

async function waitForServer(processHandle, stderrPath, baseUrl) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Integration server exited early:\n${fs.readFileSync(stderrPath, "utf8")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Integration server did not become healthy:\n${fs.readFileSync(stderrPath, "utf8")}`);
}

async function request(url, options, baseUrl = desktopBaseUrl) {
  const response = await fetch(`${baseUrl}${url}`, options);
  const payload = await response.json();
  return { response, payload };
}

async function requestJson(url, options, baseUrl = desktopBaseUrl) {
  const { response, payload } = await request(url, options, baseUrl);
  if (!response.ok || payload.success !== true) {
    throw new Error(`${options?.method ?? "GET"} ${url} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function expectApiFailure(url, options, status, code, baseUrl = desktopBaseUrl) {
  const { response, payload } = await request(url, options, baseUrl);
  assert.equal(response.status, status, `${url} must return HTTP ${status}`);
  assert.equal(payload.success, false, `${url} must return an API failure envelope`);
  assert.equal(payload.error?.code, code, `${url} must fail with ${code}`);
  return payload.error;
}

async function stopServer(server) {
  if (server.exitCode !== null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } else {
    server.kill("SIGTERM");
  }

  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

async function removeTestRoot() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error?.code !== "EBUSY" || attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function main() {
  run(process.execPath, ["scripts/apply-prisma-migrations.cjs"]);
  const projectId = runNodeSource(`
    const { PrismaClient } = require("@prisma/client");
    (async () => {
      const prisma = new PrismaClient();
      const project = await prisma.project.create({
        data: {
          name: "MxPage Integration",
          platform: "pinduoduo",
          style: "conversion_focused",
          modelSnapshot: { previewConfig: { imageAspectRatio: "9:16", contentLanguage: "zh-CN" } },
        },
      });
      await prisma.pageSection.createMany({ data: [
        { projectId: project.id, sectionKey: "hero_01", type: "HERO", title: "主视觉", goal: "建立第一印象", copy: "真实商品", visualPrompt: "Primary Prompt: 主视觉", order: 0 },
        { projectId: project.id, sectionKey: "detail_01", type: "SELLING_POINTS", title: "核心卖点", goal: "建立信任", copy: "事实卖点", visualPrompt: "Primary Prompt: 卖点图", order: 1 },
      ] });
      process.stdout.write(project.id);
      await prisma.$disconnect();
    })().catch((error) => { console.error(error); process.exit(1); });
  `);

  const stdoutPath = path.join(testRoot, "server.out.log");
  const stderrPath = path.join(testRoot, "server.err.log");
  const stdout = fs.openSync(stdoutPath, "a");
  const stderr = fs.openSync(stderrPath, "a");
  const server = spawn(process.execPath, ["scripts/run-next-safe.cjs", "dev", "-p", String(desktopPort)], {
    cwd: root,
    env: environment,
    windowsHide: true,
    detached: false,
    stdio: ["ignore", stdout, stderr],
  });

  try {
    await waitForServer(server, stderrPath, desktopBaseUrl);
    const requestOptions = {
      method: "POST",
      headers: { "content-type": "application/json" },
    };
    const bootstrapOne = await requestJson(`/api/projects/${projectId}/document`, {
      ...requestOptions,
      body: JSON.stringify({ action: "bootstrap" }),
    });
    const bootstrapTwo = await requestJson(`/api/projects/${projectId}/document`, {
      ...requestOptions,
      body: JSON.stringify({ action: "bootstrap" }),
    });
    assert.equal(bootstrapOne.id, bootstrapTwo.id, "bootstrap must be idempotent");

    const before = bootstrapOne.draft.nodes.find((node) => node.sourceKey === "hero_01");
    const removedBefore = bootstrapOne.draft.nodes.find((node) => node.sourceKey === "detail_01");
    assert.ok(before && removedBefore, "bootstrap must import both legacy sections");

    const retainedIdentity = runNodeSource(`
      const { PrismaClient } = require("@prisma/client");
      (async () => {
        const prisma = new PrismaClient();
        const projectId = ${JSON.stringify(projectId)};
        const hero = await prisma.pageSection.findUnique({
          where: { projectId_sectionKey: { projectId, sectionKey: "hero_01" } },
        });
        const document = await prisma.pageDocument.findUnique({
          where: { projectId },
          include: { revisions: { where: { number: 0 }, include: { nodes: true } } },
        });
        const draft = document.revisions[0];
        const heroNode = draft.nodes.find((node) => node.sourceKey === "hero_01");
        const identity = await prisma.pageNodeIdentity.findUnique({
          where: { documentId_stableId: { documentId: document.id, stableId: heroNode.stableId } },
        });
        const task = await prisma.generationTask.create({
          data: {
            projectId,
            sectionId: hero.id,
            pageNodeIdentityId: identity.id,
            pageRevisionId: draft.id,
            pageNodeStableId: heroNode.stableId,
            taskType: "GENERATE",
            status: "SUCCESS",
          },
        });
        const version = await prisma.sectionVersion.create({
          data: {
            sectionId: hero.id,
            pageNodeIdentityId: identity.id,
            pageRevisionId: draft.id,
            pageNodeStableId: heroNode.stableId,
            versionNumber: 1,
            promptSnapshot: { prompt: "retained history" },
            copySnapshot: { copy: "retained history" },
            isActive: true,
          },
        });
        process.stdout.write(JSON.stringify({
          oldSectionId: hero.id,
          nodeIdentityId: identity.id,
          stableId: heroNode.stableId,
          taskId: task.id,
          versionId: version.id,
        }));
        await prisma.$disconnect();
      })().catch((error) => { console.error(error); process.exit(1); });
    `);
    const retainedHistory = JSON.parse(retainedIdentity);

    runNodeSource(`
      const { PrismaClient } = require("@prisma/client");
      (async () => {
        const prisma = new PrismaClient();
        const projectId = ${JSON.stringify(projectId)};
        const hero = await prisma.pageSection.findUnique({
          where: { projectId_sectionKey: { projectId, sectionKey: "hero_01" } },
        });
        await prisma.pageSection.delete({ where: { id: hero.id } });
        await prisma.pageSection.create({
          data: {
            projectId,
            sectionKey: "hero_01",
            type: "HERO",
            title: "主视觉已重建",
            goal: "建立第一印象",
            copy: "更新文案",
            visualPrompt: "Primary Prompt: 更新主视觉",
            order: 0,
          },
        });
        await prisma.pageSection.delete({
          where: { projectId_sectionKey: { projectId, sectionKey: "detail_01" } },
        });
        await prisma.$disconnect();
      })().catch((error) => { console.error(error); process.exit(1); });
    `);

    const synced = await requestJson(`/api/projects/${projectId}/document`, {
      ...requestOptions,
      body: JSON.stringify({
        action: "sync_legacy",
        expectedEditSequence: bootstrapOne.draft.editSequence,
        force: false,
      }),
    });
    const after = synced.draft.nodes.find((node) => node.sourceKey === "hero_01");
    const archived = synced.draft.nodes.find((node) => node.sourceKey === "detail_01");
    assert.equal(after.stableId, before.stableId, "recreated PageSection must keep the PageNode stableId");
    assert.notEqual(after.sourceRecordId, before.sourceRecordId, "legacy row trace must update after replanning");
    assert.equal(archived.status, "archived", "removed legacy nodes must be soft archived");
    assert.equal(synced.draft.editSequence, bootstrapOne.draft.editSequence + 1, "sync must advance editSequence");

    const retainedHistoryAfterReplan = JSON.parse(runNodeSource(`
      const { PrismaClient } = require("@prisma/client");
      (async () => {
        const prisma = new PrismaClient();
        const task = await prisma.generationTask.findUnique({ where: { id: ${JSON.stringify(retainedHistory.taskId)} } });
        const version = await prisma.sectionVersion.findUnique({ where: { id: ${JSON.stringify(retainedHistory.versionId)} } });
        const identity = await prisma.pageNodeIdentity.findUnique({ where: { id: ${JSON.stringify(retainedHistory.nodeIdentityId)} } });
        const currentHero = await prisma.pageSection.findUnique({
          where: { projectId_sectionKey: { projectId: ${JSON.stringify(projectId)}, sectionKey: "hero_01" } },
        });
        process.stdout.write(JSON.stringify({
          taskSectionId: task?.sectionId ?? null,
          taskIdentityId: task?.pageNodeIdentityId ?? null,
          versionSectionId: version?.sectionId ?? null,
          versionIdentityId: version?.pageNodeIdentityId ?? null,
          identityLegacySectionId: identity?.legacySectionId ?? null,
          currentHeroId: currentHero?.id ?? null,
          identityStableId: identity?.stableId ?? null,
        }));
        await prisma.$disconnect();
      })().catch((error) => { console.error(error); process.exit(1); });
    `));
    assert.equal(retainedHistoryAfterReplan.taskSectionId, null, "replanning must detach GenerationTask from the deleted legacy row");
    assert.equal(retainedHistoryAfterReplan.versionSectionId, null, "replanning must retain SectionVersion after the legacy row is deleted");
    assert.equal(retainedHistoryAfterReplan.taskIdentityId, retainedHistory.nodeIdentityId, "GenerationTask must retain the stable node identity");
    assert.equal(retainedHistoryAfterReplan.versionIdentityId, retainedHistory.nodeIdentityId, "SectionVersion must retain the stable node identity");
    assert.equal(retainedHistoryAfterReplan.identityLegacySectionId, retainedHistoryAfterReplan.currentHeroId, "sync must relink the identity to the recreated legacy section");
    assert.equal(retainedHistoryAfterReplan.identityStableId, retainedHistory.stableId, "node identity stableId must survive replanning");

    await expectApiFailure(`/api/projects/${projectId}/document`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedEditSequence: bootstrapOne.draft.editSequence,
        operations: [{ op: "update", stableId: after.stableId, data: after.data }],
      }),
    }, 409, "DRAFT_STALE");

    const patchedTitle = "MxPage draft title";
    const patchedData = structuredClone(after.data);
    patchedData.content.title = patchedTitle;
    const patched = await requestJson(`/api/projects/${projectId}/document`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedEditSequence: synced.draft.editSequence,
        operations: [{ op: "update", stableId: after.stableId, data: patchedData }],
      }),
    });
    assert.equal(patched.authority, "MXPAGE", "first MxPage edit must transfer document authority");
    const projectedTitle = runNodeSource(`
      const { PrismaClient } = require("@prisma/client");
      (async () => {
        const prisma = new PrismaClient();
        const section = await prisma.pageSection.findUnique({ where: { id: ${JSON.stringify(after.legacySectionId)} } });
        process.stdout.write(section.title);
        await prisma.$disconnect();
      })().catch((error) => { console.error(error); process.exit(1); });
    `);
    assert.equal(projectedTitle, patchedTitle, "MxPage edits must project to the compatibility PageSection in the same workflow");

    await expectApiFailure(`/api/projects/${projectId}/document`, {
      ...requestOptions,
      body: JSON.stringify({
        action: "sync_legacy",
        expectedEditSequence: patched.draft.editSequence,
        force: false,
      }),
    }, 409, "LEGACY_SYNC_CONFIRMATION_REQUIRED");

    const forcedSync = await requestJson(`/api/projects/${projectId}/document`, {
      ...requestOptions,
      body: JSON.stringify({
        action: "sync_legacy",
        expectedEditSequence: patched.draft.editSequence,
        force: true,
      }),
    });
    assert.equal(forcedSync.draft.editSequence, patched.draft.editSequence + 1, "confirmed legacy sync must advance the draft");

    const cycleNode = forcedSync.draft.nodes.find((node) => node.sourceKey === "hero_01");
    await expectApiFailure(`/api/projects/${projectId}/document`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedEditSequence: forcedSync.draft.editSequence,
        operations: [{ op: "move", stableId: cycleNode.stableId, parentStableId: cycleNode.stableId, sortOrder: 0 }],
      }),
    }, 400, "NODE_CYCLE");
    const afterFailedCycle = await requestJson(`/api/projects/${projectId}/document`, { method: "GET" });
    assert.equal(afterFailedCycle.draft.editSequence, forcedSync.draft.editSequence, "failed tree mutation must roll back editSequence");
    assert.equal(
      afterFailedCycle.draft.nodes.find((node) => node.stableId === cycleNode.stableId).parentStableId,
      cycleNode.parentStableId,
      "failed tree mutation must roll back node changes",
    );

    const publishedOne = await requestJson(`/api/projects/${projectId}/document`, {
      ...requestOptions,
      body: JSON.stringify({
        action: "publish",
        expectedEditSequence: afterFailedCycle.draft.editSequence,
        expectedContentHash: afterFailedCycle.draft.contentHash,
        summary: "Integration publish one",
      }),
    });
    const revisionOne = publishedOne.revisions.find((revision) => revision.number === 1);
    assert.ok(revisionOne && revisionOne.kind === "PUBLISHED", "publish must create immutable revision 1");
    assert.equal(publishedOne.publishedRevisionId, revisionOne.id, "published pointer must reference revision 1");

    const draftAfterPublish = publishedOne.draft;
    const draftNodeAfterPublish = draftAfterPublish.nodes.find((node) => node.sourceKey === "hero_01");
    const secondEditData = structuredClone(draftNodeAfterPublish.data);
    secondEditData.content.title = "Draft changed after publish";
    const secondEdit = await requestJson(`/api/projects/${projectId}/document`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedEditSequence: draftAfterPublish.editSequence,
        operations: [{ op: "update", stableId: draftNodeAfterPublish.stableId, data: secondEditData }],
      }),
    });
    const immutableRevisionOne = secondEdit.revisions.find((revision) => revision.id === revisionOne.id);
    assert.equal(
      immutableRevisionOne.nodes.find((node) => node.stableId === draftNodeAfterPublish.stableId).data.content.title,
      revisionOne.nodes.find((node) => node.stableId === draftNodeAfterPublish.stableId).data.content.title,
      "editing draft after publish must not modify published nodes",
    );

    const publishedTwo = await requestJson(`/api/projects/${projectId}/document`, {
      ...requestOptions,
      body: JSON.stringify({
        action: "publish",
        expectedEditSequence: secondEdit.draft.editSequence,
        expectedContentHash: secondEdit.draft.contentHash,
        summary: "Integration publish two",
      }),
    });
    const revisionTwo = publishedTwo.revisions.find((revision) => revision.number === 2);
    assert.ok(revisionTwo && revisionTwo.parentRevisionId === revisionOne.id, "published revisions must be monotonic and linked");

    const rolledBack = await requestJson(`/api/projects/${projectId}/document`, {
      ...requestOptions,
      body: JSON.stringify({
        action: "rollback",
        targetRevisionId: revisionOne.id,
        resetDraft: true,
        expectedEditSequence: publishedTwo.draft.editSequence,
      }),
    });
    assert.equal(rolledBack.publishedRevisionId, revisionOne.id, "rollback must move the published pointer");
    assert.equal(rolledBack.draft.contentHash, revisionOne.contentHash, "resetDraft rollback must clone the published snapshot");
    assert.ok(
      rolledBack.revisions.some((revision) => revision.id === revisionTwo.id),
      "rollback must preserve newer published history",
    );
    const rollbackProjectedTitle = runNodeSource(`
      const { PrismaClient } = require("@prisma/client");
      (async () => {
        const prisma = new PrismaClient();
        const section = await prisma.pageSection.findUnique({ where: { id: ${JSON.stringify(draftNodeAfterPublish.legacySectionId)} } });
        process.stdout.write(section.title);
        await prisma.$disconnect();
      })().catch((error) => { console.error(error); process.exit(1); });
    `);
    assert.equal(
      rollbackProjectedTitle,
      revisionOne.nodes.find((node) => node.stableId === draftNodeAfterPublish.stableId).data.content.title,
      "resetDraft rollback must restore the compatibility PageSection projection",
    );

    const archivedNode = rolledBack.draft.nodes.find((node) => node.sourceKey === "detail_01");
    await expectApiFailure(`/api/projects/${projectId}/document`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedEditSequence: rolledBack.draft.editSequence,
        operations: [{ op: "update", stableId: archivedNode.stableId, data: archivedNode.data }],
      }),
    }, 409, "NODE_ARCHIVED");

    process.stdout.write(JSON.stringify({
      projectId,
      sameDocument: true,
      stableIdPreserved: true,
      sourceRecordUpdated: true,
      removedNodeStatus: archived.status,
      editSequenceBefore: bootstrapOne.draft.editSequence,
      editSequenceAfter: synced.draft.editSequence,
      publishedRevisions: [revisionOne.number, revisionTwo.number],
      rollbackPointer: rolledBack.publishedRevisionId,
    }));
  } finally {
    await stopServer(server);
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }

  const webStdoutPath = path.join(testRoot, "web-server.out.log");
  const webStderrPath = path.join(testRoot, "web-server.err.log");
  const webStdout = fs.openSync(webStdoutPath, "a");
  const webStderr = fs.openSync(webStderrPath, "a");
  const webEnvironment = {
    ...environment,
    APP_RUNTIME: "web",
    APP_SECRET: "mxpage-integration-secret-2026-08-12-long",
    PORT: String(webPort),
  };
  const webServer = spawn(process.execPath, ["scripts/run-next-safe.cjs", "dev", "-p", String(webPort)], {
    cwd: root,
    env: webEnvironment,
    windowsHide: true,
    detached: false,
    stdio: ["ignore", webStdout, webStderr],
  });
  try {
    await waitForServer(webServer, webStderrPath, `http://127.0.0.1:${webPort}`);
    await expectApiFailure(
      `/api/projects/${projectId}/document`,
      { method: "GET" },
      401,
      "UNAUTHORIZED",
      `http://127.0.0.1:${webPort}`,
    );
  } finally {
    await stopServer(webServer);
    fs.closeSync(webStdout);
    fs.closeSync(webStderr);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(removeTestRoot);
