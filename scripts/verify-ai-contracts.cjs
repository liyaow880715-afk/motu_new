const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const expect = (condition, message) => assert.ok(condition, message);
const loadTypeScriptModule = (relativePath, overrides = {}) => {
  const ts = require("typescript");
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (moduleId) => overrides[moduleId] ?? require(moduleId);
  new Function("exports", "module", "require", output)(loaded.exports, loaded, localRequire);
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
expect(heroRoute.includes("sceneName: job?.sceneName"), "batch title generation must receive the selected scene name");
expect(heroRoute.includes("sceneStyle: job?.style"), "batch title generation must receive the selected scene direction");
expect(heroRoute.includes("factClaims: parsed.factClaims"), "batch title generation must receive the verified fact whitelist");
expect(heroRoute.includes("selectHeroCopyCandidate(parsedResult, input)"), "batch titles must use scored candidate selection");
expect(heroRoute.includes('reference.role === "uploaded-primary"'), "standalone batch generation must use the primary upload as a fidelity base");
expect(heroRoute.includes("if (manualHeadline && !isDisclaimerHeroCopy(manualHeadline))"), "approved batch titles must skip redundant per-image copy generation");

const heroAngles = loadTypeScriptModule("lib/ai/prompts/hero-angles.ts");
const heroCopyPrompt = heroAngles.buildHeroCopyPrompt({
  productName: "猪肉白菜蒸饺",
  productDescription: "薄皮大馅，适合平底锅煎制",
  angle: "SCENE_PAYOFF",
  sceneName: "周末早餐",
  sceneStyle: "晨光厨房，平底锅刚出锅",
  factClaims: ["猪肉白菜馅", "450g"],
  headlineMaxChars: 12,
  sublineMaxChars: 16,
});
expect(heroCopyPrompt.systemPrompt.includes("恰好3个明显不同的候选"), "batch copy must generate three distinct candidates");
expect(heroCopyPrompt.systemPrompt.includes("沿用成熟电商广告的写法"), "batch copy must follow the legacy commerce-copy strategy");
expect(heroCopyPrompt.systemPrompt.includes("不要强行套用统一的“特征+利益”句式"), "batch copy must preserve creative language variety");
expect(heroCopyPrompt.systemPrompt.includes("不要改成下单、备货、选购、看规格或物流场景"), "scene-payoff copy must preserve the selected consumption scene");
expect(heroCopyPrompt.systemPrompt.includes("必须直接复用营销事实白名单中的原文"), "batch sublines must be grounded in supplied facts");
expect(heroCopyPrompt.userPrompt.includes("当前场景：周末早餐"), "batch copy prompt must include scene context");
expect(heroCopyPrompt.userPrompt.includes("场景视觉：晨光厨房，平底锅刚出锅"), "batch copy prompt must include scene art direction");
expect(heroCopyPrompt.userPrompt.includes("营销事实白名单：猪肉白菜馅；450g"), "batch copy prompt must include verified facts");

const selectedHeroCopy = heroAngles.selectHeroCopyCandidate({
  candidates: [
    {
      headline: "这一刻刚好需要",
      subline: "",
      sceneDirective: "通用氛围",
      emphasis: "这一刻",
      lineBreakAfter: "这一刻",
      productSpecificityScore: 100,
      conversionScore: 100,
      factGroundingScore: 100,
      thumbnailReadabilityScore: 100,
    },
    {
      headline: "煎出脆底爆汁饺",
      subline: "以包装标示为准",
      sceneDirective: "早餐桌边夹起一只煎饺，露出真实馅料",
      emphasis: "爆汁",
      lineBreakAfter: "煎出",
      productSpecificityScore: 88,
      conversionScore: 90,
      factGroundingScore: 86,
      thumbnailReadabilityScore: 92,
    },
    {
      headline: "猪肉白菜馅更足",
      subline: "450g",
      sceneDirective: "包装与成品同框",
      emphasis: "白菜馅",
      lineBreakAfter: "猪肉",
      productSpecificityScore: 76,
      conversionScore: 72,
      factGroundingScore: 80,
      thumbnailReadabilityScore: 74,
    },
  ],
}, { angle: "SCENE_PAYOFF", headlineMaxChars: 12, sublineMaxChars: 16, factClaims: ["以包装标示为准"] });
expect(selectedHeroCopy?.headline === "煎出脆底爆汁饺", "candidate selection must reject a higher-scored generic slogan");
expect(selectedHeroCopy?.subline === "", "candidate selection must keep packaging disclaimers out of the selling-point subline");
expect(selectedHeroCopy?.complianceNote === "以包装标示为准", "candidate selection must preserve a supplied disclaimer as a compliance note");
expect(selectedHeroCopy?.emphasis === "爆汁", "candidate selection must preserve a valid emphasis phrase");
expect(selectedHeroCopy?.lineBreakAfter === "煎出", "candidate selection must preserve a valid semantic line break");
expect(!heroAngles.isDisclaimerHeroCopy("包装标示果汁含量100%"), "a packaging-qualified fact must not be copied into every compliance note");
expect(heroAngles.isDisclaimerHeroCopy("以包装标示为准"), "a true packaging disclaimer must remain a compliance note");
expect(
  heroAngles.selectHeroCopyCandidate({
    candidates: [
      { headline: "这一刻刚好需要" },
      { headline: "融入日常好体验" },
      { headline: "品质之选正当时" },
    ],
  }, { angle: "PRODUCT_MEMORY" }) === null,
  "candidate selection must reject an all-generic result instead of picking the least bad slogan",
);
expect(heroAngles.isGenericHeroHeadline("三款云饺均为240g"), "numeric inventory headlines must be rejected as hooks");
expect(heroAngles.isGenericHeroHeadline("五项营养数据可查"), "data-availability headlines must be rejected as hooks");
expect(heroAngles.isGenericHeroHeadline("选好口味再下单"), "administrative CTA headlines must be rejected as hooks");
expect(!heroAngles.isGenericHeroHeadline("不用解冻直接下锅"), "a concrete friction-relief hook must remain valid");
expect(heroAngles.isGenericCommerceHeadline("小青桔汁≥10%"), "a bare numeric fact must not be accepted as the purchase hook");
expect(heroAngles.isGenericCommerceHeadline("规格参数"), "an internal module label must not be accepted as marketing copy");
const usedEvidenceKeys = new Set(["小青桔汁≥10%"]) ;
const selectedDetailTitle = heroAngles.selectCommerceTitleCandidate({
  candidates: [
    {
      headline: "青桔含量一眼看清",
      subline: "小青桔汁≥10%",
      evidenceKey: "小青桔汁≥10%",
      productSpecificityScore: 95,
      conversionScore: 90,
      factGroundingScore: 95,
      thumbnailReadabilityScore: 90,
    },
    {
      headline: "酸甜一口更醒味",
      subline: "",
      evidenceKey: "",
      productSpecificityScore: 88,
      conversionScore: 92,
      factGroundingScore: 85,
      thumbnailReadabilityScore: 92,
    },
  ],
}, {
  factClaims: ["小青桔汁≥10%"],
  usedEvidenceKeys,
});
expect(selectedDetailTitle?.headline === "酸甜一口更醒味", "page title selection must reserve a verified fact for only one primary hook");
const normalizedEvidenceTitle = heroAngles.selectCommerceTitleCandidate({
  candidates: [{
    headline: "一升装更适合分享",
    subline: "净含量1L",
    evidenceKey: "净含量1L",
    productSpecificityScore: 90,
    conversionScore: 88,
    factGroundingScore: 95,
    thumbnailReadabilityScore: 90,
  }],
}, { factClaims: ["净含量：1L"] });
expect(
  normalizedEvidenceTitle?.headline === "一升装更适合分享" && normalizedEvidenceTitle.subline === "净含量1L",
  "fact matching must tolerate punctuation differences without weakening numeric grounding",
);
const decimalEvidenceTitle = heroAngles.selectCommerceTitleCandidate({
  candidates: [{ headline: "每杯糖量有依据", subline: "糖8.5克/100毫升", evidenceKey: "糖8.5克/100毫升" }],
}, { factClaims: ["糖：8.5克/100毫升"] });
expect(decimalEvidenceTitle?.evidenceKey.includes("8.5"), "fact normalization must preserve decimal points");
expect(
  heroAngles.selectHeroCopyCandidate({
    candidates: [
      { headline: "下单看准450g", sceneDirective: "下单确认包装规格信息" },
      { headline: "备货选450g规格", sceneDirective: "备货时查看包装信息" },
      { headline: "用前先看450g", sceneDirective: "用前聚焦包装上的规格" },
    ],
  }, { angle: "SCENE_PAYOFF" }) === null,
  "scene-payoff selection must reject numeric, ordering, and stocking headlines",
);
expect(
  heroAngles.selectHeroCopyCandidate({
    candidates: [
      { headline: "商品事实无法识别" },
      { headline: "场景内容待补充" },
      { headline: "暂不能生成标题" },
    ],
  }, { angle: "PRODUCT_MEMORY" }) === null,
  "candidate selection must reject model error messages and placeholders",
);
const ungroundedSublineCopy = heroAngles.selectHeroCopyCandidate({
  candidates: [{
    headline: "猪肉白菜蒸饺",
    subline: "家庭餐桌常备",
    productSpecificityScore: 90,
    conversionScore: 85,
    factGroundingScore: 30,
    thumbnailReadabilityScore: 90,
  }],
}, { angle: "PRODUCT_MEMORY", factClaims: ["净含量450g"] });
expect(ungroundedSublineCopy?.subline === "", "candidate selection must remove a subline that is absent from the fact whitelist");
const selectedHeroInstruction = heroAngles.buildHeroAngleImageInstruction(selectedHeroCopy);
expect(selectedHeroInstruction.includes("主文案逐字锁定"), "selected batch copy must be locked verbatim for image generation");
expect(selectedHeroInstruction.includes("优先突出「爆汁」"), "selected batch copy must carry flexible emphasis art direction");
expect(selectedHeroInstruction.includes("「煎出」/「脆底爆汁饺」"), "selected batch copy must carry its exact line break");
expect(selectedHeroInstruction.includes("只在画面底部角落以最小可读字号"), "batch compliance copy must render only as unobtrusive corner text");
expect(selectedHeroInstruction.includes("允许通过大字、错落层级、色彩和留白形成冲击力"), "batch image direction must allow expressive legacy-style typography");
expect(selectedHeroInstruction.includes("不固定居中和单一占比"), "batch image direction must not force one centered template");

const heroAnalyzeRoute = read("app/api/hero-batch/analyze/route.ts");
expect(heroAnalyzeRoute.includes("defaultAnalysisModel &&"), "hero analysis must honor the selected analysis model");
expect(!heroAnalyzeRoute.includes("provider.models[0]?.modelId"), "hero analysis must not fall back to an arbitrary model");
expect(heroAnalyzeRoute.includes("timeoutMs: 300000"), "hero analysis must allow slow vision models to finish");
expect(heroAnalyzeRoute.includes("generateStructured"), "hero analysis must use structured output parsing and repair");
expect(heroAnalyzeRoute.includes("INVALID_ANALYSIS_PAYLOAD"), "hero analysis must report truncated image payloads clearly");
expect(heroAnalyzeRoute.includes("factClaims,"), "standalone hero analysis must return its verified fact whitelist");

const heroScenesRoute = read("app/api/hero-batch/scenes/route.ts");
expect(heroScenesRoute.includes("HERO_ANGLE_IDS.map"), "scene planning must cover every supported hero angle");
expect(heroScenesRoute.includes('"angleCopies"'), "scene planning must return reviewable main and secondary copy");
expect(heroScenesRoute.includes("scenes.length !== parsed.groupCount"), "scene planning must preserve the requested group count");
expect(heroScenesRoute.includes('operation: "hero_batch_scene_planning"'), "batch scene planning must be identifiable in provider monitoring");

const heroBatchPage = read("app/hero-batch/page.tsx");
expect(heroBatchPage.includes("不使用历史项目，仅上传参考图"), "batch hero projects must be optional");
expect(heroBatchPage.includes("handleAnalyze"), "standalone batch hero flow must analyze uploaded references");
expect(heroBatchPage.includes("updateSceneCopy"), "planned batch titles must be editable before image generation");
expect(heroBatchPage.includes("productImageRoles"), "analyzed upload roles must reach image generation");
expect(heroBatchPage.includes("updateImageRole") && heroBatchPage.includes('value="包装/标签"'), "standalone reference roles must be manually reviewable");
expect(heroBatchPage.includes("analysis.specs?.length"), "standalone batch planning must retain multi-spec analysis");

const productAnalyzePage = read("app/product-analyze/page.tsx");
expect(productAnalyzePage.includes("prepareProductAnalysisImage"), "product analysis must optimize browser images before upload");
expect(productAnalyzePage.includes("PRODUCT_ANALYSIS_MAX_IMAGES"), "product analysis must cap the image count");

const nextConfig = read("next.config.mjs");
expect(nextConfig.includes('middlewareClientMaxBodySize: "32mb"'), "Next.js must accept optimized multi-image analysis payloads");

const planningPrompt = read("lib/ai/prompts/planning.ts");
expect(planningPrompt.includes('"visualMode":"poster"'), "section planning must emit an explicit visual mode");
expect(
  planningPrompt.includes("A lifestyle_scene must specify setting"),
  "section planning must define lifestyle-scene requirements",
);
expect(
  planningPrompt.includes("Do not output markdown, explanations, alternative candidates, scores"),
  "section planning must keep the provider response compact",
);
expect(
  planningPrompt.includes("All sections are one campaign") && planningPrompt.includes("while varying composition"),
  "section planning must retain campaign consistency without freezing composition",
);
expect(
  planningPrompt.includes("Sensory, scene, and emotional hooks do not require a claimSource"),
  "lifestyle planning must support scene-led legacy commerce copy",
);
expect(
  planningPrompt.includes("Grab -> Empathize -> Trust -> Convert") && planningPrompt.includes("strongest purchase hook"),
  "section planning must use the legacy benefit, scene, trust, and differentiation strategy",
);
expect(
  planningPrompt.includes("finished product advertising, not a planning report") && planningPrompt.includes("generic slogans"),
  "detail planning must reject generic and administrative headlines",
);
expect(
  planningPrompt.includes("Do not repeat the same headline or scene") && planningPrompt.includes("may reuse a verified product fact"),
  "section planning must prevent repeated hooks without suppressing useful factual support",
);
expect(
  planningPrompt.includes("copy is the primary creative output") &&
    planningPrompt.includes("Do not output mainTitle, subTitle, supportingPoints, titleCandidates, scores"),
  "primary planning output must use the legacy copy channel instead of title candidate scoring",
);
expect(
  planningPrompt.includes("Counts are fixed by the user and must never shrink") && planningPrompt.includes("Return exactly"),
  "planning must preserve the user-selected section count without inventing product facts",
);
expect(
  planningPrompt.includes("Factual copy must be directly supported by verifiedFacts"),
  "planning must ground factual supporting copy",
);
expect(
  planningPrompt.includes("complianceNote is only for a supplied disclosure") && planningPrompt.includes("must never become the headline"),
  "planning must keep compliance disclaimers out of promotional title copy",
);
expect(
  !planningPrompt.includes("set mainTitle and subTitle to empty strings"),
  "lifestyle planning must not suppress useful in-image copy",
);
expect(
  planningPrompt.includes("Hero images need immediate thumbnail impact") && planningPrompt.includes("bold controlled contrast"),
  "section planning must create impact through product, light, color, and typography",
);
expect(
  planningPrompt.includes("Do not use duplicate products, magnifier insets, pointer lines"),
  "hero planning must reject duplicated label proof devices",
);
expect(
  planningPrompt.includes("visualPrompt must begin exactly with 'Primary Prompt: '") && planningPrompt.includes("substantive instructions must be Chinese"),
  "section planning must return Chinese-only primary prompts",
);
expect(
  planningPrompt.includes("Use product/packaging colors as the base") && planningPrompt.includes("one controlled high-impact accent"),
  "section planning must derive a consistent but impactful campaign palette",
);

const plannerServiceSource = read("lib/services/planner-service.ts");
expect(plannerServiceSource.includes("ensureChinesePrimaryPrompt"), "planned section prompts must be normalized to Chinese before saving");
expect(!plannerServiceSource.includes("function ensureBilingualPrompt"), "planned sections must no longer force bilingual prompts");
expect(!plannerServiceSource.includes("\\nEnglish Prompt:"), "fallback section templates must not contain English prompt blocks");
expect(
  plannerServiceSource.includes("isChineseDominant") && plannerServiceSource.includes("latinWordCount"),
  "English-dominant primary prompts must be replaced before saving",
);

const sectionPlanSchema = read("lib/ai/schemas/section-plan.ts");
expect(sectionPlanSchema.includes('"lifestyle_scene"'), "section plan schema must accept lifestyle scenes");
expect(sectionPlanSchema.includes("titleDesignSchema"), "section plan schema must accept title design metadata");
expect(sectionPlanSchema.includes("headlineAngle"), "section plan schema must accept the hero commercial job");
expect(sectionPlanSchema.includes("lineBreakAfter"), "section plan schema must accept an exact title line break");
expect(sectionPlanSchema.includes("complianceNote"), "section plan schema must accept a corner compliance note");
expect(sectionPlanSchema.includes("colorTemperature"), "section plan schema must persist project color temperature");
expect(sectionPlanSchema.includes("contrastLevel"), "section plan schema must persist project contrast level");
expect(sectionPlanSchema.includes("paletteRatio"), "section plan schema must persist project color-area ratio");
expect(sectionPlanSchema.includes("titleCandidateSchema"), "section plan schema must persist scored title candidates");
expect(sectionPlanSchema.includes("blackLevel"), "section plan schema must persist campaign black level");
expect(sectionPlanSchema.includes("mainLightDirection"), "section plan schema must persist main-light direction");

const sectionPlanModule = loadTypeScriptModule("lib/ai/schemas/section-plan.ts");
const tolerantPlan = sectionPlanModule.sectionPlanOutputSchema.parse({
  styleGuide: { colorPalette: { primary: "not-a-hex" } },
  sections: [{
    id: "hero_01",
    type: "hero",
    title: "Hero",
    goal: "Build product memory",
    visualPrompt: "Commercial product photo",
    visualMode: "cinematic",
    funnelStage: "awareness",
    titleDesign: { layout: "unsupported" },
    editableFields: {},
  }],
});
expect(tolerantPlan.sections.length === 1, "invalid optional planning metadata must not trigger a full-output repair");
expect(tolerantPlan.sections[0].visualMode === undefined, "invalid optional visual mode must be discarded locally");
expect(tolerantPlan.sections[0].copy === "", "compact planning responses may omit duplicated copy");

const providerAdapter = read("lib/ai/adapters/openai-compatible.ts");
expect(providerAdapter.includes("gpt[-_.]?5"), "GPT-5 aliases must receive configured reasoning effort");
expect(providerAdapter.includes("body.max_completion_tokens"), "GPT-5 output limits must use max_completion_tokens");
expect(providerAdapter.includes("isOutputTokenLimitCompatibilityError"), "unsupported output token parameters must use a scoped compatibility retry");
expect(providerAdapter.includes("outputTokenLimitIncompatibleModels.add(compatibilityKey)"), "output token compatibility must be remembered per provider and model");
expect(providerAdapter.includes("section_planning_repair") || providerAdapter.includes("${input.monitor.operation}_repair"), "structured repair requests must retain monitor context");

const analysisService = read("lib/services/analysis-service.ts");
expect(analysisService.includes("assetToAnalysisDataUrl"), "analysis images must be optimized before provider upload");
expect(analysisService.includes("Promise.all([baseAnalysisPromise, variantAnalysisPromise])"), "base and variant analysis must run concurrently");

const variantExtractionService = read("lib/services/variant-asset-extraction-service.ts");
expect(variantExtractionService.includes("chunkItems(variantAssetGroups, 4)"), "variant vision extraction must use bounded concurrent batches");

const prismaClient = read("lib/db/prisma.ts");
expect(
  prismaClient.includes("process.uptime()") && prismaClient.includes("startedAt: { lt: PROCESS_STARTED_AT }"),
  "restart recovery must release every task created by the interrupted server process",
);

const generationPrompt = read("lib/ai/prompts/generation.ts");
expect(
  generationPrompt.includes("Lifestyle campaign scene"),
  "image generation must retain legacy scene-led campaign direction",
);
expect(
  generationPrompt.includes('sectionType === "HERO"'),
  "scene detection must support scene-driven hero images",
);
expect(
  generationPrompt.includes("VISIBLE PACKAGING FIDELITY CONTRACT (HIGHEST IDENTITY PRIORITY)"),
  "packaging-enabled sections must use a visible high-fidelity packaging contract",
);
expect(
  generationPrompt.includes("Treat all text already printed on the photographed physical product as immutable image texture"),
  "physical product label text must be preserved as artwork instead of being re-typeset",
);

const referenceResolutionModule = loadTypeScriptModule("lib/services/reference-resolution.ts");
const stableProductInputs = [
  { key: "asset:main", role: "product", assetId: "main", fileName: "main.png", type: "MAIN", url: null },
];
expect(
  referenceResolutionModule.productReferenceInputSignature([
    ...stableProductInputs,
    { key: "style:one", role: "style_anchor", assetId: "style-one", fileName: "style.png", type: "REFERENCE", url: null },
  ]) ===
    referenceResolutionModule.productReferenceInputSignature([
      ...stableProductInputs,
      { key: "template:two", role: "template", assetId: "template-two", fileName: "template.png", type: "REFERENCE", url: null },
    ]),
  "reference confirmation must ignore system-managed style, template, and neighbor changes",
);
expect(
  referenceResolutionModule.productReferenceInputSignature(stableProductInputs) !==
    referenceResolutionModule.productReferenceInputSignature([
      { ...stableProductInputs[0], assetId: "replacement", key: "asset:replacement" },
    ]),
  "reference confirmation must detect user-controlled product reference changes",
);
expect(
  referenceResolutionModule.areProductReferenceInputsConfirmed(
    [
      ...stableProductInputs,
      { key: "asset:angle", role: "product", assetId: "angle", fileName: "angle.png", type: "ANGLE", url: null },
      { key: "asset:detail", role: "product", assetId: "detail", fileName: "detail.png", type: "DETAIL", url: null },
    ],
    [
      ...stableProductInputs,
      { key: "asset:angle", role: "product", assetId: "angle", fileName: "angle.png", type: "ANGLE", url: null },
      { key: "template:auto", role: "template", assetId: "auto-template", fileName: "template.png", type: "REFERENCE", url: null },
    ],
  ),
  "an auto-created template occupying a model slot must not invalidate the product reference confirmation",
);
const referenceDate = new Date("2026-01-01T00:00:00.000Z");
const physicalMainReference = {
  id: "main",
  filePath: "main.png",
  fileName: "main.png",
  mimeType: "image/png",
  type: "MAIN",
  isMain: true,
  variantId: null,
  sortOrder: 0,
  createdAt: referenceDate,
};
const outerPackagingReference = {
  ...physicalMainReference,
  id: "packaging",
  filePath: "packaging.png",
  fileName: "packaging.png",
  type: "PACKAGING",
  isMain: false,
  sortOrder: 1,
};
const packagingResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: { type: "PACKAGING", editableData: { controls: { includePackaging: true } } },
  projectAssets: [physicalMainReference, outerPackagingReference],
  explicitReferenceAssets: [outerPackagingReference],
});
expect(
  packagingResolution.modelProductAssets[0]?.type === "PACKAGING" &&
    packagingResolution.modelProductAssets[1]?.type === "MAIN",
  "packaging generation must make the real package the first high-fidelity reference",
);
const duplicatePackagingResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: { type: "HERO", editableData: { controls: { includePackaging: true } } },
  projectAssets: [
    { ...physicalMainReference, metadata: { sha256: "same-upload" } },
    { ...outerPackagingReference, metadata: { sha256: "same-upload" } },
  ],
  explicitReferenceAssets: [{ ...outerPackagingReference, metadata: { sha256: "same-upload" } }],
});
expect(
  duplicatePackagingResolution.modelProductAssets.map((asset) => asset.id).join(",") === "packaging",
  "identical uploads assigned to main and packaging roles must consume one provider reference slot",
);
const beveragePropResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: {
    type: "HERO",
    visualPrompt: "真实饮料瓶右侧直立，前景放一枚切开的小青桔作为水果道具",
    editableData: { controls: { includePackaging: true } },
  },
  projectAssets: [
    { ...physicalMainReference, metadata: { bytes: 1234 }, fileName: "same.jpg" },
    { ...outerPackagingReference, metadata: { bytes: 1234 }, fileName: "same.jpg" },
    { ...physicalMainReference, id: "angle", type: "ANGLE", isMain: false, fileName: "angle.jpg" },
  ],
  explicitReferenceAssets: [
    { ...outerPackagingReference, metadata: { bytes: 1234 }, fileName: "same.jpg" },
  ],
});
expect(
  beveragePropResolution.modelProductAssets.map((asset) => asset.id).join(",") === "packaging",
  "a cut fruit used as a beverage prop must not trigger product cross-section routing",
);
const heroWithPackagingResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: { type: "HERO", editableData: { controls: { includePackaging: true } } },
  projectAssets: [
    { ...physicalMainReference, variantId: "variant-one" },
    { ...outerPackagingReference, variantId: "variant-one" },
    { ...outerPackagingReference, id: "packaging-two", variantId: "variant-two" },
    { ...physicalMainReference, id: "style-anchor", type: "REFERENCE", variantId: null },
  ],
});
expect(
  heroWithPackagingResolution.modelProductAssets.some((asset) => asset.id === "main") &&
    heroWithPackagingResolution.modelProductAssets.some((asset) => asset.id === "packaging") &&
    !heroWithPackagingResolution.modelProductAssets.some((asset) => asset.id === "packaging-two"),
  "system-generated anchors must not block the real product and matching packaging references",
);
const baseWithVariantPackagingResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: { type: "HERO", editableData: { variantScope: "base", controls: { includePackaging: true } } },
  projectAssets: [
    { ...physicalMainReference, id: "base-product", variantId: null },
    { ...outerPackagingReference, id: "variant-packaging", variantId: "variant-one" },
  ],
});
expect(
  baseWithVariantPackagingResolution.modelProductAssets.some((asset) => asset.id === "variant-packaging") &&
    baseWithVariantPackagingResolution.packagingAssets.length === 1,
  "base sections that require packaging must include a variant-scoped packaging asset in the provider inputs",
);
const crossSectionResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: {
    type: "HERO",
    title: "玉米款差异卖点",
    goal: "展示包装正面与剖面馅料同框",
    copy: "",
    visualPrompt: "包装正面与剖面馅料同框",
    editableData: { controls: { includePackaging: true } },
  },
  projectAssets: [
    { ...physicalMainReference, id: "whole", fileName: "4.png", sortOrder: 0 },
    { ...physicalMainReference, id: "cut-one", fileName: "1.png", sortOrder: 1 },
    { ...physicalMainReference, id: "cut-two", fileName: "2.png", sortOrder: 2 },
    { ...outerPackagingReference, id: "packaging-corn", fileName: "packaging.jpg", sortOrder: 3 },
  ],
});
expect(
  crossSectionResolution.modelProductAssets.map((asset) => asset.id).join(",") ===
    "packaging-corn,whole,cut-one,cut-two",
  "cross-section sections must retain the package plus additional product evidence images",
);
const groupCrossSectionResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: {
    type: "COMPARISON",
    title: "两款包装与横切面对照",
    goal: "每款包装与切开的馅料同框",
    copy: "",
    visualPrompt: "两款包装下方分别展示剖面",
    editableData: {
      controls: { includePackaging: true },
      variantScope: "group",
      variantIds: ["variant-one", "variant-two"],
    },
  },
  projectAssets: [
    { ...outerPackagingReference, id: "pack-one", variantId: "variant-one" },
    { ...physicalMainReference, id: "whole-one", variantId: "variant-one", sortOrder: 1 },
    { ...physicalMainReference, id: "cut-one", variantId: "variant-one", sortOrder: 2 },
    { ...outerPackagingReference, id: "pack-two", variantId: "variant-two", sortOrder: 3 },
    { ...physicalMainReference, id: "whole-two", variantId: "variant-two", sortOrder: 4 },
    { ...physicalMainReference, id: "cut-two", variantId: "variant-two", sortOrder: 5 },
  ],
});
expect(
  groupCrossSectionResolution.modelProductAssets.map((asset) => asset.id).join(",") ===
    "pack-one,cut-one,pack-two,cut-two",
  "group cross-section sections must send packaging and one cut-open evidence image for every variant",
);
const ambiguousBaseCrossSectionResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: {
    type: "HERO",
    title: "系列横切面",
    goal: "展示剖面馅料",
    copy: "",
    visualPrompt: "用横切面证明馅料",
    editableData: { controls: { includePackaging: true }, variantScope: "base" },
  },
  projectAssets: [
    { ...physicalMainReference, id: "whole-one", variantId: "variant-one", sortOrder: 0 },
    { ...physicalMainReference, id: "cross-one", fileName: "韭菜横切面.png", variantId: "variant-one", sortOrder: 1 },
    { ...outerPackagingReference, id: "pack-one", variantId: "variant-one", sortOrder: 2 },
    { ...physicalMainReference, id: "whole-two", variantId: "variant-two", sortOrder: 3 },
    { ...physicalMainReference, id: "cross-two", fileName: "玉米横切面.png", variantId: "variant-two", sortOrder: 4 },
    { ...outerPackagingReference, id: "pack-two", variantId: "variant-two", sortOrder: 5 },
  ],
});
expect(
  ambiguousBaseCrossSectionResolution.modelProductAssets.map((asset) => asset.id).join(",") ===
    "pack-one,whole-one",
  "an ambiguous base section must not borrow one variant's cross-section automatically",
);
const explicitVariantCrossSectionResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: {
    type: "HERO",
    title: "指定口味横切面",
    goal: "展示剖面馅料",
    copy: "",
    visualPrompt: "用横切面证明馅料",
    editableData: { controls: { includePackaging: true }, variantScope: "base" },
  },
  projectAssets: [
    { ...physicalMainReference, id: "whole-one", variantId: "variant-one", sortOrder: 0 },
    { ...physicalMainReference, id: "cross-one", fileName: "韭菜横切面.png", variantId: "variant-one", sortOrder: 1 },
    { ...outerPackagingReference, id: "pack-one", variantId: "variant-one", sortOrder: 2 },
    { ...physicalMainReference, id: "whole-two", variantId: "variant-two", sortOrder: 3 },
    { ...physicalMainReference, id: "cross-two", fileName: "玉米横切面.png", variantId: "variant-two", sortOrder: 4 },
    { ...outerPackagingReference, id: "pack-two", variantId: "variant-two", sortOrder: 5 },
  ],
  explicitReferenceAssets: [
    { ...physicalMainReference, id: "cross-two", fileName: "玉米横切面.png", variantId: "variant-two", sortOrder: 4 },
  ],
});
expect(
  explicitVariantCrossSectionResolution.modelProductAssets.map((asset) => asset.id).join(",") ===
    "pack-two,cross-two,whole-two",
  "an explicitly selected cross-section must retain the matching variant product and packaging",
);
expect(
  explicitVariantCrossSectionResolution.authoritativeCrossSectionAssetIds.join(",") === "cross-two",
  "an explicitly selected cross-section must be exposed as the authoritative geometry source",
);
const unnamedExplicitCrossSectionResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: {
    type: "HERO",
    title: "韭菜猪肉露馅特写",
    goal: "展示自然掰开的馅料",
    copy: "",
    visualPrompt: "用真实露馅商品证明馅料",
    editableData: { controls: { includePackaging: true } },
  },
  projectAssets: [
    { ...physicalMainReference, id: "whole-chive", fileName: "whole.png", sortOrder: 0 },
    { ...physicalMainReference, id: "manual-cut", fileName: "IMG_20260723.png", isMain: false, sortOrder: 1 },
    { ...physicalMainReference, id: "auto-cut", fileName: "另一张横切面.png", isMain: false, sortOrder: 2 },
    { ...outerPackagingReference, id: "pack-chive", sortOrder: 3 },
    { ...physicalMainReference, id: "ingredient-chive", fileName: "配料标签.png", type: "INGREDIENT", isMain: false, sortOrder: 4 },
  ],
  explicitReferenceAssets: [
    { ...physicalMainReference, id: "manual-cut", fileName: "IMG_20260723.png", isMain: false, sortOrder: 1 },
  ],
});
expect(
  unnamedExplicitCrossSectionResolution.modelProductAssets.map((asset) => asset.id).join(",") ===
    "pack-chive,manual-cut,whole-chive" &&
    !unnamedExplicitCrossSectionResolution.modelProductAssets.some(
      (asset) => asset.id === "auto-cut" || asset.id === "ingredient-chive",
    ),
  "a manually selected unnamed cross-section must suppress other automatic cross-section and label evidence",
);
expect(
  unnamedExplicitCrossSectionResolution.authoritativeCrossSectionAssetIds.join(",") === "manual-cut",
  "manual selection order must identify the unnamed cross-section authority",
);
const explicitGroupCrossSectionResolution = referenceResolutionModule.resolveSectionReferenceAssets({
  section: {
    type: "COMPARISON",
    title: "两款包装与横切面对照",
    goal: "每款包装与切开的馅料同框",
    copy: "",
    visualPrompt: "两款包装下方分别展示剖面",
    editableData: {
      controls: { includePackaging: true },
      variantScope: "group",
      variantIds: ["variant-one", "variant-two"],
    },
  },
  projectAssets: [
    { ...outerPackagingReference, id: "group-pack-one", variantId: "variant-one" },
    { ...physicalMainReference, id: "group-cut-one", fileName: "one.png", variantId: "variant-one", sortOrder: 1 },
    { ...physicalMainReference, id: "group-alt-one", fileName: "one横切面.png", variantId: "variant-one", sortOrder: 2 },
    { ...outerPackagingReference, id: "group-pack-two", variantId: "variant-two", sortOrder: 3 },
    { ...physicalMainReference, id: "group-cut-two", fileName: "two.png", variantId: "variant-two", sortOrder: 4 },
    { ...physicalMainReference, id: "group-alt-two", fileName: "two横切面.png", variantId: "variant-two", sortOrder: 5 },
  ],
  explicitReferenceAssets: [
    { ...physicalMainReference, id: "group-cut-one", fileName: "one.png", variantId: "variant-one", sortOrder: 1 },
    { ...physicalMainReference, id: "group-cut-two", fileName: "two.png", variantId: "variant-two", sortOrder: 4 },
  ],
});
expect(
  explicitGroupCrossSectionResolution.modelProductAssets.map((asset) => asset.id).join(",") ===
    "group-pack-one,group-cut-one,group-pack-two,group-cut-two",
  "group generation must keep one manually selected cross-section per variant and suppress alternates",
);
expect(
  explicitGroupCrossSectionResolution.authoritativeCrossSectionAssetIds.join(",") ===
    "group-cut-one,group-cut-two",
  "group generation must expose one authoritative cross-section id per variant",
);

