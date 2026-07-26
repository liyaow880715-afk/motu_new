import type { PageSection, ProductAsset } from "@prisma/client";

import {
  contentLanguageNamesForPrompt,
  normalizeContentLanguage,
  type ContentLanguage,
} from "@/lib/utils/content-language";

export interface ProductFacts {
  category?: string;
  subcategory?: string;
  coreSellingPoints?: string[];
  factClaims?: Array<{
    claim: string;
    source: "visible_image" | "user_input" | "structured_data" | "analysis_inference";
    evidence?: string;
    confidence: "high" | "medium" | "low";
    confirmed?: boolean;
    eligibleForMarketing?: boolean;
  }>;
  nutritionFacts?: Record<string, string>;
  ingredients?: string[];
  specs?: Array<{ label: string; value: string }>;
  packagingDescription?: string;
}

export interface StyleGuideColorPalette {
  background?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  text?: string;
}

export interface StyleGuide {
  colorPalette?: StyleGuideColorPalette;
  typography?: {
    headingStyle?: string;
    bodyStyle?: string;
    headingFont?: string;
    bodyFont?: string;
  };
  mood?: string;
  paletteStyle?: "safe" | "contrast" | "bold";
  visualSystem?: {
    lighting?: string;
    colorTemperature?: string;
    exposure?: string;
    contrastLevel?: string;
    paletteRatio?: string;
    shadowStyle?: string;
    textureStyle?: string;
    compositionGrid?: string;
    typographyScale?: string;
    badgeStyle?: string;
    iconStyle?: string;
    productAngle?: string;
    productSizeRatio?: string;
    productPosition?: string;
  };
}

interface SectionCommerceBrief {
  funnelStage: string;
  targetShopper: string;
  primaryObjection: string;
  singleClaim: string;
  claimSource: string;
  proofDevice: string;
  desiredAction: string;
  platformProfile: string;
  textBudget: {
    headlineMaxChars: number;
    sublineMaxChars: number;
    badgeCount: number;
    ctaAllowed: boolean;
  };
}

function readSectionCommerceBrief(section: PageSection, platform?: string): SectionCommerceBrief {
  const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
  const brief = (editableData.commerceBrief as Record<string, unknown> | null) ?? {};
  const budget = (brief.textBudget as Record<string, unknown> | null) ?? {};
  const isHero = section.type === "HERO";
  const isConversion = section.type === "SUMMARY";
  const requestedProofDevice = typeof brief.proofDevice === "string"
    ? brief.proofDevice
    : "用一个与模块目标匹配的视觉证据证明结论";
  const heroRequestsDuplicateDetail = isHero && /(局部放大|放大镜|放大框|圆形特写|标签裁切|magnifier|inset|duplicate\s+(?:label|crop)|close[- ]?up\s+callout)/i.test(requestedProofDevice);
  const proofDevice = heroRequestsDuplicateDetail
    ? "用单个真实商品和可直接看到目标包装标示的清晰机位完成证明；不使用放大镜、局部裁切、重复标签或指示线"
    : requestedProofDevice;
  return {
    funnelStage: typeof brief.funnelStage === "string" ? brief.funnelStage : isHero ? "attention" : isConversion ? "conversion" : "interest",
    targetShopper: typeof brief.targetShopper === "string" ? brief.targetShopper : "正在比较同类商品的消费者",
    primaryObjection: typeof brief.primaryObjection === "string" ? brief.primaryObjection : "缺少直观、可信的购买理由",
    singleClaim: typeof brief.singleClaim === "string" ? brief.singleClaim : "",
    claimSource: typeof brief.claimSource === "string" ? brief.claimSource : "",
    proofDevice,
    desiredAction: typeof brief.desiredAction === "string" ? brief.desiredAction : isConversion ? "形成下单意愿" : "继续浏览并建立信任",
    platformProfile: typeof brief.platformProfile === "string" ? brief.platformProfile : platform || "通用移动电商",
    textBudget: {
      headlineMaxChars: Math.min(24, Math.max(4, Number(budget.headlineMaxChars ?? 12))),
      sublineMaxChars: Math.min(40, Math.max(0, Number(budget.sublineMaxChars ?? 16))),
      badgeCount: Math.min(2, Math.max(0, Number(budget.badgeCount ?? 0))),
      ctaAllowed: typeof budget.ctaAllowed === "boolean" ? budget.ctaAllowed : isConversion,
    },
  };
}

