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
expect(heroCopyPrompt.systemPrompt.includes("竞品替换测试"), "batch copy must reject interchangeable slogans");
expect(heroCopyPrompt.systemPrompt.includes("不得改成下单、备货、选购、看规格或物流场景"), "scene-payoff copy must preserve the selected consumption scene");
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
expect(selectedHeroInstruction.includes("只强调「爆汁」"), "selected batch copy must carry its emphasis art direction");
expect(selectedHeroInstruction.includes("「煎出」/「脆底爆汁饺」"), "selected batch copy must carry its exact line break");
expect(selectedHeroInstruction.includes("只在画面底部角落以最小可读字号"), "batch compliance copy must render only as unobtrusive corner text");

const heroAnalyzeRoute = read("app/api/hero-batch/analyze/route.ts");
expect(heroAnalyzeRoute.includes("defaultAnalysisModel &&"), "hero analysis must honor the selected analysis model");
expect(!heroAnalyzeRoute.includes("provider.models[0]?.modelId"), "hero analysis must not fall back to an arbitrary model");
expect(heroAnalyzeRoute.includes("timeoutMs: 300000"), "hero analysis must allow slow vision models to finish");

const planningPrompt = read("lib/ai/prompts/planning.ts");
expect(planningPrompt.includes('"visualMode":"poster"'), "section planning must emit an explicit visual mode");
expect(
  planningPrompt.includes("For visualMode=lifestyle_scene"),
  "section planning must define lifestyle-scene requirements",
);
expect(planningPrompt.includes('"titleDesign":{"layout":"split_level"'), "section planning must emit typography art direction");
expect(
  planningPrompt.includes("Never request a huge white rounded rectangle"),
  "section planning must reject oversized UI-like title containers",
);
expect(
  planningPrompt.includes("Create visual impact by varying scene, camera height, crop, lens depth"),
  "section planning must lock the grade while allowing high-impact scene changes",
);
expect(
  planningPrompt.includes("write one concise title combining the actual occasion/action with a product-specific sensory or use payoff"),
  "lifestyle planning must produce a consumer-benefit headline",
);
expect(
  planningPrompt.includes("quote one distinct item from the supplied fact whitelist verbatim"),
  "planning must ground each hero subline in a new supplied fact",
);
expect(
  planningPrompt.includes("Verified packaging facts and percentages may appear in mainTitle only for CORE_BENEFIT, QUALITY_PROOF, or DIFFERENTIATION"),
  "planning must use verified facts only for a suitable commercial job",
);
expect(
  planningPrompt.includes("Disclaimers such as '以包装标示为准' must never become mainTitle, subTitle, or promotional copy"),
  "planning must keep compliance disclaimers out of promotional title copy",
);
expect(
  !planningPrompt.includes("set mainTitle and subTitle to empty strings"),
  "lifestyle planning must not suppress useful in-image copy",
);
expect(
  planningPrompt.includes("Create impact with dominant product scale"),
  "section planning must create impact through product and light rather than extra graphics",
);
expect(
  planningPrompt.includes("Do not request magnifiers, circular insets, duplicate label crops"),
  "hero planning must reject duplicated label proof devices",
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

const generationPrompt = read("lib/ai/prompts/generation.ts");
expect(
  generationPrompt.includes("LIFESTYLE SCENE CONTRACT (HIGHEST VISUAL PRIORITY)"),
  "image generation must enforce the lifestyle-scene contract",
);
expect(
  generationPrompt.includes('sectionType === "HERO"'),
  "scene detection must support scene-driven hero images",
);
expect(
  generationPrompt.includes("must not appear in the final composition"),
  "non-packaging sections must keep outer-packaging references out of the rendered composition",
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
  packagingResolution.modelProductAssets[0]?.type === "MAIN" &&
    packagingResolution.modelProductAssets[1]?.type === "PACKAGING",
  "packaging generation must send the photographed physical product before the outer-packaging structure reference",
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
    mainTitle: "小青桔汁≥10%",
    subTitle: "以包装标示为准",
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
  sceneHeroPrompt.includes("LIFESTYLE SCENE CONTRACT (HIGHEST VISUAL PRIORITY)"),
  "scene-driven hero prompt must include the final lifestyle-scene contract",
);
expect(
  sceneHeroPrompt.includes("foreground, middle ground, and background depth"),
  "scene-driven hero prompt must require environmental depth",
);
expect(
  sceneHeroPrompt.includes('headline "清爽随时享用" and smaller supporting line "小青桔汁≥10%"'),
  "lifestyle generation must lead with consumer value and demote the factual line",
);
expect(
  !sceneHeroPrompt.includes('headline "以包装标示为准"'),
  "compliance disclaimers must never become the lifestyle headline",
);
expect(
  sceneHeroPrompt.includes('Render the exact compliance note "以包装标示为准" once at the bottom-left or bottom-right corner'),
  "compliance disclaimers must be preserved as unobtrusive corner text",
);
expect(
  !sceneHeroPrompt.includes("free of marketing headlines") && !sceneHeroPrompt.includes("Do not render a headline"),
  "lifestyle scenes must allow one concise designed headline",
);
expect(
  sceneHeroPrompt.includes("Quoted text is exact: render every character verbatim once"),
  "lifestyle copy must be locked against model paraphrasing",
);
expect(
  sceneHeroPrompt.includes('Make "清爽" the only emphasized phrase'),
  "lifestyle typography must render the selected emphasis with clear hierarchy",
);
expect(
  sceneHeroPrompt.includes('Break the exact headline only as "清爽" / "随时享用"'),
  "lifestyle typography must preserve the planned semantic line break",
);
expect(
  sceneHeroPrompt.includes("Avoid a flat single-weight system-font treatment"),
  "lifestyle typography must reject flat title styling",
);
expect(
  sceneHeroPrompt.includes("Show one physical product only"),
  "single-product lifestyle scenes must reject duplicate products",
);
expect(
  sceneHeroPrompt.includes("vary location, camera height, lens perspective, foreground occlusion, depth, subject action, and product placement"),
  "lifestyle scenes must vary composition while keeping the grade locked",
);
expect(
  sceneHeroPrompt.includes("Tone lock: keep color temperature, key-light direction, exposure baseline, shadow density"),
  "lifestyle scenes must retain the project-wide tone lock",
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
  !posterHeroPrompt.includes("LIFESTYLE SCENE CONTRACT (HIGHEST VISUAL PRIORITY)"),
  "poster hero prompt must not be forced into lifestyle-scene mode",
);
expect(
  posterHeroPrompt.includes('Added marketing text is limited to one title group containing headline "Juice content >=10%" and subline "330 mL bottle"'),
  "poster generation must whitelist one compact title group",
);
expect(
  (posterHeroPrompt.match(/Juice content >=10%/g) ?? []).length === 1,
  "poster generation must mention the planned headline only once to avoid duplicated rendering",
);
expect(
  posterHeroPrompt.includes("No badge, CTA, pill, panel, inset, or card"),
  "poster generation must reject duplicate title containers",
);
expect(
  posterHeroPrompt.includes("Excluded proof layouts: magnifier, circular inset, duplicate label crop"),
  "poster generation must reject magnifiers and duplicate label proof",
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
  posterHeroPrompt.includes("Section source copy is intentionally omitted"),
  "poster generation must omit raw section copy when exact typography is locked",
);
expect(
  !posterHeroPrompt.includes("Section copy: 核心卖点"),
  "poster generation must not leak raw source copy into a locked title prompt",
);
expect(
  posterHeroPrompt.includes("keep all original packaging text unchanged"),
  "poster generation must preserve original packaging typography",
);
expect(
  posterHeroPrompt.includes("Keep approximate color-area weights at 70% background/base, 20% primary/support, maximum 10% accent"),
  "poster generation must keep a stable project color-area ratio",
);
expect(
  posterHeroPrompt.includes("Tone lock: keep color temperature, key-light direction, exposure baseline, shadow density"),
  "poster generation must lock project-wide photographic tone",
);
expect(
  posterHeroPrompt.includes("Create thumbnail impact through dominant product or proof scale"),
  "poster generation must create impact with product, depth, and light",
);
expect(
  posterHeroPrompt.includes("ONE controlled accent from the project palette"),
  "bold palette mode must not introduce per-image campaign hues",
);
expect(
  posterHeroPrompt.length < 6000,
  `poster prompt must remain focused enough for reliable execution (actual ${posterHeroPrompt.length} chars)`,
);

const generationService = read("lib/services/generation-service.ts");
expect(
  generationService.includes('variantContext.scope === "group" || isLifestyleScene'),
  "lifestyle scenes must not inherit poster-style anchor and neighbor references",
);
const projectService = read("lib/services/project-service.ts");
expect(
  projectService.includes('resolution.variantScope === "group" || isLifestyleScene'),
  "project reference previews must use the same lifestyle input rules as generation",
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

const plannerService = read("lib/services/planner-service.ts");
expect(
  plannerService.includes('visualMode: "lifestyle_scene"'),
  "fallback planning must mark scene-driven sections explicitly",
);
expect(
  plannerService.includes("Lifestyle scene requirements:"),
  "fallback and normalized plans must retain a concrete scene prompt",
);
expect(
  plannerService.includes("normalizeTitleDesign"),
  "planned and manually-created sections must normalize title art direction",
);
expect(
  plannerService.includes("isDisclaimerHeadline(rawSubTitle)"),
  "planner normalization must remove compliance disclaimers from subtitles",
);

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