const generationPromptModule = loadTypeScriptModule("lib/ai/prompts/generation.ts", {
  "@/lib/utils/content-language": {
    contentLanguageNamesForPrompt: { "zh-CN": "Simplified Chinese" },
    normalizeContentLanguage: (value) => value || "zh-CN",
  },
});
const sceneHeroPrompt = generationPromptModule.buildSectionImagePrompt({
  type: "HERO",
  title: "场景氛围头图",
  goal: "展示真实饮用场景",
  copy: "清爽随时享用",
  visualPrompt: "Lifestyle use scene at a summer picnic with a hand opening the drink.",
  editableData: {
    visualMode: "lifestyle_scene",
    mainTitle: "清爽随时享用",
    subTitle: "小青桔汁≥10%",
    complianceNote: "以包装标示为准",
    titleDesign: {
      layout: "minimal_caption",
      alignment: "left",
      placement: "upper_left",
      emphasis: "清爽",
      lineBreakAfter: "清爽",
      maxLines: 2,
      panelStyle: "none",
    },
  },
}, [], "1:1", "zh-CN", {
  paletteStyle: "bold",
  colorPalette: {
    background: "#312A26",
    primary: "#E8DCC4",
    secondary: "#A89F91",
    accent: "#C9A227",
    text: "#FFFFFF",
  },
  visualSystem: {
    lighting: "warm top-left key light",
    colorTemperature: "warm-neutral 4300K",
    exposure: "controlled mid-key exposure",
    contrastLevel: "high contrast with detailed shadows",
    paletteRatio: "70% background/base, 20% primary/support, maximum 10% accent",
    shadowStyle: "deep soft shadows",
  },
});
expect(
  sceneHeroPrompt.includes("Lifestyle campaign scene"),
  "scene-driven hero prompt must include the legacy campaign-scene direction",
);
expect(
  sceneHeroPrompt.includes("layered depth"),
  "scene-driven hero prompt must require environmental depth",
);
expect(
  sceneHeroPrompt.includes('headline "清爽随时享用" and subline "小青桔汁≥10%"'),
  "lifestyle generation must retain the planned legacy headline hierarchy",
);
expect(
  !sceneHeroPrompt.includes('headline "以包装标示为准"'),
  "compliance disclaimers must never become the lifestyle headline",
);
expect(
  sceneHeroPrompt.includes('Render the exact compliance note "以包装标示为准" once as unobtrusive small text in a bottom corner'),
  "compliance disclaimers must be preserved as unobtrusive corner text",
);
expect(
  !sceneHeroPrompt.includes("free of marketing headlines") && !sceneHeroPrompt.includes("Do not render a headline"),
  "lifestyle scenes must allow one concise designed headline",
);
expect(
  sceneHeroPrompt.includes("Every quoted character must remain exact and appear only once"),
  "lifestyle copy must be locked against model paraphrasing",
);
expect(
  sceneHeroPrompt.includes('Give "清爽" a clear but tasteful emphasis'),
  "lifestyle typography must render the selected emphasis with clear hierarchy",
);
expect(
  sceneHeroPrompt.includes('Break the exact headline only as "清爽" / "随时享用"'),
  "lifestyle typography must preserve the planned semantic line break",
);
expect(
  sceneHeroPrompt.includes("finished campaign artwork, not a small caption or software template"),
  "lifestyle typography must retain expressive legacy commercial styling",
);
expect(
  sceneHeroPrompt.includes("Show one physical product only"),
  "single-product lifestyle scenes must reject duplicate products",
);
expect(
  sceneHeroPrompt.includes("distinctive location, camera height, lens perspective, foreground occlusion, depth, subject action, and product placement"),
  "lifestyle scenes must allow varied high-impact composition",
);
expect(
  sceneHeroPrompt.includes("Tone lock: keep the campaign color temperature, material response, black level, and highlight character recognizable"),
  "lifestyle scenes must retain the project-wide tone lock",
);
expect(
  sceneHeroPrompt.includes("Single visible-copy contract") && !sceneHeroPrompt.includes("Section copy: 清爽随时享用"),
  "generation must use one visible-copy contract instead of competing raw section copy",
);
expect(
  sceneHeroPrompt.length < 6000,
  `lifestyle prompt must remain focused enough for reliable execution (actual ${sceneHeroPrompt.length} chars)`,
);
const posterHeroPrompt = generationPromptModule.buildSectionImagePrompt({
  type: "HERO",
  title: "核心卖点头图",
  goal: "突出核心购买理由",
  copy: "核心卖点",
  visualPrompt: "Centered studio poster with a concise headline.",
  editableData: {
    visualMode: "poster",
    mainTitle: "Juice content >=10%",
    subTitle: "330 mL bottle",
    titleDesign: {
      layout: "split_level",
      alignment: "left",
      placement: "upper_left",
      emphasis: ">=10%",
      maxLines: 2,
      panelStyle: "none",
    },
    commerceBrief: {
      proofDevice: "标签含量文字局部放大，保留瓶身边界作为出处参照。",
      textBudget: { headlineMaxChars: 12, sublineMaxChars: 16, badgeCount: 0, ctaAllowed: false },
    },
  },
}, [], "1:1", "zh-CN", {
  paletteStyle: "bold",
  colorPalette: {
    background: "#312A26",
    primary: "#E8DCC4",
    secondary: "#A89F91",
    accent: "#C9A227",
    text: "#FFFFFF",
  },
  visualSystem: {
    lighting: "warm top-left key light",
    colorTemperature: "warm-neutral 4300K",
    exposure: "controlled mid-key exposure",
    contrastLevel: "high contrast with detailed shadows",
    paletteRatio: "70% background/base, 20% primary/support, maximum 10% accent",
    shadowStyle: "deep soft shadows",
  },
});
expect(
  !posterHeroPrompt.includes("Lifestyle campaign scene"),
  "poster hero prompt must not be forced into lifestyle-scene mode",
);
expect(
  posterHeroPrompt.includes('Render one designed title group containing headline "Juice content >=10%" and subline "330 mL bottle"'),
  "poster generation must retain one exact but creatively designed title group",
);
expect(
  (posterHeroPrompt.match(/Juice content >=10%/g) ?? []).length === 1,
  "poster generation must mention the planned headline only once to avoid duplicated rendering",
);
expect(
  posterHeroPrompt.includes("Do not repeat the headline in badges or decorative blocks"),
  "poster generation must reject duplicate title containers",
);
expect(
  posterHeroPrompt.includes("Hero composition: create a bold, immediately readable e-commerce key visual"),
  "poster generation must use the legacy high-impact key-visual direction",
);
expect(
  !posterHeroPrompt.includes("标签含量文字局部放大"),
  "legacy hero proof devices must be sanitized before they reach image generation",
);
expect(
  posterHeroPrompt.includes("用单个真实商品和可直接看到目标包装标示的清晰机位完成证明"),
  "sanitized hero proof must use one directly visible product angle",
);
expect(
  posterHeroPrompt.includes("Do not render the internal section label, goal, creative brief"),
  "poster generation must keep internal planning fields out of visible artwork",
);
expect(
  !posterHeroPrompt.includes("Section copy: 核心卖点"),
  "poster generation must not expose raw section copy as a second visible-copy source",
);
expect(
  posterHeroPrompt.includes("Keep all original packaging typography unchanged"),
  "poster generation must preserve original packaging typography",
);
const packagingHeroPrompt = generationPromptModule.buildSectionImagePrompt(
  {
    type: "HERO",
    title: "包装与横切面",
    goal: "展示真实包装和剖面馅料",
    copy: "",
    visualPrompt: "白色枕式包装以三分之二角度立于米白台面，绿色信息区朝前；旁侧摆放剖开的熟制云饺。",
    editableData: { controls: { includePackaging: true } },
  },
  [{ type: "PACKAGING", fileName: "packaging.jpg" }, { type: "MAIN", fileName: "1.png" }],
  "1:1",
  "zh-CN",
  undefined,
  [],
  undefined,
  true,
);
expect(
  packagingHeroPrompt.includes("Never convert a tray into a pillow pouch") &&
    packagingHeroPrompt.includes("Preserve the front artwork orientation and reading direction") &&
    packagingHeroPrompt.includes("真实包装严格保持参考图中的物理形态") &&
    !packagingHeroPrompt.includes("白色枕式包装以三分之二角度立于米白台面") &&
    !packagingHeroPrompt.includes("must not appear in the final composition"),
  "packaging prompts must lock physical format and text direction without excluding the supplied package",
);
expect(
  posterHeroPrompt.includes("Keep these colors as a recognizable campaign family, not a rigid per-image formula"),
  "poster generation must keep palette continuity without a fixed color-area ratio",
);
expect(
  posterHeroPrompt.includes("Tone lock: keep the campaign color temperature, material response, black level, and highlight character recognizable"),
  "poster generation must lock project-wide photographic tone",
);
expect(
  posterHeroPrompt.includes("decisive scale, crop, camera angle, light, texture, motion, foreground depth, or product interaction"),
  "poster generation must create impact with product, depth, and light",
);
expect(
  posterHeroPrompt.includes("bold but coherent color blocking") && posterHeroPrompt.includes("Do not introduce an unrelated palette"),
  "bold palette mode must allow impact without introducing unrelated hues",
);
expect(
  posterHeroPrompt.length < 6000,
  `poster prompt must remain focused enough for reliable execution (actual ${posterHeroPrompt.length} chars)`,
);