function buildCommerceBriefInstruction(section: PageSection, productFacts?: ProductFacts, platform?: string): string {
  const brief = readSectionCommerceBrief(section, platform);
  const verifiedClaims = (productFacts?.factClaims ?? []).filter(
    (claim) => claim.source !== "analysis_inference" && claim.confidence === "high" && claim.eligibleForMarketing,
  );
  const claimIsVerified = brief.singleClaim
    ? verifiedClaims.some((claim) => claim.claim === brief.singleClaim || claim.claim.includes(brief.singleClaim) || brief.singleClaim.includes(claim.claim))
    : false;
  const lines = [
    "=== Legacy e-commerce creative brief ===",
    `Shopper: ${brief.targetShopper}; concern: ${brief.primaryObjection}; desired response: ${brief.desiredAction}.`,
    `Stage: ${brief.funnelStage}; scene/proof: ${brief.proofDevice}; placement: ${brief.platformProfile}.`,
  ];

  if (claimIsVerified) {
    lines.push(`Verified factual support: ${brief.singleClaim} (${brief.claimSource || "verified product fact"}). Use it exactly where it strengthens the idea.`);
  } else {
    lines.push("Creative, sensory, and emotional expression is allowed; do not invent numbers, ingredients, efficacy, certifications, popularity, or comparisons.");
  }

  if (verifiedClaims.length > 0) {
    lines.push("Approved fact whitelist (do not go beyond it):");
    verifiedClaims.forEach((claim) => lines.push(`- ${claim.claim}${claim.evidence ? ` (${claim.evidence})` : ""}`));
  }

  lines.push(
    `Copy budget: one headline <=${brief.textBudget.headlineMaxChars} characters, ${brief.textBudget.sublineMaxChars > 0 ? `one optional support line <=${brief.textBudget.sublineMaxChars} characters` : "no support line"}, plus only short selling points supplied in section copy.`,
    brief.textBudget.ctaAllowed ? "A short CTA is allowed only if it remains subordinate to the product." : "Do not add a CTA in this image.",
  );
  return lines.join("\n");
}

type TitleDesign = {
  layout: "editorial_left" | "editorial_center" | "split_level" | "minimal_caption";
  alignment: "left" | "center" | "right";
  placement: "top" | "upper_left" | "side";
  emphasis: string;
  lineBreakAfter: string;
  maxLines: number;
  panelStyle: "none" | "soft_band" | "label_strip";
};

function readTitleDesign(section: PageSection, isLifestyleScene: boolean): TitleDesign {
  const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
  const raw = editableData.titleDesign && typeof editableData.titleDesign === "object" && !Array.isArray(editableData.titleDesign)
    ? editableData.titleDesign as Record<string, unknown>
    : {};
  const isDataSection = ["SPECS", "INGREDIENTS_TABLE", "COMPARISON"].includes(section.type);
  const layouts = ["editorial_left", "editorial_center", "split_level", "minimal_caption"];
  const alignments = ["left", "center", "right"];
  const placements = ["top", "upper_left", "side"];
  const panelStyles = ["none", "soft_band", "label_strip"];
  const requestedMaxLines = Number(raw.maxLines ?? (isLifestyleScene ? 1 : 2));

  return {
    layout: (layouts.includes(String(raw.layout))
      ? String(raw.layout)
      : isLifestyleScene
        ? "minimal_caption"
        : isDataSection
          ? "split_level"
          : "editorial_left") as TitleDesign["layout"],
    alignment: (alignments.includes(String(raw.alignment)) ? String(raw.alignment) : "left") as TitleDesign["alignment"],
    placement: (placements.includes(String(raw.placement)) ? String(raw.placement) : "upper_left") as TitleDesign["placement"],
    emphasis: typeof raw.emphasis === "string" ? raw.emphasis.trim() : "",
    lineBreakAfter: typeof raw.lineBreakAfter === "string" ? raw.lineBreakAfter.trim() : "",
    maxLines: Number.isFinite(requestedMaxLines) ? Math.min(3, Math.max(1, requestedMaxLines)) : 2,
    panelStyle: (panelStyles.includes(String(raw.panelStyle)) ? String(raw.panelStyle) : "none") as TitleDesign["panelStyle"],
  };
}

function readLockedTitles(section: PageSection) {
  const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
  const explicitMain = typeof editableData.mainTitle === "string" ? editableData.mainTitle.trim() : "";
  const explicitSub = typeof editableData.subTitle === "string" ? editableData.subTitle.trim() : "";
  const explicitComplianceNote = typeof editableData.complianceNote === "string"
    ? editableData.complianceNote.trim()
    : "";
  const legacyMain = section.copy.match(/(?:主标题|headline)\s*[：:]\s*([^；;|\n]+)/i)?.[1]?.trim() ?? "";
  const mainTitle = explicitMain || legacyMain;
  const complianceNote = [explicitComplianceNote, explicitSub, mainTitle]
    .find((value) => isDisclaimerLike(value)) ?? "";

  return {
    mainTitle: isDisclaimerLike(mainTitle) ? "" : mainTitle,
    subTitle: isDisclaimerLike(explicitSub) || explicitSub === mainTitle ? "" : explicitSub,
    complianceNote,
  };
}

function isDisclaimerLike(value: string) {
  return /(以.*为准|详见包装|包装标示|包装标注|仅供参考|具体信息|actual packaging|see (?:the )?pack|as (?:shown|marked) on (?:the )?pack)/i.test(value);
}

function readRenderableTitles(section: PageSection) {
  return readLockedTitles(section);
}

