const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const expect = (condition, message) => assert.ok(condition, message);

const heroRoute = read("app/api/hero-batch/route.ts");
expect(heroRoute.includes('status: "unscored"'), "hero QC must expose an unscored state");
expect(!heroRoute.includes("pass: true, score: 100"), "hero QC must not fail open as a perfect score");
expect(heroRoute.includes("referenceImages: productReferences.map"), "hero QC must compare against product references");

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