const generationService = read("lib/services/generation-service.ts");
const moduleTemplate = loadTypeScriptModule("lib/services/module-template.ts");
const legacyWrongRatioSnapshot = {
  moduleTemplates: {
    SPECS: { imageUrl: "legacy-portrait.png", imageAssetId: "portrait-specs" },
  },
};
expect(
  moduleTemplate.readModuleTemplate(
    legacyWrongRatioSnapshot,
    "SPECS",
    "1:1",
    [{ id: "portrait-specs", metadata: { aspectRatio: "9:16" } }],
  ) === null,
  "a legacy 9:16 specs image must never become the 1:1 variant template",
);
const scopedTemplateSnapshot = {
  moduleTemplates: {
    "SPECS:1:1": { imageUrl: "square-specs.png", imageAssetId: "square-specs", aspectRatio: "1:1" },
  },
};
expect(
  moduleTemplate.readModuleTemplate(scopedTemplateSnapshot, "SPECS", "1:1")?.imageAssetId === "square-specs" &&
    moduleTemplate.readModuleTemplate(scopedTemplateSnapshot, "SPECS", "9:16") === null,
  "module templates must be isolated by section type and canvas ratio",
);
expect(
  moduleTemplate.shouldUseModuleTemplate("SPECS", "1:1") &&
    !moduleTemplate.shouldUseModuleTemplate("SPECS", "9:16"),
  "only square optional modules may establish a shared variant template",
);
expect(
  generationService.includes("moduleTemplateWriteQueues") &&
    generationService.includes("persistModuleTemplateIfMissing") &&
    generationService.includes("moduleTemplateKey(params.sectionType, params.aspectRatio)"),
  "concurrent module anchors must merge the latest project snapshot without overwriting another template bucket",
);
expect(
  generationService.includes("同系列模块版式锁定：最高优先级") &&
    generationService.includes("本段锁版要求覆盖上文任何关于") &&
    generationService.includes("禁止新增、删除、合并或移动信息区块"),
  "same-ratio specs variants must explicitly override generic creative-layout instructions",
);
expect(
  generationService.includes("const pipeline = sharp(buffer)\n      .rotate()") &&
    generationService.includes("const resized = await sharp(source)\n    .rotate()"),
  "generation reference preprocessing must apply EXIF orientation before resizing",
);
expect(
  generationService.includes('if (metadata.hasAlpha || metadata.format === "png")') &&
    generationService.includes("authorityDataUrl: dataUrl") &&
    generationService.includes("loadedReferenceImages[packagingBaseIndex]?.authorityDataUrl"),
  "packaging mask input must preserve the original authority pixels and PNG alpha",
);
expect(
  generationService.includes("styleAnchorInput,") &&
    generationService.includes('templateInput: variantContext.scope === "group" || isLifestyleScene ? null : templateInput') &&
    generationService.includes("neighborInputs: []"),
  "lifestyle scenes must inherit the tone anchor while excluding poster templates and unstable neighbors",
);
expect(
  generationService.includes("商品、包装和文字身份只能来自商品参考图与当前模块文案"),
  "style anchors must never override real product or packaging identity",
);
expect(
  generationService.includes("isApprovedToneAnchor(asset)") &&
    generationService.includes("不要复制其中的具体构图、道具形状、产品位置或留白比例"),
  "generation must use an approved section tone anchor without copying its layout",
);
expect(
  generationService.includes("【完整商品硬约束】本模块没有要求横切面") &&
    generationService.includes("不得自行创造横切面"),
  "sections without a cross-section request must explicitly forbid invented exposed filling",
);
expect(
  generationService.includes("若输入参考图没有清晰横切面，宁可只展示完整商品") &&
    generationService.includes("严禁跨口味借用"),
  "cross-section generation must require visible same-variant evidence",
);
expect(
    generationService.includes("【唯一横切面几何基准，优先级最高】") &&
    generationService.includes("若筷子从画面右侧进入，成图也必须从右侧进入") &&
    generationService.includes("应移动横切面整体、减少道具或调整留白") &&
    generationService.includes("禁止把它改成平整刀切面、规则三角形或半圆形切块") &&
    generationService.includes("禁止与其他 MAIN/ANGLE/DETAIL 商品图平均或融合开口形态"),
  "the selected cross-section prompt must lock torn-edge geometry and reject averaged clean cuts",
);
expect(
  generationService.includes("authoritativeCrossSectionAssetIds: params.authoritativeCrossSectionAssetIds") &&
    generationService.includes("authoritativeCrossSectionAssetIds: editAuthoritativeCrossSectionAssetIds"),
  "first generation, group generation, and repaint must carry authoritative cross-section ids",
);
expect(
  generationService.includes("透明区域只能生成完整、未切开、未露馅的商品") &&
    !generationService.includes("只生成透明区域中的场景、横切面与标题"),
  "packaging outpaint must not request a cross-section for every section",
);
expect(
  generationService.includes("const editReferenceResolution = resolveSectionReferenceAssets") &&
    generationService.includes("crossSectionRequested: editCrossSectionRequested"),
  "image edits must use the same cross-section reference resolution and prompt contract as first generation",
);
const colorPaletteService = read("lib/services/color-palette-service.ts");
expect(
  colorPaletteService.includes('"饮料", "果汁", "水果"'),
  "bold food and beverage palettes must rank an appetizing complementary accent ahead of monochrome cool palettes",
);
expect(
  colorPaletteService.includes("full-frame visual grade reference, not a product poster") &&
    colorPaletteService.includes("Do not prescribe a product angle, product size, title position, fixed grid") &&
    colorPaletteService.includes("referenceImages: []") &&
    colorPaletteService.includes('kind: "style_grade_anchor_v2"'),
  "style-anchor generation must lock grade without imposing product identity or layout",
);
for (const toneField of ["colorTemperature", "mainLightDirection", "exposure", "blackLevel", "contrastLevel", "accentRatio", "shadowStyle"]) {
  expect(colorPaletteService.includes(toneField), `palette application must atomically update ${toneField}`);
}
expect(colorPaletteService.includes('toneContractVersion: "campaign-tone/v2"'), "palette selection must version the atomic tone contract");
expect(
  plannerServiceSource.includes("moduleTemplates: {}") && colorPaletteService.includes("moduleTemplates: {}"),
  "replanning or changing the campaign palette must invalidate old module template anchors",
);
const projectService = read("lib/services/project-service.ts");
expect(
  projectService.includes("styleAnchorInput,") && projectService.includes("neighborInputs: []"),
  "project reference previews must pass the approved tone anchor to every visual mode without unstable neighbor inputs",
);
expect(
  projectService.includes("referenceInputsMatchCurrentPlan"),
  "project details must distinguish actual generation inputs from the next planned inputs",
);
const openAiAdapter = read("lib/ai/adapters/openai-compatible.ts");
expect(
  openAiAdapter.includes('images: imageRefs,\n              input_fidelity: "high"'),
  "gpt-image-2 reference generation must request high input fidelity",
);
expect(
  openAiAdapter.includes("json output required. Return exactly one valid json object only") &&
    openAiAdapter.includes("systemPrompt: input.systemPrompt") &&
    openAiAdapter.includes("messages: buildStructuredMessages(input)") &&
    openAiAdapter.includes("messages: buildStructuredMessages({"),
  "every structured request, including repair, must put an explicit lowercase json instruction in system and user messages",
);
expect(
  openAiAdapter.includes("isJsonObjectFormatCompatibilityError") &&
    openAiAdapter.includes("jsonObjectFormatIncompatibleModels.add(compatibilityKey)") &&
    openAiAdapter.includes("structured_json_prompt_fallback"),
  "incompatible json_object gateways must retry without response_format and remember the model for the process lifetime",
);