function buildTypographyArtDirection(section: PageSection, isLifestyleScene: boolean): string {
  const { mainTitle, subTitle, complianceNote } = readRenderableTitles(section);
  const design = readTitleDesign(section, isLifestyleScene);
  const complianceInstruction = complianceNote
    ? `Render the exact compliance note "${complianceNote}" once as unobtrusive small text in a bottom corner. Keep it outside the marketing title group and do not emphasize it.`
    : "Do not invent a compliance note or packaging disclaimer.";
  const emphasisInstruction = design.emphasis && mainTitle.includes(design.emphasis)
    ? `Give "${design.emphasis}" a clear but tasteful emphasis through scale, weight, color, or spatial rhythm while preserving the exact characters.`
    : "Choose the most effective hierarchy and word emphasis for the composition; avoid flat, default-looking typesetting.";
  let lineBreakInstruction = "Choose natural semantic line breaks that strengthen rhythm and readability.";
  if (
    design.lineBreakAfter &&
    mainTitle.includes(design.lineBreakAfter) &&
    !mainTitle.endsWith(design.lineBreakAfter)
  ) {
    const splitIndex = mainTitle.indexOf(design.lineBreakAfter) + design.lineBreakAfter.length;
    lineBreakInstruction = `Break the exact headline only as "${mainTitle.slice(0, splitIndex)}" / "${mainTitle.slice(splitIndex)}"; do not break it anywhere else.`;
  }

  if (!mainTitle) {
    return [
      "Typography and copy: visually design the supplied section title and section copy as part of the finished e-commerce artwork, following the legacy prompt strategy.",
      "Choose a concise commercial headline from the supplied copy, establish expressive scale contrast and natural reading rhythm, and integrate it with the product composition rather than treating it as a UI label.",
      "Only use copy supplied by the section. Do not invent factual claims or packaging text, and do not cover the product, label, cross-section, hand, or key action.",
      complianceInstruction,
    ].join("\n");
  }

  const titleGroup = subTitle
    ? `headline \"${mainTitle}\" and subline \"${subTitle}\"`
    : `headline \"${mainTitle}\" with no subline`;
  return [
    "=== Legacy commercial typography direction ===",
    `Render one designed title group containing ${titleGroup}. Every quoted character must remain exact and appear only once.`,
    "Use category-appropriate display type, expressive scale contrast, confident spacing, and a composition-aware relationship with the product. It must feel like finished campaign artwork, not a small caption or software template.",
    `Treat ${design.alignment} / ${design.placement.replace("_", " ")} as a starting suggestion, not a fixed grid; adapt to the scene without covering product identity or proof.`,
    emphasisInstruction,
    lineBreakInstruction,
    subTitle ? "Keep the subline visibly subordinate and use it to support, not repeat, the headline." : "Do not create an empty subtitle placeholder.",
    complianceInstruction,
    "Do not repeat the headline in badges or decorative blocks. Keep all original packaging typography unchanged.",
  ].join("\n");
}

function buildHeroPosterInstruction(section: PageSection, isLifestyleScene: boolean, variantContext?: VariantContext) {
  if (section.type !== "HERO" || isLifestyleScene || variantContext?.scope === "group") {
    return "";
  }

  return [
    "Hero composition: create a bold, immediately readable e-commerce key visual with the real reference product as the unmistakable focal subject.",
    "Use decisive scale, crop, camera angle, light, texture, motion, foreground depth, or product interaction to create impact. Let the planned headline and selling idea shape the composition instead of fitting the product into one fixed poster template.",
    "Keep the real label and defining product details recognizable. Do not duplicate or distort the product merely to fill space.",
  ].join(" ");
}

interface AdjacentSection {
  type: string;
  title: string;
  goal: string;
  imageUrl?: string;
}

export type VariantContext =
  | { scope: "base" }
  | {
      scope: "variant";
      variantId: string;
      variantName: string;
      description?: string;
      keyIngredients?: string[];
      packagingNotes?: string;
      differences?: string;
    }
  | {
      scope: "group";
      variantIds: string[];
      variants: Array<{ variantId: string; variantName: string; description?: string }>;
      layout?: "row" | "triangle" | "scene";
    };

function buildVariantGroupPositionInstruction(
  layout: "row" | "triangle" | "scene" | undefined,
  variants: Array<{ variantId: string; variantName: string; description?: string }>,
): string[] {
  const count = variants.length;
  if (count === 0) return [];

  const layoutType = layout ?? "row";

  if (layoutType === "row") {
    return [
      "Arrange all variants in a clear horizontal row from left to right, in the exact order listed below.",
      ...variants.map((v, i) => `Position ${i + 1} (left-to-right): "${v.variantName}".`),
    ];
  }

  if (layoutType === "triangle") {
    if (count === 2) {
      return [
        "Place the first variant slightly left-of-center in the front, and the second variant slightly right-of-center behind it.",
        ...variants.map((v, i) => `${i === 0 ? "Front-left" : "Rear-right"}: "${v.variantName}".`),
      ];
    }
    if (count === 3) {
      return [
        "Arrange the three variants in a shallow triangle: two in the front row side-by-side, one centered behind them.",
        `Front-left: "${variants[0].variantName}".`,
        `Front-right: "${variants[1].variantName}".`,
        `Center-rear: "${variants[2].variantName}".`,
      ];
    }
    return [
      "Arrange the variants in a balanced triangular/pyramid composition, with the first variant at the top and the rest fanning out below in order.",
      ...variants.map((v, i) => `${i === 0 ? "Top" : `Position ${i}`}: "${v.variantName}".`),
    ];
  }

  // scene
  const scenePositions = [
    "foreground-left",
    "foreground-right",
    "mid-left",
    "mid-right",
    "background-left",
    "background-right",
  ];
  return [
    "Place the variants naturally within the lifestyle scene, each at a distinct depth/position so they remain identifiable.",
    ...variants.map((v, i) => `${scenePositions[i] ?? `position-${i + 1}`}: "${v.variantName}".`),
  ];
}

