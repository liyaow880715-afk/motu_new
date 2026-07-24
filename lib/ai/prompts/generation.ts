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
  const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
  const hasLockedHeadline = Boolean(readLockedTitles(section).mainTitle);
  const isLifestyleScene = isLifestyleSceneSection(
    section.type,
    editableData.visualMode,
    `${section.title} ${section.goal} ${section.visualPrompt}`,
  );
  const verifiedClaims = (productFacts?.factClaims ?? []).filter(
    (claim) => claim.source !== "analysis_inference" && claim.confidence === "high" && claim.eligibleForMarketing,
  );
  const claimIsVerified = brief.singleClaim
    ? verifiedClaims.some((claim) => claim.claim === brief.singleClaim || claim.claim.includes(brief.singleClaim) || brief.singleClaim.includes(claim.claim))
    : false;
  const lines = [
    "=== Commercial objective ===",
    `Shopper: ${brief.targetShopper}. Resolve: ${brief.primaryObjection}. Desired response: ${brief.desiredAction}.`,
    `Visual reason to believe: ${brief.proofDevice}. Platform/stage: ${brief.platformProfile} / ${brief.funnelStage}.`,
  ];

  if (claimIsVerified) {
    lines.push(`Approved factual support: ${brief.singleClaim} (${brief.claimSource || "verified product fact"}). Keep it subordinate unless this is a data section.`);
  } else {
    lines.push("No verified factual claim: keep copy experiential and add no numeric, efficacy, certification, urgency, popularity, or comparative claim.");
  }

  if (verifiedClaims.length > 0) {
    lines.push("Approved fact whitelist (do not go beyond it):");
    verifiedClaims.forEach((claim) => lines.push(`- ${claim.claim}${claim.evidence ? ` (${claim.evidence})` : ""}`));
  }

  if (isLifestyleScene) {
    lines.push("Lifestyle priority: setting, action, product interaction, and sensory/emotional payoff must carry the idea.");
  }

  lines.push(
    `Copy limit: one headline <=${brief.textBudget.headlineMaxChars} characters, ${brief.textBudget.sublineMaxChars > 0 ? `one optional subline <=${brief.textBudget.sublineMaxChars} characters` : "no subline"}, ${hasLockedHeadline ? 0 : brief.textBudget.badgeCount} badge(s).`,
    brief.textBudget.ctaAllowed ? "A short CTA is allowed only if it remains subordinate to the product." : "Do not add a CTA in this image.",
    "Communicate one shopper idea through one scene/proof; facts support the idea rather than replace it.",
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

function isFactOnlyTitle(value: string) {
  return isDisclaimerLike(value) || /(?:[<>≥≤=]|\d+(?:\.\d+)?\s*(?:%|ml|mL|g|kg|克|毫升)|NFC|原汁|净含量|添加|含量|配料|参数|规格|营养)/i.test(value);
}

function cleanCopyCandidate(value: string) {
  return value
    .replace(/^(?:主标题|标题|headline|副标题|subline|卖点)\s*[：:]\s*/i, "")
    .replace(/^[\s\-•·]+/, "")
    .trim();
}

function readRenderableTitles(section: PageSection, isLifestyleScene: boolean) {
  const locked = readLockedTitles(section);
  if (!isLifestyleScene || !locked.mainTitle || !isFactOnlyTitle(locked.mainTitle)) {
    return locked;
  }

  const benefitCandidate = section.copy
    .split(/[\n；;]/)
    .map(cleanCopyCandidate)
    .find((item) => item.length >= 4 && item.length <= 24 && !isFactOnlyTitle(item));

  if (!benefitCandidate) {
    return {
      mainTitle: "",
      subTitle: isDisclaimerLike(locked.mainTitle) ? "" : locked.mainTitle,
      complianceNote: locked.complianceNote,
    };
  }

  return {
    mainTitle: benefitCandidate,
    subTitle: isDisclaimerLike(locked.mainTitle) ? "" : locked.mainTitle,
    complianceNote: locked.complianceNote,
  };
}

function buildTypographyArtDirection(section: PageSection, isLifestyleScene: boolean): string {
  const { mainTitle, subTitle, complianceNote } = readRenderableTitles(section, isLifestyleScene);
  const design = readTitleDesign(section, isLifestyleScene);
  const complianceInstruction = complianceNote
    ? `Render the exact compliance note "${complianceNote}" once at the bottom-left or bottom-right corner in the smallest readable type, roughly 25-35% of subline height. Keep it neutral, unaccented, outside the title group, and free of any badge, panel, or color block.`
    : "Do not invent a compliance note or packaging disclaimer.";
  const emphasisInstruction = design.emphasis && mainTitle.includes(design.emphasis)
    ? `Make "${design.emphasis}" the only emphasized phrase using the project accent color, heavier weight, and 1.25-1.35x the size of the remaining headline text.`
    : "Use one controlled weight contrast inside the headline; do not turn any word into a badge.";
  let lineBreakInstruction = "Use semantic line breaks only; keep punctuation and phrases intact.";
  if (
    design.lineBreakAfter &&
    mainTitle.includes(design.lineBreakAfter) &&
    !mainTitle.endsWith(design.lineBreakAfter)
  ) {
    const splitIndex = mainTitle.indexOf(design.lineBreakAfter) + design.lineBreakAfter.length;
    lineBreakInstruction = `Break the exact headline only as "${mainTitle.slice(0, splitIndex)}" / "${mainTitle.slice(splitIndex)}"; do not break it anywhere else.`;
  }

  if (isLifestyleScene) {
    if (!mainTitle) {
      return [
        "Typography: create one concise, product-specific scene-payoff headline from the section goal or copy and place it in natural negative space.",
        "Apply the competitor-substitution test: the headline must name this actual occasion/action plus a sensory or use payoff that would not fit an unrelated product unchanged.",
        "The headline should express the sensory payoff or usefulness of the moment, not a packaging fact or compliance disclaimer.",
        subTitle
          ? `Render the smaller supporting line "${subTitle}" verbatim once beneath the generated headline; do not paraphrase it.`
          : "Do not invent a factual supporting line when none is supplied.",
        complianceInstruction,
        "Use no badge, CTA, information card, or text over the product, label, hand, or key action.",
      ].join("\n");
    }

    const titleGroup = subTitle
      ? `headline \"${mainTitle}\" and smaller supporting line \"${subTitle}\"`
      : `headline \"${mainTitle}\" with no supporting line`;
    return [
      `Typography: render one compact title group containing ${titleGroup}.`,
      "Quoted text is exact: render every character verbatim once; do not paraphrase, add, omit, reorder, or substitute.",
      "The headline is the shopper benefit or emotional payoff; the supporting line is factual reason-to-believe. Never promote a disclaimer such as \"以包装标示为准\" into the headline.",
      `Place the ${design.alignment}-aligned group ${design.placement.replace("_", " ")} in natural negative space, separate from the product label and human action. Keep the headline to ${design.maxLines} short line(s).`,
      emphasisInstruction,
      lineBreakInstruction,
      subTitle ? "Set the supporting line at roughly 45-55% of headline height with a lighter weight and clear spacing." : "Do not create an empty subtitle placeholder.",
      complianceInstruction,
      "Use expressive editorial typography with clear scale contrast, but keep the whole title group compact at roughly 10-18% of canvas height. Avoid a flat single-weight system-font treatment. No badge, CTA, opaque panel, inset, or card.",
    ].join("\n");
  }

  if (!mainTitle) {
    return [
      "Typography: use one short factual headline from the section copy, set compactly in clear negative space. Do not repeat it in a badge or card, and never cover the product label.",
      complianceInstruction,
    ].join("\n");
  }

  const placement = design.placement === "side" ? "beside the product" : design.placement.replace("_", " ");
  const isDataSection = ["SPECS", "INGREDIENTS_TABLE", "COMPARISON"].includes(section.type);
  const titleGroup = subTitle
    ? `headline \"${mainTitle}\" and subline \"${subTitle}\"`
    : `headline \"${mainTitle}\" with no subline`;
  return [
    `Added marketing text is limited to one title group containing ${titleGroup}; keep all original packaging text unchanged.`,
    "Quoted text is exact: render every character verbatim once; do not paraphrase, add, omit, reorder, or substitute.",
    `Place the compact ${design.alignment}-aligned title group ${placement}; keep the headline to at most ${design.maxLines} semantic lines.`,
    lineBreakInstruction,
    subTitle ? "Set the subline as a small, lighter kicker above the headline." : "Do not add a subline.",
    emphasisInstruction,
    complianceInstruction,
    isDataSection
      ? "Use restrained data blocks only where required; the title itself must not look like a UI card."
      : "No badge, CTA, pill, panel, inset, or card. Keep text clear of the product silhouette and label.",
  ].join("\n");
}

function buildHeroPosterInstruction(section: PageSection, isLifestyleScene: boolean, variantContext?: VariantContext) {
  if (section.type !== "HERO" || isLifestyleScene || variantContext?.scope === "group") {
    return "";
  }

  return [
    "Hero composition: show one unduplicated reference product as the dominant subject, roughly 55-70% of frame height, with its real label unobstructed.",
    "Use remaining negative space for compact copy while preserving the product's dominant scale and complete silhouette.",
    "Excluded proof layouts: magnifier, circular inset, duplicate label crop, duplicate product, comparison panel, and pointer line. Show label-detail proof through a clear camera angle on the single product itself.",
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

function buildVariantScopeInstruction(variantContext?: VariantContext): string {
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
    if (variantContext.packagingNotes) lines.push(`Packaging/spec notes: ${variantContext.packagingNotes}`);
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
    "Use the provided reference images in the same order as the positions listed above. Reference image 1 corresponds to Position 1, reference image 2 to Position 2, and so on.",
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

  if (sectionType === "PACKAGING") {
    return [
      "=== Packaging-section reference contract ===",
      "The photographed MAIN/ANGLE/DETAIL product images are the highest-priority identity source for the physical bottle, cap, label artwork, printed text, logo, proportions, and liquid color.",
      "Use the outer-packaging reference for carton structure, folds, green-and-white color blocking, material, and carton-plus-bottle arrangement.",
      "If the outer-packaging reference conflicts with the photographed physical product or verified facts, never copy its conflicting brand, logo, claim, label wording, or alternate bottle shape. Keep unverifiable carton fine print visually quiet rather than inventing replacement characters.",
      "Make the carton-plus-physical-bottle grouping the hero of the composition: centered, large, standing on a subtle surface with a soft contact shadow.",
      "Keep the area immediately around the packaging clean; decorative elements, icons, and copy belong to the top title area or the bottom info-card area, never overlapping the packaging.",
      "Match the background colors and lighting to the project palette.",
    ].join(" ");
  }

  return [
    "=== Outer-packaging reference exclusion ===",
    "An outer-packaging image is included only as secondary product-family context and must not appear in the final composition.",
    "Show the photographed physical product only. Do not render any carton, outer box, shipping box, gift box, sleeve, package mockup, or alternate bottle from the packaging reference, even as a background or corner prop.",
    "The MAIN/ANGLE/DETAIL photographs remain the sole visual truth for bottle shape, logo, label artwork, printed text, and product color. Never copy conflicting words, graphics, branding, or container geometry from the outer-packaging reference.",
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
    `In-image text language: ${targetLanguage}. Render only the locked headline, optional support line, planned corner compliance note, and permitted CTA; add no other copy or badges.`,
    "Use correctly spelled native typography with no truncation, overlap, mirroring, or meaningless glyphs.",
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
      ? "Color direction: establish one cohesive 3-5 color photographic grade for the real environment. Preserve natural material and product colors; create impact with tonal contrast and one controlled accent."
      : "Color direction: establish one cohesive 3-5 color palette. Preserve the product's real material and color; create impact with tonal contrast and one controlled accent.";
  }

  return isLifestyleScene
    ? `Section color use: treat ${palette.background ?? "the project background"} as a grading anchor, use ${palette.primary ?? "the primary color"} and ${palette.secondary ?? "the secondary color"} in believable props/materials, and reserve ${palette.accent ?? "the accent color"} for a small high-impact highlight. Natural neutrals are allowed; do not turn the scene into a flat color canvas.`
    : `Section color use: use ${palette.background ?? "the project background"} as the base, ${palette.primary ?? "the primary color"} and ${palette.secondary ?? "the secondary color"} for hierarchy, ${palette.accent ?? "the accent color"} for one focal emphasis, and ${palette.text ?? "the text color"} for copy.`;
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
    lines.push(
      `Keep approximate color-area weights at ${visualSystem?.paletteRatio ?? "70% background/base, 20% primary/support, and no more than 10% accent"}. Preserve the product's real colors even when they fall outside this ratio.`,
    );
    if (styleGuide.paletteStyle === "contrast") {
      lines.push("Palette mode: conversion contrast. Build energy with decisive light/dark separation and the single project accent color.");
    }
    if (styleGuide.paletteStyle === "bold") {
      lines.push("Campaign impact: stronger light/dark separation and ONE controlled accent from the project palette, about 10% of frame; no new hue.");
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
      "Tone lock: keep color temperature, key-light direction, exposure baseline, shadow density, black level, and highlight roll-off consistent across every section. Composition may vary; the photographic grade must not.",
      `Values: ${vs.colorTemperature ?? "consistent commercial white balance"}; ${vs.lighting ?? "one key-light direction"}; ${vs.exposure ?? "protected highlights/readable shadows"}; ${vs.shadowStyle ?? "natural shadows"}; ${vs.contrastLevel ?? "medium-high contrast"}; ${vs.textureStyle ?? "realistic materials"}.`,
    );
    if (!isLifestyleScene && vs.compositionGrid) lines.push(`Poster composition guide: ${vs.compositionGrid}.`);
    if (!isLifestyleScene && vs.productSizeRatio) lines.push(`Product scale guide: ${vs.productSizeRatio}.`);
    if (isLifestyleScene) lines.push("For impact, vary location, camera height, lens perspective, foreground occlusion, depth, subject action, and product placement. Do not reuse the poster grid or a flat studio background.");
  }

  if (adjacentSections && adjacentSections.length > 0) {
    lines.push(
      isLifestyleScene
        ? "Adjacent continuity: match color temperature, shadow density, and overall brightness; deliberately change scene, camera, action, and layout."
        : "Adjacent continuity: match background tone, lighting temperature, shadow density, and overall brightness without repeating the same composition.",
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

function buildNegativePrompt(sectionType: string, includePackaging?: boolean) {
  const exclusions = [
    "watermarks or artifacts",
    "conflicting light, hue shifts, muddy shadows, or clipped highlights",
    "blurred product detail, distorted anatomy, or corrupted text",
    "tiny or edge-cropped product and unrelated decoration",
    "altered identity, material, color, or packaging structure",
    "plastic, oversmoothed, cartoon, or unapproved UI/text overlays",
  ];

  if (sectionType !== "PACKAGING" || !includePackaging) {
    exclusions.push("secondary outer retail packaging, gift boxes, shipping boxes, sleeves, or packaging props absent from the references");
  }

  return `Exclude: ${exclusions.join("; ")}. The real primary container, label, and wrapper remain part of product identity.`;
}

function buildCompositionInstruction(isLifestyleScene: boolean) {
  if (isLifestyleScene) {
    return [
      "Use a real environment with foreground, middle ground, and background depth; show the product naturally placed or actively used within that environment.",
      "Keep product and action dominant, the compact title in negative space, and framing free to serve the story.",
      "Create impact with a decisive silhouette, directional light, foreground occlusion, layered depth, captured action, and one controlled accent.",
    ].join(" ");
  }

  return [
    "Use a clear visual hierarchy: product first, headline/CTA second, supporting details third.",
    "Leave safe margins around the edges; do not place critical text or product parts too close to the border.",
    "Maintain high contrast between text and background so copy remains legible at mobile thumbnail size.",
    "Make the product the hero of the composition; scene and props should support, not distract from, the product.",
    "Create thumbnail impact through dominant product or proof scale, a clear silhouette, controlled light/dark separation, spatial depth or directional movement, and one accent color. Oversized text, badges, pills, cards, and decorative color blocks are excluded as impact devices.",
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
    "=== LIFESTYLE SCENE CONTRACT (HIGHEST VISUAL PRIORITY) ===",
    "Create an authentic lived-in moment using the specified setting, atmosphere, person/hand, action, props, and product interaction, not a studio packshot or poster.",
    "Show foreground, middle ground, and background depth with believable contact, scale, perspective, and shadows; the product must physically belong in the action.",
    "Communicate the shopper benefit before the viewer reads. Place only the compact benefit-led title group in real negative space, clear of product, label, hand, and action.",
    "Keep product identity and project grade consistent, but vary location, camera, depth, action, and product position for a distinct story.",
    variantContext?.scope === "group"
      ? "Show each requested variant exactly once."
      : "Show one physical product only; no duplicate container, cap, label, reflection, or background product.",
    "Exclude flat solid backgrounds, centered packshots, oversized factual callouts, opaque copy cards, and purposeless props.",
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
    lines.push(productFacts.packagingDescription);
    lines.push("包装由 AI 直接生成；除非本模块明确要求包装主体，否则仅将这段描述作为商品身份约束，不要虚构或改写包装信息。");
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
  const renderableTitles = readRenderableTitles(section, isLifestyleScene);
  const hasLockedHeadline = Boolean(renderableTitles.mainTitle || renderableTitles.subTitle);

  return [
    "You are a senior e-commerce key-visual designer creating marketplace-ready product artwork.",
    buildCommerceBriefInstruction(section, productFacts, platform),
    `Section type: ${section.type}`,
    `Section title: ${section.title}`,
    `Section goal: ${section.goal}`,
    hasLockedHeadline
      ? "Section source copy is intentionally omitted because the exact renderable-text whitelist below is active. Use the section goal and commerce brief for semantic context."
      : `Section copy: ${section.copy}`,
    `Visual prompt guidance: ${section.visualPrompt}`,
    isLifestyleScene ? "" : "Generate one finished, high-conversion e-commerce visual led by product benefit and visible product truth.",
    buildLifestyleSceneInstruction(section, isLifestyleScene, variantContext),
    isLifestyleScene ? "" : buildCompositionInstruction(false),
    buildTypographyArtDirection(section, isLifestyleScene),
    buildReferenceText(referenceAssets),
    buildMainImageInstruction(referenceAssets),
    buildProductFidelityInstruction(referenceAssets),
    buildPackagingCompositionInstruction(section.type, includePackaging),
    buildVariantScopeInstruction(variantContext),
    buildAspectInstruction(aspectRatio),
    buildTargetLanguageInstruction(contentLanguage),
    styleGuideInstruction,
    buildSectionColorInstruction(section.type, styleGuide?.colorPalette, isLifestyleScene),
    buildStructuredFactsInstruction(section, productFacts, includePackaging),
    isLifestyleScene ? "" : "Render only the planned title group, corner compliance note, and permitted CTA. Product first, benefit second, factual support third.",
    buildHeroPosterInstruction(section, isLifestyleScene, variantContext),
    "Ad-law guard: no absolute superlatives (最、第一、顶级、最佳、唯一), medical promises, 100% claims, or unverified certifications.",
    ["SPECS", "INGREDIENTS_TABLE"].includes(section.type)
      ? "Data guard: use only supplied nutrition, ingredient, and specification values verbatim; omit any missing row rather than estimate or invent it."
      : "Do not invent numeric or factual claims.",
    buildNegativePrompt(section.type, includePackaging),
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
