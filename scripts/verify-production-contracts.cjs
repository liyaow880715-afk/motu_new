const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function loadTypeScriptModule(relativePath, overrides = {}) {
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (moduleId) => overrides[moduleId] ?? require(moduleId);
  new Function("exports", "module", "require", output)(loaded.exports, loaded, localRequire);
  return loaded.exports;
}

class MockApiRouteError extends Error {
  constructor(code, message, status, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function main() {
  const session = loadTypeScriptModule("lib/auth/session.ts");
  const secret = "production-contract-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
  const token = await session.createSessionToken("access-key-id", secret);
  const verified = await session.verifySessionToken(token, secret);
  assert.equal(verified.accessKeyId, "access-key-id", "signed session must preserve the access-key id");
  const [payload, signature] = token.split(".");
  const tamperedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  assert.equal(await session.verifySessionToken(`${payload}.${tamperedSignature}`, secret), null, "tampered session must fail");
  const expired = await session.createSessionToken("access-key-id", secret, new Date(Date.now() - 1000));
  assert.equal(await session.verifySessionToken(expired, secret), null, "expired session must fail");
  assert.equal(session.isSecureAppSecret("banana-mall-local-secret"), false, "default app secret must be rejected");

  const uploads = loadTypeScriptModule("lib/validations/image-upload.ts", {
    "@/lib/utils/route": { ApiRouteError: MockApiRouteError },
  });
  assert.throws(() => uploads.decodeStrictBase64("not base64!!"), (error) => error.code === "INVALID_BASE64");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=",
    "base64",
  );
  const validImage = await uploads.validateImageUpload(png, "image/png");
  assert.equal(validImage.format, "png");
  assert.equal(validImage.sha256.length, 64);
  await assert.rejects(
    uploads.validateImageUpload(png, "image/jpeg"),
    (error) => error.code === "IMAGE_MIME_MISMATCH",
  );
  await assert.rejects(
    uploads.validateImageUpload(Buffer.alloc(uploads.IMAGE_UPLOAD_MAX_BYTES + 1), "image/png"),
    (error) => error.code === "UPLOAD_TOO_LARGE" && error.status === 413,
  );

  const middleware = read("middleware.ts");
  assert.match(middleware, /verifySessionToken/);
  assert.match(middleware, /x-auth-key-id/);
  assert.doesNotMatch(middleware, /x-access-key/);

  const storage = read("lib/storage/asset-manager.ts");
  assert.match(storage, /path\.relative\(root, resolved\)/);
  assert.match(storage, /InvalidStoragePathError/);
  assert.doesNotMatch(storage, /prisma\.project\.upsert/);
  const fileRoute = read("app/api/files/[...path]/route.ts");
  assert.match(fileRoute, /\[\\\\\/\\0\]/, "file route must reject decoded separators inside a path segment");
  assert.match(fileRoute, /segment === "\.\."/);
  assert.match(fileRoute, /isAccessKeyScopedStorageRoot/);
  assert.match(fileRoute, /checkAdminOrDesktop/);
  const scopedStorage = loadTypeScriptModule("lib/storage/access-key-storage.ts", {
    "@/lib/db/prisma": { prisma: {} },
  });
  assert.equal(
    scopedStorage.resolveAccessKeyStoragePath("hero-batch/example.png", "owner-a"),
    path.join("hero-batch", "owner-a", "example.png"),
  );
  assert.equal(
    scopedStorage.resolveAccessKeyStoragePath("hero-batch/templates/shared.png", "owner-a"),
    "hero-batch/templates/shared.png",
  );

  for (const assetRoute of [
    "app/api/assets/[id]/route.ts",
    "app/api/assets/[id]/score/route.ts",
    "app/api/assets/[id]/set-main/route.ts",
    "app/api/assets/[id]/reorder/route.ts",
  ]) {
    assert.match(read(assetRoute), /authorizeAssetRequest/, `${assetRoute} must verify project ownership`);
  }
  assert.match(read("app/api/hero-batch/route.ts"), /authorizeProjectRequest\(request, parsed\.sourceProjectId\)/);
  assert.match(read("app/api/hero-batch/history/route.ts"), /scopedStorageRelativePath/);
  assert.match(read("app/api/hero-batch/export/route.ts"), /resolveAccessKeyStoragePath/);
  for (const heroRoute of [
    "app/api/hero-product-assets/route.ts",
    "app/api/hero-scenes/route.ts",
    "app/api/hero-copies/route.ts",
    "app/api/hero-scene-generations/route.ts",
    "app/api/hero-scene-variants/route.ts",
    "app/api/hero-scene-exports/route.ts",
    "app/api/hero-workflows/route.ts",
    "app/api/hero-workflows/[id]/route.ts",
  ]) {
    assert.match(
      read(heroRoute),
      /requireAuthenticatedAccessKeyId/,
      `${heroRoute} must bind legacy Hero data to the authenticated access key`,
    );
  }
  for (const heroService of [
    "lib/services/hero-product-asset-service.ts",
    "lib/services/hero-scene-service.ts",
    "lib/services/hero-copy-service.ts",
    "lib/services/hero-white-bg-service.ts",
    "lib/services/hero-scene-generation-service.ts",
    "lib/services/hero-scene-variant-service.ts",
    "lib/services/hero-scene-export-service.ts",
    "lib/services/hero-workflow-engine.ts",
  ]) {
    assert.match(read(heroService), /accessKeyId/, `${heroService} must retain access-key ownership`);
  }
  assert.match(read("lib/storage/access-key-storage.ts"), /"hero-scene"/);
  const heroScopeMigration = read("prisma/migrations/20260727113000_scope_legacy_hero_data/migration.sql");
  for (const table of [
    "HeroSceneGeneration",
    "HeroWhiteBgImage",
    "HeroProductAsset",
    "HeroSceneExport",
    "HeroWorkflow",
    "HeroSceneLibrary",
    "HeroCopyLibrary",
  ]) {
    assert.match(heroScopeMigration, new RegExp(`ALTER TABLE "${table}" ADD COLUMN "accessKeyId"`));
  }

  const provider = read("lib/services/provider-service.ts");
  assert.match(provider, /apiKeyEncrypted: _encryptedSecret/);
  const generation = read("lib/services/generation-service.ts");
  assert.ok(
    generation.includes("provider request failed \\(5\\d\\d\\)"),
    "provider 5xx errors must not trigger model fallback",
  );
  assert.doesNotMatch(generation, /Low score detected, auto-retrying/);
  const adapter = read("lib/ai/adapters/openai-compatible.ts");
  assert.match(adapter, /"Idempotency-Key"/);
  assert.match(adapter, /response\.status === 429 \|\| response\.status >= 500/);

  const migration = read("prisma/migrations/20260727090000_add_generation_idempotency/migration.sql");
  assert.match(migration, /UNIQUE INDEX[\s\S]*projectId[\s\S]*idempotencyKey/i);
  const prismaRuntime = read("lib/db/prisma.ts");
  assert.match(prismaRuntime, /process\.uptime\(\)/, "startup recovery must use the actual process boot time");
  assert.match(prismaRuntime, /startedAt: \{ lt: PROCESS_STARTED_AT \}/);

  const sanitizer = loadTypeScriptModule("scripts/sanitize-standalone.cjs");
  assert.deepEqual(
    [...sanitizer.ALLOWED_ROOT_ENTRIES].sort(),
    [".next", "node_modules", "package.json", "server.js"].sort(),
    "standalone root must use a strict allowlist",
  );

  console.log("Production security and recovery contract checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