function buildVariantScopeInstruction(variantContext?: VariantContext, includePackaging?: boolean): string {
  if (!variantContext) return "";

  if (variantContext.scope === "base") {
    return "";
  }

  if (variantContext.scope === "variant") {
    const lines = [
      "=== VARIANT SCOPE ===",
      `This image must ONLY feature the variant: "${variantContext.variantName}".`,
      "Use ONLY the provided reference images for this variant.",
      "Do NOT show any other flavor, size, SKU, or variant in the image.",
    ];
    if (variantContext.description) lines.push(`Variant description: ${variantContext.description}`);
    if (variantContext.keyIngredients?.length) lines.push(`Key ingredients: ${variantContext.keyIngredients.join(", ")}`);
    if (variantContext.packagingNotes && !includePackaging) {
      lines.push(`Packaging/spec notes: ${variantContext.packagingNotes}`);
    }
    if (variantContext.differences) lines.push(`Differences from other variants: ${variantContext.differences}`);
    return lines.join("\n");
  }

  const positionLines = buildVariantGroupPositionInstruction(variantContext.layout, variantContext.variants);
  const lines = [
    "=== GROUP SCOPE ===",
    "This image must feature multiple variants together in ONE image.",
    "Keep every variant visually distinct and correctly matched to its described flavor/packaging.",
    "Do NOT swap, merge, or mislabel variants.",
    "Do NOT duplicate the same variant.",
    ...positionLines,
    "Use the explicit reference-to-position mapping appended at the end of the prompt. Multiple references may belong to the same position because packaging and cross-section evidence are supplied separately.",
  ];
  variantContext.variants.forEach((variant, index) => {
    lines.push(`${index + 1}. "${variant.variantName}"${variant.description ? ` - ${variant.description}` : ""}`);
  });
  return lines.join("\n");
}

function buildReferenceText(referenceAssets: ProductAsset[]) {
  if (!referenceAssets.length) {
    return "No visual reference supplied.";
  }

  return `Reference images: ${referenceAssets.map((item) => item.fileName).join(" / ")}`;
}

function sanitizeVisiblePackagingVisualPrompt(prompt: string, includePackaging?: boolean): string {
  if (!includePackaging) return prompt;

  const body = prompt.replace(/^\s*(?:Primary Prompt|中文提示|中文 Prompt)\s*[:：]\s*/i, "").trim();
  const packagingGeometryCue =
    /(?:包装|包装袋|标签|信息区).*(?:枕式|袋装|盒装|托盒|纸盒|箱体|立于|竖立|平放|横放|三分之二角度|朝前|背靠背|错位|展开)|(?:枕式|袋装|盒装|托盒|纸盒|箱体|立于|竖立|平放|横放|三分之二角度|朝前|背靠背|错位|展开).*(?:包装|包装袋|标签|信息区)/i;
  const retainedClauses = body
    .split(/[；。]/)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .filter((clause) => !packagingGeometryCue.test(clause));

  return [
    "Primary Prompt: 真实包装严格保持参考图中的物理形态、原始正面朝向和文字阅读方向；不得根据文字描述重新设计包装。",
    ...retainedClauses.map((clause) => `${clause}。`),
  ].join(" ");
}

function buildMainImageInstruction(referenceAssets: ProductAsset[]) {
  if (!referenceAssets.length) {
    return "No product reference: infer cautiously from analysis and keep one stable product identity.";
  }

  return [
    "The uploaded product images are the source of truth.",
    "Preserve exact shape, proportions, material, texture, finish, intrinsic colors, reflectivity, and recognizable details; do not stylize or substitute the product.",
    "Change only scene, framing, camera angle, lighting, and selling-point emphasis to serve this section.",
  ].join(" ");
}

function buildProductFidelityInstruction(referenceAssets: ProductAsset[]) {
  if (!referenceAssets.length) {
    return "";
  }

  return [
    "=== Product fidelity lock ===",
    "Render the same photographed product, not a redrawn interpretation; retain natural micro-detail, edges, seams, embossing, printed texture, highlights, and contact shadows.",
    "For a visible container or package, preserve structure, proportions, brand color blocks, logo position, label hierarchy, and recognizable front claims.",
    "Treat all text already printed on the photographed physical product as immutable image texture: do not translate, normalize, re-typeset, replace, or promote it into added marketing copy.",
    "Never invent or rewrite barcodes, license numbers, nutrition tables, certifications, dense regulatory copy, logos, or package graphics. If dense print cannot remain exact, keep it below readable scale instead of fabricating substitute text. OCR verification is still required before publication.",
    "Lighting and grading may enhance the reference but must not alter product identity or intrinsic color.",
  ].join(" ");
}