const generationRequest = read("lib/utils/generation-request.ts");
expect(
  generationRequest.includes("const raw = await response.text()") &&
    generationRequest.includes('code: "EMPTY_RESPONSE"') &&
    generationRequest.includes('code: "INVALID_JSON_RESPONSE"'),
  "generation requests must surface empty or malformed HTTP responses without throwing response.json errors",
);
expect(
  generationRequest.includes('payload.error?.code === "IDEMPOTENT_TASK_FAILED"') &&
    generationRequest.includes("for (let attempt = 0; attempt < 2; attempt += 1)"),
  "a failed idempotent task must rotate its key and retry exactly once",
);
expect(
  generationRequest.includes("onProgress?.(payload.data ?? {})") &&
    generationRequest.includes("phase?: \"image_generation\" | \"quality_review\" | \"failed\""),
  "generation task polling must expose live phase updates to long-running UI requests",
);
const taskService = read("lib/services/task-service.ts");
const taskRoute = read("app/api/tasks/[taskId]/route.ts");
expect(
  taskService.includes("recoverInterruptedGenerationTask") &&
    taskService.includes("PROCESS_STARTED_AT") &&
    taskRoute.includes("recoverInterruptedGenerationTask"),
  "task polling must recover image jobs orphaned by a desktop or server restart",
);

