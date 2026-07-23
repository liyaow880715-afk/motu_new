const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const expect = (condition, message) => assert.ok(condition, message);
const loadTypeScriptModule = (relativePath) => {
  const ts = require("typescript");
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "module", "require", output)(loaded.exports, loaded, require);
  return loaded.exports;
};

const capabilityDetector = loadTypeScriptModule("lib/ai/capability-detector.ts");
const modelMatcher = loadTypeScriptModule("lib/ai/model-matcher.ts");
const detectedTextModels = capabilityDetector.normalizeDetectedModels([
  { id: "gpt-4o-audio-preview" },
  { id: "gpt-4o-realtime-preview" },
  { id: "gpt-5.6-sol" },
]);
expect(
  capabilityDetector.detectModelCapabilities("gpt-5.6-sol").vision,
  "gpt-5.6-sol must be recognized as vision-capable",
);
expect(
  !capabilityDetector.detectModelCapabilities("gpt-4o-audio-preview").vision,
  "audio preview models must not be recognized as vision-capable",
);
expect(
  !capabilityDetector.detectModelCapabilities("gpt-4o-realtime-preview").vision,
  "realtime preview models must not be recognized as vision-capable",
);
expect(
  modelMatcher.recommendDefaultModels(detectedTextModels).analysisModelId === "gpt-5.6-sol",
  "analysis recommendation must prefer gpt-5.6-sol over audio/realtime models",
);

const heroRoute = read("app/api/hero-batch/route.ts");
expect(heroRoute.includes('status: "unscored"'), "hero QC must expose an unscored state");
expect(!heroRoute.includes("pass: true, score: 100"), "hero QC must not fail open as a perfect score");
expect(heroRoute.includes("referenceImages: productReferences.map"), "hero QC must compare against product references");

const heroAnalyzeRoute = read("app/api/hero-batch/analyze/route.ts");
expect(heroAnalyzeRoute.includes("defaultAnalysisModel &&"), "hero analysis must honor the selected analysis model");
expect(!heroAnalyzeRoute.includes("provider.models[0]?.modelId"), "hero analysis must not fall back to an arbitrary model");
expect(heroAnalyzeRoute.includes("timeoutMs: 300000"), "hero analysis must allow slow vision models to finish");

const qualityService = read("lib/services/image-quality-service.ts");
for (const field of [
  "productFidelityScore",
  "packagingFidelityScore",
  "factualityScore",
  "complianceScore",
  "thumbnailScore",
  "ocrScore",
]) {
  expect(qualityService.includes(field), `quality score is missing ${field}`);
}

const paletteUi = read("components/planner/planner-workspace.tsx");
expect(paletteUi.includes('"safe", "contrast", "bold"'), "palette UI must expose all three modes");
const paletteApi = read("app/api/projects/[id]/plans/[planId]/palette/route.ts");
expect(paletteApi.includes('"safe", "contrast", "bold"'), "palette API must accept contrast mode");

const variantService = read("lib/services/hero-scene-variant-service.ts");
const productAssetService = read("lib/services/hero-product-asset-service.ts");
expect(!variantService.includes("hero-variant-compose.py"), "scene variants must not call local Python composition");
expect(!productAssetService.includes("hero-product-asset-compose.py"), "product assets must not call local Python composition");
expect(variantService.includes('generatedBy: "ai-image-api"'), "scene variants must record AI generation provenance");
expect(productAssetService.includes('generatedBy: "ai-image-api"'), "product assets must record AI generation provenance");

const migration = read("prisma/migrations/20260723160000_add_quality_fidelity_scores/migration.sql");
expect(migration.includes('"ocrScore"'), "quality score migration must include OCR field");

console.log("AI commerce contract checks passed");