function buildPackagingCompositionInstruction(sectionType: string, includePackaging?: boolean): string {
  if (!includePackaging) return "";

  return [
    "=== VISIBLE PACKAGING FIDELITY CONTRACT (HIGHEST IDENTITY PRIORITY) ===",
    "A packaging reference is supplied because the real package must appear in this image. Treat that photographed package as an immutable physical object, not as a loose design suggestion.",
    "Preserve the exact package format and construction shown in the reference: tray, pouch, carton, sleeve, lid, seals, folds, transparent areas, aspect ratio, thickness, and contents placement. Never convert a tray into a pillow pouch, a horizontal band into a vertical label, or one package form into another.",
    "Preserve the front artwork orientation and reading direction. Keep every text baseline, logo, illustration, color block, and label region in the same relative position and direction as the source; do not rotate, mirror, re-typeset, translate, rewrite, beautify, or auto-complete packaging text.",
    "Keep the package front close to the source viewing direction. If perspective is needed, use only a mild coherent camera change that leaves the artwork upright and recognizable; never twist, bend, inflate, or warp the printed plane.",
    "The packaging pixels and visible structure override any conflicting prose in the section prompt, analysis, packaging description, or variant notes.",
    "Dense fine print that cannot be preserved exactly must remain small and texture-like. Never fabricate a barcode, ingredient list, nutrition table, license number, certification, date, or claim.",
    sectionType === "PACKAGING"
      ? "Make the unchanged real package the dominant proof object, with clean surrounding space and a natural contact shadow."
      : "Show the unchanged real package wherever the planned composition requests it; added marketing copy and props must not cover its artwork.",
  ].join(" ");
}

function buildAspectInstruction(aspectRatio: "1:1" | "3:4" | "9:16") {
  if (aspectRatio === "1:1") {
    return "The final image must be a square 1:1 e-commerce hero composition, optimized for tappable product gallery covers.";
  }

  if (aspectRatio === "3:4") {
    return [
      "The final image must be composed as a vertical 3:4 marketplace poster.",
      "If the actual output canvas is taller than 3:4, keep all critical content (product, headline, CTA) inside a central 3:4 safe area; the final delivery will be cropped to 3:4.",
      "Do not push important elements to the extreme top or bottom edges.",
    ].join(" ");
  }

  return "The final image must be a vertical 9:16 long-form mobile commerce composition.";
}

function buildTargetLanguageInstruction(contentLanguage: ContentLanguage) {
  const targetLanguage = contentLanguageNamesForPrompt[normalizeContentLanguage(contentLanguage)];

  return [
    `In-image text: ${targetLanguage}; visually design only supplied headline, selling points, compliance note, and permitted CTA.`,
    "Do not invent factual or packaging copy. Keep spelling exact, legible, unmirrored, and free of overlap or meaningless glyphs.",
  ].join(" ");
}

export function isLifestyleSceneSection(
  sectionType: string,
  visualMode?: unknown,
  sceneContext = "",
): boolean {
  if (visualMode === "lifestyle_scene") {
    return true;
  }

  if (["SCENARIO", "GIFT_SCENE", "ORIGIN", "AUDIENCE"].includes(sectionType)) {
    return true;
  }

  return sectionType === "HERO" && /(场景|生活方式|使用情境|lifestyle|usage scene|use scene|in-context)/i.test(sceneContext);
}

function buildSectionColorInstruction(
  sectionType: string,
  palette?: StyleGuideColorPalette,
  lifestyleSceneOverride?: boolean,
): string {
  const isLifestyleScene = lifestyleSceneOverride ?? isLifestyleSceneSection(sectionType);
  if (!palette) {
    return isLifestyleScene
      ? "Color direction: keep one recognizable campaign grade while using rich light-and-dark contrast, warm appetizing highlights, and category-appropriate accent color to make the photographed moment vivid. Preserve real product and food colors."
      : "Color direction: build a cohesive campaign palette with confident contrast and a memorable accent. Preserve the product's real material and intrinsic color; avoid timid near-monochrome styling.";
  }

  return isLifestyleScene
    ? `Section color use: retain the campaign family of ${palette.background ?? "the project background"}, ${palette.primary ?? "the primary color"}, ${palette.secondary ?? "the secondary color"}, and ${palette.accent ?? "the accent color"} through believable environment, props, light, and grading. Use the accent more strongly when it improves appetite appeal or action, while preserving natural product and food color.`
    : `Section color use: work freely within ${palette.background ?? "the project background"}, ${palette.primary ?? "the primary color"}, ${palette.secondary ?? "the secondary color"}, ${palette.accent ?? "the accent color"}, and ${palette.text ?? "the text color"}. Keep the family recognizable across the page, but vary color area and contrast according to each selling idea instead of applying one fixed ratio.`;
}