const plannerService = read("lib/services/planner-service.ts");
expect(
  plannerService.includes('visualMode: "lifestyle_scene"'),
  "fallback planning must mark scene-driven sections explicitly",
);
expect(
  plannerService.includes("resolvePlannedIncludePackaging") && plannerService.includes("PACKAGING_VISUAL_CUES"),
  "planned scenes that visibly require packaging must enable real packaging references",
);
expect(
  plannerService.includes("生活场景要求："),
  "fallback and normalized plans must retain a concrete scene prompt",
);
expect(
  plannerService.includes("normalizeTitleDesign"),
  "planned and manually-created sections must normalize title art direction",
);
expect(
  plannerService.includes("selectPlannedMainTitle") &&
    plannerService.includes("selectPlannedSubTitle") &&
    !plannerService.includes("usedOpeningKeys") &&
    !plannerService.includes("usedEvidenceKeys"),
  "planner normalization must preserve legacy copy without candidate scoring or emotional subline suppression",
);
expect(
  plannerService.includes("resolvePlanningAnalysis") && plannerService.includes("readJsonRecord(rawContainer.raw)"),
  "planning must recover verified facts from legacy raw analysis payloads",
);
expect(plannerService.includes("maxOutputTokens: 5200"), "section planning must keep output below the provider gateway risk window with safe headroom");
expect(
  plannerService.includes("const compactCopy") &&
    plannerService.includes("section.copy.trim()") &&
    plannerService.includes("resolveVerifiedCopyClaim"),
  "planner normalization must preserve AI copy and derive only verified factual support locally",
);
expect(
  !plannerService.includes("enrichVariantSectionCopy") &&
    !plannerService.includes("copy: [section.copy, ...extraParts]"),
  "variant metadata must stay out of shopper-visible planned copy",
);
expect(
  plannerService.includes("const plannedDetails") &&
    plannerService.includes("const closingDetails") &&
    plannerService.includes('["SUMMARY", "CONVERSION"].includes(section.type)'),
  "planner must preserve planned narrative order while keeping conversion sections at the end",
);
expect(
  plannerService.includes("resolveVerifiedCopyClaim") && plannerService.includes("factValuesOverlap(visibleCopy, fact)"),
  "planner must derive factual support from preserved copy instead of requiring claims for scene hooks",
);
expect(
  plannerService.includes("while (finalDetails.length < detailSectionCount)") &&
    plannerService.includes("const effectivePreviewConfig = previewConfig"),
  "AI planning must preserve the configured output count when a model response omits sections",
);
expect(plannerService.includes("hasEvidence(baseAnalysis)"), "optional factual modules must be skipped when verified data is absent");

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
expect(qualityService.includes("toneAnchorImageUrl") && qualityService.includes("previousImageUrl"), "quality scoring must compare against the approved tone anchor and previous section");
expect(qualityService.includes("IMAGE_QUALITY_THRESHOLDS") && qualityService.includes("summarizeProjectColorContinuity"), "quality scoring must expose hard gates and full-page color continuity");
expect(
  qualityService.includes("const defaultAnalysisModel") && qualityService.includes('getProviderAdapter("text")'),
  "quality scoring must prefer the configured text provider's default analysis model",
);
expect(
  !qualityService.includes("/pro|max|ultra/"),
  "quality scoring must not prefer stale models merely because their ids contain pro/max/ultra",
);
expect(
  qualityService.includes("scoreAndReconcileGeneratedImage") && qualityService.includes('status: qualityGate.passed ? "SUCCESS" : "REVIEW"'),
  "forced rescoring must reconcile the generated asset gate and current section status",
);
expect(generationService.includes('status: "REVIEW"'), "generated images must enter review before success");
expect(
  generationService.includes("qualityWarningIsAdvisory") &&
    generationService.includes("acceptedForBatch") &&
    generationService.includes("continueAfterQualityWarning"),
  "planner batch generation must treat quality scores as advisory and automatically continue after the first hero",
);
const plannerWorkspace = read("components/planner/planner-workspace.tsx");
expect(
  plannerWorkspace.includes("moduleTemplateKey(") &&
    plannerWorkspace.includes("getSectionAspectRatio(section, previewConfig.imageAspectRatio)") &&
    plannerWorkspace.includes("getSectionAspectRatio(item, previewConfig.imageAspectRatio)"),
  "optional module anchors must be grouped by both section type and canvas ratio",
);
expect(
  plannerWorkspace.includes("continueAfterQualityWarning: true") &&
    !plannerWorkspace.includes("stopForReview"),
  "planner batch UI must not stop the remaining image queue for a quality warning",
);
expect(
  generationService.includes("project.variants.flatMap((variant) => variant.assets)") &&
    generationService.includes("includePackaging && referenceResolution.packagingAssets.length === 0"),
  "generation must merge variant assets and fail closed when packaging is required but unavailable",
);
expect(generationService.includes("await scoreGeneratedImage(imageAsset.id, { force: true })"), "generation must await quality scoring instead of scoring fire-and-forget");
expect(generationService.includes("promoteSectionAsToneAnchor"), "the first accepted hero must become the approved tone anchor");
expect(generationService.includes("styleAnchorInput,") && generationService.includes("neighborInputs: []"), "all visual modes must use a stable tone anchor without neighbor-input drift");
expect(
  generationService.includes("verifyProtectedPackagingPixels") && generationService.includes("packagingPixelCheck"),
  "packaging edits must fail closed when the provider redraws protected pixels",
);
expect(
  generationService.includes("MAX_MODEL_REFERENCE_IMAGES - 1") && generationService.includes("loadedReferenceImages[packagingBaseIndex].dataUrl"),
  "packaging edits must send the protected base plus the original high-resolution package within the reference limit",
);

