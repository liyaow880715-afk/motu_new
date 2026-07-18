import type { PageSection, ProductAsset } from "@prisma/client";

import {
  contentLanguageNamesForPrompt,
  normalizeContentLanguage,
  type ContentLanguage,
} from "@/lib/utils/content-language";

export interface ProductFacts {
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
  visualSystem?: {
    lighting?: string;
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

interface AdjacentSection {
  type: string;
  title: string;
  goal: string;
  imageUrl?: string;
}

function buildReferenceText(referenceAssets: ProductAsset[]) {
  if (!referenceAssets.length) {
    return "No reference images were provided.";
  }

  return `Reference images: ${referenceAssets.map((item) => item.fileName).join(" / ")}`;
}

function buildMainImageInstruction(referenceAssets: ProductAsset[]) {
  if (!referenceAssets.length) {
    return "If no product image reference is provided, infer the product carefully from the structured analysis and keep the same product identity across all generated sections.";
  }

  return [
    "The uploaded main product image is the source of truth for product identity.",
    "Keep the same product shape, material, color family, proportions, and key recognisable details across every generated hero image and detail image.",
    "Do not invent a different product.",
    "Use the provided image as the visual anchor, then change composition, scene, angle, crop, lighting, and selling-point emphasis according to the section goal.",
  ].join(" ");
}

function buildPackagingCompositionInstruction(sectionType: string, includePackaging?: boolean): string {
  if (!includePackaging) return "";

  const common = [
    "=== Packaging fidelity lock ===",
    "A real packaging reference image is provided. You MUST reproduce that exact packaging in this image: same brand, logo, text, colors, layout, proportions, and shape.",
    "Do NOT redesign the packaging, do NOT invent a different box/bag, do NOT change any text, barcode, nutrition table, or certification marks on it.",
    "You may freely design the background, lighting, surface, shadow, and atmosphere around the packaging.",
  ];

  if (sectionType === "PACKAGING") {
    return [
      ...common,
      "Make the packaging the hero of the composition: centered, large, standing on a subtle surface with a soft contact shadow.",
      "Keep the area immediately around the packaging clean; decorative elements, icons, and copy belong to the top title area or the bottom info-card area, never overlapping the packaging.",
      "Match the background colors and lighting to the project palette.",
    ].join(" ");
  }

  return [
    ...common,
    "Place the packaging from the reference as a small supporting prop (e.g. a corner of the scene), faithful to the reference, without overpowering the main product.",
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
    `All user-facing marketing copy that appears inside the image must be written in ${targetLanguage}.`,
    `The section title, key selling points, short supporting copy, disclaimers, and CTA should all be in ${targetLanguage} when they appear in the image.`,
    "Do not mix in Simplified Chinese unless the target language is Simplified Chinese.",
    "Keep the typography native, polished, and commercially readable for the target language.",
    "Spell all words correctly; do not truncate, overlap, or render text as meaningless glyphs, squiggles, or reversed/mirrored characters.",
  ].join(" ");
}

function isScenarioLikeSection(sectionType: string): boolean {
  return ["SCENARIO", "GIFT_SCENE", "ORIGIN", "AUDIENCE", "CONVERSION"].includes(sectionType);
}

function buildSectionColorInstruction(
  sectionType: string,
  palette?: StyleGuideColorPalette,
): string {
  if (!palette) {
    return [
      "Establish a single cohesive 3-5 color palette for the whole image (background, product, accent, text, panels) and stick to it consistently.",
      "Avoid clashing or randomly saturated colors; colors should reinforce the product mood and marketplace context.",
      "Do not apply conflicting color tints or hues to the product that change its real material or perceived color.",
      "Shadows and highlights should stay within the same color family rather than introducing unrelated rainbow shifts.",
    ].join(" ");
  }

  const lines: string[] = ["=== Color usage rules for this section (MUST follow) ==="];

  if (palette.background) {
    lines.push(`Background / canvas / negative space: use ${palette.background} as the dominant base. Do not replace it with wood, gradient, or a radically different hue.`);
  }

  if (palette.primary) {
    lines.push(`Headlines / primary panels / key brand blocks: use ${palette.primary}.`);
  }
  if (palette.secondary) {
    lines.push(`Supporting icons / secondary details / subtle decorations: use ${palette.secondary}.`);
  }
  if (palette.accent) {
    lines.push(`Highlights / badges / CTA / numbered accents: use ${palette.accent}.`);
  }
  if (palette.text) {
    lines.push(`Body copy / captions: use ${palette.text}.`);
  }

  if (isScenarioLikeSection(sectionType)) {
    lines.push(
      "This is a scenario/audience section. Any environmental props, tabletop, or backdrop must be tinted to harmonize with the project palette above. Avoid introducing large areas of off-palette warm wood, sepia, or environmental colors that would break page-level continuity.",
    );
  }

  lines.push(
    "All colors must stay within this 5-color family. Do not introduce new saturated hues, rainbow gradients, or neon accents. Shadows and highlights must stay in the same color family.",
  );

  return lines.join("\n");
}

function buildProjectStyleGuideInstruction(styleGuide?: StyleGuide, adjacentSections?: AdjacentSection[]) {
  const lines: string[] = [];

  if (styleGuide?.colorPalette) {
    const palette = styleGuide.colorPalette;
    lines.push("=== Project-wide unified color palette (MUST follow) ===");
    if (palette.background) lines.push(`Background / canvas: ${palette.background}`);
    if (palette.primary) lines.push(`Primary / dominant: ${palette.primary}`);
    if (palette.secondary) lines.push(`Secondary / supporting: ${palette.secondary}`);
    if (palette.accent) lines.push(`Accent / highlight: ${palette.accent}`);
    if (palette.text) lines.push(`Text / copy: ${palette.text}`);
    lines.push(
      "Use these exact colors as the foundation. Each section may emphasize different weights of the same palette, but do NOT introduce a new hue family that breaks page-level consistency.",
    );
    if (adjacentSections && adjacentSections.length > 0) {
      lines.push(
        `Critical continuity rule: the background/canvas of this section must use the same ${palette.background} tone as adjacent sections so the long image tiles seamlessly without a visible color band.`,
      );
    }
  }

  if (styleGuide?.mood) {
    lines.push(`Overall page mood: ${styleGuide.mood}.`);
  }

  if (styleGuide?.typography?.headingStyle) {
    lines.push(`Typography style: headings should feel ${styleGuide.typography.headingStyle}.`);
  }

  if (styleGuide?.typography?.headingFont) {
    lines.push(`Heading font: use a font that looks like "${styleGuide.typography.headingFont}" for all headlines and section titles.`);
  }

  if (styleGuide?.typography?.bodyFont) {
    lines.push(`Body font: use a font that looks like "${styleGuide.typography.bodyFont}" for all supporting copy, bullets, and disclaimers.`);
  }

  if (styleGuide?.visualSystem) {
    const vs = styleGuide.visualSystem;
    lines.push("=== Unified visual system (MUST follow across all sections) ===");
    if (vs.lighting) lines.push(`Lighting: ${vs.lighting}`);
    if (vs.shadowStyle) lines.push(`Shadow style: ${vs.shadowStyle}`);
    if (vs.textureStyle) lines.push(`Texture/background style: ${vs.textureStyle}`);
    if (vs.compositionGrid) lines.push(`Composition grid: ${vs.compositionGrid}`);
    if (vs.typographyScale) lines.push(`Typography scale: ${vs.typographyScale}`);
    if (vs.badgeStyle) lines.push(`Badge/label style: ${vs.badgeStyle}`);
    if (vs.iconStyle) lines.push(`Icon style: ${vs.iconStyle}`);
    if (vs.productAngle) {
      lines.push(`Product angle/pose: ${vs.productAngle}. Keep this consistent across all sections unless the section explicitly requires a different functional angle.`);
    }
    if (vs.productSizeRatio) {
      lines.push(`Product size ratio: ${vs.productSizeRatio}. Do not make the product suddenly tiny or oversized compared to other sections.`);
    }
    if (vs.productPosition) {
      lines.push(`Product position: ${vs.productPosition}. Keep the product anchored in a consistent region across sections for visual rhythm.`);
    }
    lines.push(
      "Apply these visual-system rules consistently. Do not switch to a different lighting direction, shadow style, or typography treatment in this section.",
    );
  }

  if (adjacentSections && adjacentSections.length > 0) {
    lines.push("=== Adjacent sections for visual transition ===");
    lines.push(
      "Ensure smooth tonal transition with the surrounding sections. Do not make this section's background or dominant color clash with adjacent modules.",
    );
    lines.push(
      "Mandatory: match the adjacent section's background tone, lighting color temperature, shadow density, and overall brightness. The top/bottom edge of this image must tile with the adjacent image without a visible hue or brightness jump.",
    );
    for (const adjacent of adjacentSections) {
      lines.push(`- [${adjacent.type}] ${adjacent.title}: ${adjacent.goal}`);
      if (adjacent.imageUrl) {
        lines.push("  A reference image of this adjacent section is also provided so you can match its color temperature, lighting, and density exactly.");
      }
    }
  }

  if (lines.length === 0) {
    return "";
  }

  return lines.join("\n");
}

function buildNegativePrompt(includePackaging?: boolean) {
  const lines = [
    "Avoid: watermark-like artifacts, multiple inconsistent light sources, oversaturated neon colors, muddy shadows, blown-out highlights.",
    "Avoid: blurry product details, extra fingers or limbs on models, distorted text, gibberish characters, cropped-off text, overlapping unreadable typography.",
    "Avoid: random decorative elements that do not support the selling point.",
    "Avoid: placing the product too small, too close to edges, or cut off by the frame.",
    "Avoid: changing the product identity, material, or color compared to the provided reference images.",
  ];

  if (!includePackaging) {
    lines.push(
      "ABSOLUTELY NO packaging, boxes, bags, bottles, jars, cans, tubes, pouches, labels, sleeves, shrink wrap, or product containers of any kind in the image.",
    );
  }

  return lines.join(" ");
}

function buildCompositionInstruction() {
  return [
    "Use a clear visual hierarchy: product first, headline/CTA second, supporting details third.",
    "Leave safe margins around the edges; do not place critical text or product parts too close to the border.",
    "Maintain high contrast between text and background so copy remains legible at mobile thumbnail size.",
    "Make the product the hero of the composition; scene and props should support, not distract from, the product.",
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
    lines.push("以上数据必须原样使用，禁止估算、修改或编造任何数值、单位或文字。如果数据为空，则只展示版式，不填写具体数值。");
  }

  // When packaging is composited locally, do NOT describe the packaging in the prompt,
  // otherwise the model will try to draw it.
  if (!includePackaging && productFacts.packagingDescription) {
    lines.push("=== 包装描述参考 ===");
    lines.push(productFacts.packagingDescription);
    lines.push("本模块不展示包装主体，以上描述仅用于保持品牌调性一致。");
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
) {
  const styleGuideInstruction = buildProjectStyleGuideInstruction(styleGuide, adjacentSections);

  return [
    "You are a senior e-commerce key-visual designer creating marketplace-ready product artwork.",
    `Section type: ${section.type}`,
    `Section title: ${section.title}`,
    `Section goal: ${section.goal}`,
    `Section copy: ${section.copy}`,
    `Visual prompt guidance: ${section.visualPrompt}`,
    buildStructuredFactsInstruction(section, productFacts, includePackaging),
    buildPackagingCompositionInstruction(section.type, includePackaging),
    buildReferenceText(referenceAssets),
    buildMainImageInstruction(referenceAssets),
    buildAspectInstruction(aspectRatio),
    buildTargetLanguageInstruction(contentLanguage),
    styleGuideInstruction,
    "Generate one high-conversion mobile e-commerce visual for this section.",
    "The image should emphasize product clarity, composition hierarchy, material texture, and marketplace aesthetics.",
    "The headline, selling points, supporting copy, and CTA should be visually designed inside the image rather than left for later DOM text insertion.",
    "Make the result feel like finished commercial artwork, not a blank template.",
    buildCompositionInstruction(),
    buildSectionColorInstruction(section.type, styleGuide?.colorPalette),
    buildNegativePrompt(includePackaging),
    "IMPORTANT: Any text embedded in the image must comply with Chinese Advertising Law. Do not include absolute superlatives (最, 第一, 顶级, 最佳, 唯一, 根治, 治愈, 100%, etc.), false medical claims, or unverified certifications inside the image text.",
    "CRITICAL: If the section involves nutrition facts, ingredients, or specifications, do NOT invent or estimate any numbers, percentages, or values. Only use exact data provided in the section copy. If specific numbers are not provided, show the layout/design without filling in fabricated data.",
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
) {
  return [
    buildSectionImagePrompt(section, referenceAssets, aspectRatio, contentLanguage, styleGuide, adjacentSections, productFacts, includePackaging),
    "This is a regeneration task. Keep the same product identity and selling-point direction, but improve composition accuracy, completion quality, and conversion appeal.",
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
) {
  const modeInstruction =
    mode === "enhance"
      ? "This is an enhancement task. Use the current image as the base, preserve the overall framing, and improve realism, texture, lighting, clarity, edge quality, and commercial polish."
      : "This is a repaint task. Use the current image as the base, keep the same product identity, and redesign the composition, atmosphere, styling, and conversion emphasis according to the section goal.";

  return [
    buildSectionImagePrompt(section, referenceAssets, aspectRatio, contentLanguage, styleGuide, adjacentSections, productFacts, includePackaging),
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