function buildProjectStyleGuideInstruction(
  styleGuide?: StyleGuide,
  adjacentSections?: AdjacentSection[],
  lifestyleSceneOverride?: boolean,
) {
  const lines: string[] = [];
  const isLifestyleScene = lifestyleSceneOverride ?? false;
  const visualSystem = styleGuide?.visualSystem;

  if (styleGuide?.colorPalette) {
    const palette = styleGuide.colorPalette;
    lines.push(
      "=== Series color and tone lock ===",
      `Palette: background ${palette.background ?? "unspecified"}; primary ${palette.primary ?? "unspecified"}; secondary ${palette.secondary ?? "unspecified"}; accent ${palette.accent ?? "unspecified"}; text ${palette.text ?? "unspecified"}.`,
    );
    lines.push("Keep these colors as a recognizable campaign family, not a rigid per-image formula. Preserve the product's real colors and let the accent area expand when the visual idea needs stronger impact.");
    if (styleGuide.paletteStyle === "contrast") {
      lines.push("Palette mode: conversion contrast. Use decisive light/dark separation and confident brand-color contrast while retaining material realism.");
    }
    if (styleGuide.paletteStyle === "bold") {
      lines.push("Campaign impact: use bold but coherent color blocking, luminous highlights, or a stronger project accent where it increases stopping power. Do not introduce an unrelated palette.");
    }
  }

  if (styleGuide?.mood) {
    lines.push(`Overall page mood: ${styleGuide.mood}.`);
  }

  if (!isLifestyleScene && styleGuide?.typography?.headingStyle) {
    lines.push(`Typography style: headings should feel ${styleGuide.typography.headingStyle}.`);
  }

  if (!isLifestyleScene && styleGuide?.typography?.headingFont) {
    lines.push(`Heading font: use a font that looks like "${styleGuide.typography.headingFont}" for all headlines and section titles.`);
  }

  if (visualSystem) {
    const vs = visualSystem;
    lines.push(
      "Tone lock: keep the campaign color temperature, material response, black level, and highlight character recognizable across every section. Light intensity, camera direction, and composition may vary to serve each selling idea.",
      `Values: ${vs.colorTemperature ?? "consistent commercial white balance"}; ${vs.lighting ?? "one key-light direction"}; ${vs.exposure ?? "protected highlights/readable shadows"}; ${vs.shadowStyle ?? "natural shadows"}; ${vs.contrastLevel ?? "medium-high contrast"}; ${vs.textureStyle ?? "realistic materials"}.`,
    );
    if (isLifestyleScene) lines.push("For impact, use a distinctive location, camera height, lens perspective, foreground occlusion, depth, subject action, and product placement. Do not reuse a flat studio poster grid.");
  }

  if (adjacentSections && adjacentSections.length > 0) {
    lines.push(
      isLifestyleScene
        ? "Adjacent continuity: retain the campaign grade and brand-color family; deliberately change scene, camera, action, and layout."
        : "Adjacent continuity: retain the campaign palette and material rendering without repeating the same composition or light pattern.",
    );
    for (const adjacent of adjacentSections.slice(0, 2)) {
      lines.push(`- [${adjacent.type}] ${adjacent.title}: ${adjacent.goal}`);
    }
  }

  if (lines.length === 0) {
    return "";
  }

  return lines.join("\n");
}

function buildNegativePrompt(includePackaging?: boolean) {
  const exclusions = [
    "watermarks, artifacts, blur, distorted anatomy, or corrupted text",
    "altered product identity, material, intrinsic color, or packaging structure",
    "plastic, oversmoothed, cartoon, generic-template, or unfinished appearance",
  ];

  if (!includePackaging) {
    exclusions.push("secondary outer retail packaging, gift boxes, shipping boxes, sleeves, or packaging props absent from the references");
  }

  return `Exclude: ${exclusions.join("; ")}. The real primary container, label, and wrapper remain part of product identity.`;
}

function buildCompositionInstruction(isLifestyleScene: boolean) {
  if (isLifestyleScene) {
    return [
      "Build a convincing photographed moment in a real environment, with the product naturally placed or actively used.",
      "Create narrative and visual impact through camera angle, decisive crop, foreground/middle/background depth, captured action, directional light, appetizing texture, and integrated commercial typography.",
    ].join(" ");
  }

  return [
    "Create a finished commercial key visual with an immediate focal point and a clear relationship between product, headline, selling proof, and supporting copy.",
    "Make the product or food texture visually irresistible through decisive scale, crop, camera angle, light-and-dark separation, dimensional shadows, material detail, movement, or foreground depth.",
    "Use the planned copy as part of the composition. Typography may be bold and expressive when it increases stopping power, but it must remain readable and must not hide product identity or evidence.",
    "Avoid generic centered packshots, timid empty layouts, repeated template grids, and decoration that does not strengthen the selling idea.",
  ].join(" ");
}

function buildLifestyleSceneInstruction(
  section: PageSection,
  isLifestyleScene: boolean,
  variantContext?: VariantContext,
) {
  if (!isLifestyleScene) {
    return "";
  }

  return [
    "=== Lifestyle campaign scene ===",
    "Create a desirable lived-in campaign moment from the supplied setting, person or hand, action, props, and product interaction, with believable contact, scale, perspective, environmental light, and layered depth.",
    "Let product and action communicate the benefit before reading. Integrate expressive commercial typography using dynamic framing, foreground occlusion, close crop, or asymmetry when it improves impact.",
    variantContext?.scope === "group"
      ? "Show each requested variant exactly once."
      : "Show one physical product only; no duplicate container, cap, label, reflection, or background product.",
    "Keep identity and packaging exact. Avoid flat backgrounds, generic centered packshots, and purposeless props.",
  ].join(" ");
}