const paletteUi = read("components/planner/planner-workspace.tsx");
expect(paletteUi.includes('"safe", "contrast", "bold"'), "palette UI must expose all three modes");
expect(
  paletteUi.includes('modelId: planningModelId || undefined') && paletteUi.includes('id="planning-model"'),
  "planner UI must show and submit the model selected for this planning run",
);
const planSectionsRoute = read("app/api/projects/[id]/plan-sections/route.ts");
expect(
  planSectionsRoute.includes('getActiveProviderConfig("text")') &&
    planSectionsRoute.includes("defaultModelId") &&
    planSectionsRoute.includes("audio|realtime"),
  "planner route must expose the active text provider models without leaking provider credentials",
);
expect(paletteUi.includes("CAMPAIGN_GENERATION_WAVE_SIZE") && paletteUi.includes("const firstHero"), "bulk generation must establish the first hero anchor and continue in ordered waves");
expect(paletteUi.includes("optionalAnchors") && paletteUi.includes("IMAGE_GENERATION_CONCURRENCY"), "unrelated optional modules must retain wider provider concurrency after their template anchors");
expect(
  paletteUi.includes('id="pending-generation-reviews"') &&
    paletteUi.includes("待人工审核") &&
    paletteUi.includes("人工审核通过") &&
    paletteUi.includes("重新生成"),
  "quality-gated batch images must remain visible with explicit approve and regenerate actions",
);
expect(
  paletteUi.includes('input.type === "PACKAGING"') &&
    paletteUi.includes("当前计划参考图（包括包装图）与最近一次生成不同"),
  "planner reference previews must label packaging inputs and expose stale actual inputs",
);
expect(
  paletteUi.includes('Boolean(section.imageUrl)') && paletteUi.includes('section.status === "REVIEW"'),
  "generated and review counts must include real images that did not pass automatic scoring",
);
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