function buildStructuredFactsInstruction(
  section: PageSection,
  productFacts?: ProductFacts,
  includePackaging?: boolean,
): string {
  if (!productFacts) return "";

  const lines: string[] = [];

  if (
    (section.type === "SPECS" || section.type === "INGREDIENTS_TABLE") &&
    (productFacts.specs?.length || Object.keys(productFacts.nutritionFacts ?? {}).length)
  ) {
    lines.push("=== 本模块必须使用的精确产品数据 ===");
    if (productFacts.specs?.length) {
      lines.push("规格参数：");
      productFacts.specs.forEach((s) => lines.push(`- ${s.label}: ${s.value}`));
    }
    if (productFacts.nutritionFacts && Object.keys(productFacts.nutritionFacts).length > 0) {
      lines.push("营养成分：");
      Object.entries(productFacts.nutritionFacts).forEach(([k, v]) => lines.push(`- ${k}: ${v}`));
    }
    lines.push("以上数据必须原样使用，禁止估算、修改或编造任何数值、单位或文字。Use large, OCR-readable typesetting. If exact rendering cannot be achieved, omit the affected row instead of outputting a plausible but incorrect value. 如果数据为空，则只展示版式，不填写具体数值。");
  }

  // Packaging is rendered by the image model; pass its verified description as an identity constraint.
  if (productFacts.packagingDescription) {
    lines.push("=== 包装描述参考 ===");
    if (includePackaging) {
      lines.push("真实包装参考图是唯一结构依据；忽略分析文字中可能冲突的包装形态、方向、材质、色块或文字布局描述。");
    } else {
      lines.push(productFacts.packagingDescription);
      lines.push("除非本模块明确要求包装主体，否则仅将这段描述作为商品身份约束，不要虚构或改写包装信息。");
    }
  }

  if ((section.type === "SELLING_POINTS" || section.type === "INGREDIENTS_TABLE") && productFacts.ingredients?.length) {
    lines.push("=== 配料/成分信息 ===");
    lines.push(`配料：${productFacts.ingredients.join("、")}`);
    lines.push("如果本模块涉及配料/成分展示，必须使用上述配料，禁止编造或遗漏。");
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

export function buildSectionImagePrompt(
  section: PageSection,
  referenceAssets: ProductAsset[] = [],
  aspectRatio: "1:1" | "3:4" | "9:16" = "9:16",
  contentLanguage: ContentLanguage = "zh-CN",
  styleGuide?: StyleGuide,
  adjacentSections?: AdjacentSection[],
  productFacts?: ProductFacts,
  includePackaging?: boolean,
  variantContext?: VariantContext,
  platform?: string,
) {
  const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
  const isLifestyleScene = isLifestyleSceneSection(
    section.type,
    editableData.visualMode,
    `${section.title} ${section.goal} ${section.visualPrompt}`,
  );
  const styleGuideInstruction = buildProjectStyleGuideInstruction(styleGuide, adjacentSections, isLifestyleScene);

  return [
    "You are a senior e-commerce key-visual designer creating marketplace-ready product artwork.",
    "Follow the proven legacy generation strategy: treat the section title, goal, copy, and visual prompt as one coherent creative brief, then turn them into a finished high-conversion campaign image with strong product appeal and designed in-image typography.",
    `Section type: ${section.type}`,
    `Section title: ${section.title}`,
    `Section goal: ${section.goal}`,
    `Section copy: ${section.copy}`,
    `Visual prompt guidance: ${sanitizeVisiblePackagingVisualPrompt(section.visualPrompt, includePackaging)}`,
    buildCommerceBriefInstruction(section, productFacts, platform),
    "Generate one high-conversion mobile e-commerce visual for this section.",
    "Emphasize product clarity, appetizing or tactile material texture, visual hierarchy, emotional desire, and marketplace stopping power.",
    "The headline, selling points, supporting copy, and permitted CTA should be visually designed inside the image rather than left for later DOM text insertion.",
    "Make the result feel like finished commercial artwork, not a blank template, generic packshot, or strategy diagram.",
    buildLifestyleSceneInstruction(section, isLifestyleScene, variantContext),
    isLifestyleScene ? "" : buildCompositionInstruction(false),
    buildTypographyArtDirection(section, isLifestyleScene),
    buildReferenceText(referenceAssets),
    buildMainImageInstruction(referenceAssets),
    buildProductFidelityInstruction(referenceAssets),
    buildPackagingCompositionInstruction(section.type, includePackaging),
    buildVariantScopeInstruction(variantContext, includePackaging),
    buildAspectInstruction(aspectRatio),
    buildTargetLanguageInstruction(contentLanguage),
    styleGuideInstruction,
    styleGuideInstruction ? "" : buildSectionColorInstruction(section.type, undefined, isLifestyleScene),
    buildStructuredFactsInstruction(section, productFacts, includePackaging),
    buildHeroPosterInstruction(section, isLifestyleScene, variantContext),
    "Ad-law guard: no absolute superlatives (最、第一、顶级、最佳、唯一), medical promises, 100% claims, or unverified certifications.",
    ["SPECS", "INGREDIENTS_TABLE"].includes(section.type)
      ? "Data guard: use only supplied nutrition, ingredient, and specification values verbatim; omit any missing row rather than estimate or invent it."
      : "Do not invent numeric or factual claims.",
    buildNegativePrompt(includePackaging),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRegenerationPrompt(
  section: PageSection,
  referenceAssets: ProductAsset[] = [],
  aspectRatio: "1:1" | "3:4" | "9:16" = "9:16",
  contentLanguage: ContentLanguage = "zh-CN",
  styleGuide?: StyleGuide,
  adjacentSections?: AdjacentSection[],
  productFacts?: ProductFacts,
  includePackaging?: boolean,
  variantContext?: VariantContext,
  platform?: string,
) {
  return [
    buildSectionImagePrompt(section, referenceAssets, aspectRatio, contentLanguage, styleGuide, adjacentSections, productFacts, includePackaging, variantContext, platform),
    "This is a regeneration task. Diagnose and correct the previous failure by category: product/packaging mismatch, unsupported claim, unreadable or excessive text, weak thumbnail recognition, missing proof device, poor hierarchy, palette misuse, or platform mismatch.",
    "Keep the same verified product identity and approved single claim. Do not introduce a new selling direction while fixing visual defects.",
  ].join("\n");
}

export function buildImageEditPrompt(
  section: PageSection,
  referenceAssets: ProductAsset[] = [],
  mode: "repaint" | "enhance" = "repaint",
  aspectRatio: "1:1" | "3:4" | "9:16" = "9:16",
  contentLanguage: ContentLanguage = "zh-CN",
  styleGuide?: StyleGuide,
  adjacentSections?: AdjacentSection[],
  productFacts?: ProductFacts,
  includePackaging?: boolean,
  variantContext?: VariantContext,
  platform?: string,
) {
  const modeInstruction =
    mode === "enhance"
      ? "This is an enhancement task. Use the current image as the base, preserve the overall framing, and improve realism, texture, lighting, clarity, edge quality, and commercial polish."
      : "This is a repaint task. Use the current image as the base, keep the same product identity, and redesign the composition, atmosphere, styling, and conversion emphasis according to the section goal.";

  return [
    buildSectionImagePrompt(section, referenceAssets, aspectRatio, contentLanguage, styleGuide, adjacentSections, productFacts, includePackaging, variantContext, platform),
    modeInstruction,
    "The current section image must be treated as the editable base image.",
    "Keep the product identical to the uploaded main product image and do not replace it with a different item.",
    "Output one marketplace-ready mobile e-commerce image only.",
  ].join("\n");
}

export function buildSectionSvgLayoutPrompt(
  section: PageSection,
  referenceAssets: ProductAsset[] = [],
  aspectRatio: "1:1" | "3:4" | "9:16" = "9:16",
  contentLanguage: ContentLanguage = "zh-CN",
  styleGuide?: StyleGuide,
) {
  const targetLanguage = contentLanguageNamesForPrompt[normalizeContentLanguage(contentLanguage)];

  const paletteLines = styleGuide?.colorPalette
    ? [
        "=== Project unified color palette (MUST use) ===",
        `Background: ${styleGuide.colorPalette.background ?? "#F5F5F5"}`,
        `Primary: ${styleGuide.colorPalette.primary ?? "#1A1A1A"}`,
        `Secondary: ${styleGuide.colorPalette.secondary ?? "#888888"}`,
        `Accent: ${styleGuide.colorPalette.accent ?? "#D4A574"}`,
        `Text: ${styleGuide.colorPalette.text ?? "#111111"}`,
        "The SVG backgroundColor, accentColor, and panelColor must be chosen from or harmonize with this palette.",
      ]
    : [];

  const visualSystemLines = styleGuide?.visualSystem
    ? [
        "=== Project unified visual system (MUST follow) ===",
        `Lighting: ${styleGuide.visualSystem.lighting ?? "soft diffused"}`,
        `Shadows: ${styleGuide.visualSystem.shadowStyle ?? "soft"}`,
        `Texture/backgrounds: ${styleGuide.visualSystem.textureStyle ?? "clean"}`,
        `Typography scale: ${styleGuide.visualSystem.typographyScale ?? "balanced"}`,
      ]
    : [];

  return [
    "You are designing a mobile e-commerce section poster that will be rendered as SVG.",
    "Return one strict JSON object only.",
    `All user-facing copy must be written in ${targetLanguage}.`,
    `Section type: ${section.type}`,
    `Section title: ${section.title}`,
    `Section goal: ${section.goal}`,
    `Section copy: ${section.copy}`,
    `Visual prompt guidance: ${section.visualPrompt}`,
    `Target aspect ratio: ${aspectRatio}`,
    "",
    ...paletteLines,
    "",
    ...visualSystemLines,
    "",
    buildReferenceText(referenceAssets),
    "Use the main uploaded product image as the product identity reference when composing the layout.",
    "Target JSON shape:",
    `{
  "headline": "string",
  "subheadline": "string",
  "badge": "string",
  "highlights": ["string", "string", "string"],
  "backgroundColor": "#F5E9D8",
  "accentColor": "#A85A2A",
  "panelColor": "#FFF8F0"
}`,
    "Keep the headline concise and commercial.",
    "highlights should contain 2 to 4 short selling points.",
  ].join("\n");
}
