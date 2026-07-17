import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { assetPublicUrl, assetToDataUrl, readStorageFile, saveStyleAnchorImage } from "@/lib/storage/asset-manager";
import { getProviderAdapter } from "@/lib/services/provider-service";
import type { StyleGuideColorPalette } from "@/lib/ai/prompts";
import type { PaletteOption } from "@/types/domain";

const colorPaletteSchema = z.object({
  background: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  text: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  reasoning: z.string().optional(),
});

export type ExtractedColorPalette = z.infer<typeof colorPaletteSchema>;

function scoreVisionModelPriority(modelId: string) {
  const id = modelId.toLowerCase();
  let score = 0;
  if (/gpt-4o|gpt-5|claude-3.5|claude-4|gemini-1\.5|gemini-2|qwen-vl/.test(id)) score += 10;
  if (/vision|vl/.test(id)) score += 5;
  if (/pro|max|ultra/.test(id)) score += 3;
  if (/preview|experimental|beta|test/.test(id)) score -= 3;
  return score;
}

function pickVisionModel(models: Array<{ modelId: string; capabilities: unknown }>) {
  const visionModels = models.filter((model) => {
    const capabilities = (model.capabilities ?? {}) as Record<string, unknown>;
    return Boolean(capabilities.vision) || Boolean(capabilities.image_vision);
  });
  if (!visionModels.length) return null;
  return visionModels
    .slice()
    .sort((a, b) => scoreVisionModelPriority(b.modelId) - scoreVisionModelPriority(a.modelId))[0]?.modelId ?? null;
}

export async function extractColorPaletteFromImage(imageDataUrl: string): Promise<StyleGuideColorPalette> {
  const { adapter, provider } = await getProviderAdapter("text");
  const visionModel = pickVisionModel(provider.models);

  if (!visionModel) {
    throw new Error("当前没有可用的 vision 模型来提取颜色。请配置支持 vision 的文本模型。");
  }

  const systemPrompt =
    "You are a brand color expert. Analyze the product image and return a harmonious e-commerce color palette as strict JSON only.";

  const userPrompt = [
    "Analyze this product image and extract a 5-color palette for a mobile e-commerce detail page.",
    "",
    "Requirements:",
    "- background: a clean, neutral or subtly tinted background color that lets the product stand out",
    "- primary: the most dominant color from the product itself (its main body/material color)",
    "- secondary: a supporting color found in the product (packaging, secondary material, or subtle hue)",
    "- accent: a small but eye-catching color for CTAs, badges, and highlights (could be a logo color, label color, or complementary hue)",
    "- text: a high-contrast readable text color that works on the background",
    "",
    "Rules:",
    "- Return exactly 6-digit HEX colors with leading #.",
    "- Colors must be harmonious and suitable for a commercial product page.",
    "- Do not pick colors that make text unreadable.",
    "- Keep the palette faithful to the real product; do not invent unrelated fantasy colors.",
    "",
    "Return JSON shape:",
    '{"background":"#FFFFFF","primary":"#1A1A1A","secondary":"#888888","accent":"#C9A227","text":"#111111","reasoning":"brief explanation"}',
  ].join("\n");

  const result = await adapter.generateStructured({
    model: visionModel,
    systemPrompt,
    userPrompt,
    schema: colorPaletteSchema,
    images: [imageDataUrl],
    timeoutMs: 60000,
  });

  return {
    background: result.parsed.background,
    primary: result.parsed.primary,
    secondary: result.parsed.secondary,
    accent: result.parsed.accent,
    text: result.parsed.text,
  };
}

export async function extractColorPaletteFromAsset(assetId: string): Promise<StyleGuideColorPalette> {
  const asset = await prisma.productAsset.findUnique({ where: { id: assetId } });
  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }
  const dataUrl = await assetToDataUrl(asset);
  return extractColorPaletteFromImage(dataUrl);
}

export async function generateStyleAnchorImage(projectId: string, preferredModelId?: string | null) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { assets: { orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }], take: 1 } },
  });
  if (!project) {
    throw new Error("Project not found.");
  }

  const snapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
  const previewConfig = (snapshot.previewConfig ?? {}) as Record<string, unknown>;
  const detailAspectRatio = previewConfig.imageAspectRatio === "3:4" ? "3:4" : "9:16";
  const styleGuide = (snapshot.styleGuide ?? {}) as Record<string, unknown>;
  const colorPalette = (styleGuide.colorPalette ?? {}) as Record<string, string>;
  const visualSystem = (styleGuide.visualSystem ?? {}) as Record<string, string>;
  const typography = (styleGuide.typography ?? {}) as Record<string, string>;
  const productConstraints = {
    productAngle: visualSystem.productAngle,
    productSizeRatio: visualSystem.productSizeRatio,
    productPosition: visualSystem.productPosition,
  };

  const { adapter, provider } = await getProviderAdapter("image");
  const model =
    preferredModelId ??
    provider.models.find((item) => item.isDefaultHeroImage)?.modelId ??
    provider.models.find((item) => (item.capabilities as Record<string, boolean>).image_gen)?.modelId ??
    provider.models[0]?.modelId;

  if (!model) {
    throw new Error("当前没有可用的图片生成模型来生成风格锚点图。");
  }

  const mainProductAsset = project.assets[0] ?? null;
  const referenceImages: string[] = [];
  if (mainProductAsset) {
    referenceImages.push(await assetToDataUrl(mainProductAsset));
  }

  const prompt = [
    `Create a single vertical ${detailAspectRatio} style-anchor / mood-board image for a mobile e-commerce detail page.`,
    "This image will be used as the visual reference for ALL sections of the product page, so it must establish and lock the unified visual style.",
    "",
    "=== Unified color palette ===",
    `Background/canvas: ${colorPalette.background ?? "#F8F8F8"}`,
    `Primary/dominant: ${colorPalette.primary ?? "#1A1A1A"}`,
    `Secondary/supporting: ${colorPalette.secondary ?? "#888888"}`,
    `Accent/highlight: ${colorPalette.accent ?? "#D4A574"}`,
    `Text/copy: ${colorPalette.text ?? "#111111"}`,
    "",
    "=== Unified visual system ===",
    visualSystem.lighting ? `Lighting: ${visualSystem.lighting}` : "",
    visualSystem.shadowStyle ? `Shadows: ${visualSystem.shadowStyle}` : "",
    visualSystem.textureStyle ? `Textures/backgrounds: ${visualSystem.textureStyle}` : "",
    visualSystem.compositionGrid ? `Composition grid: ${visualSystem.compositionGrid}` : "",
    visualSystem.typographyScale ? `Typography scale: ${visualSystem.typographyScale}` : "",
    visualSystem.badgeStyle ? `Badge style: ${visualSystem.badgeStyle}` : "",
    visualSystem.iconStyle ? `Icon style: ${visualSystem.iconStyle}` : "",
    "",
    "=== Typography lock ===",
    typography.headingFont ? `Heading font: ${typography.headingFont}` : "",
    typography.bodyFont ? `Body font: ${typography.bodyFont}` : "",
    typography.headingStyle ? `Heading style: ${typography.headingStyle}` : "",
    typography.bodyStyle ? `Body style: ${typography.bodyStyle}` : "",
    "",
    "=== Product presentation lock ===",
    productConstraints.productAngle ? `Product angle/pose: ${productConstraints.productAngle}` : "",
    productConstraints.productSizeRatio ? `Product size ratio: ${productConstraints.productSizeRatio}` : "",
    productConstraints.productPosition ? `Product position: ${productConstraints.productPosition}` : "",
    "",
    "=== Requirements ===",
    "- Show one clean composition with the product as hero, plus sample typography, badge, and accent element layout.",
    "- Do NOT include dense information or many sections; this is a single style reference image.",
    "- Keep the product faithful to the uploaded main product image (same identity/material/color).",
    "- Lighting, shadow style, color treatment, typography, and product presentation must be consistent and repeatable across the whole page.",
    "- Output one polished vertical image only.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await adapter.generateImage({
    model,
    prompt,
    aspectRatio: detailAspectRatio,
    referenceImages,
    monitor: {
      projectId,
      operation: "generate_style_anchor",
    },
  });

  const imageAsset = await saveStyleAnchorImage({
    projectId,
    prompt,
    source: result,
    metadata: {
      model,
      colorPalette,
      visualSystem,
    },
  });

  // Update project snapshot with anchor reference
  await prisma.project.update({
    where: { id: projectId },
    data: {
      modelSnapshot: {
        ...snapshot,
        styleGuide: {
          ...styleGuide,
          anchorImageAssetId: imageAsset.id,
          anchorImageUrl: assetPublicUrl(imageAsset),
        },
      } as Prisma.InputJsonValue,
    },
  });

  return imageAsset;
}

export async function regenerateProjectStyleGuide(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error("Project not found.");
  }

  const snapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
  const existingStyleGuide = (snapshot.styleGuide ?? {}) as Record<string, unknown>;
  const existingPalette = (existingStyleGuide.colorPalette ?? {}) as Record<string, string>;

  let extractedPalette: StyleGuideColorPalette;
  try {
    extractedPalette = await extractProjectColorPalette(projectId);
  } catch (error) {
    console.error("[ColorPalette] Extraction failed, keeping existing palette:", error);
    extractedPalette = {
      background: existingPalette.background,
      primary: existingPalette.primary,
      secondary: existingPalette.secondary,
      accent: existingPalette.accent,
      text: existingPalette.text,
    };
  }

  const styleGuide = {
    ...existingStyleGuide,
    colorPalette: {
      ...existingPalette,
      ...(extractedPalette.background ? { background: extractedPalette.background } : {}),
      ...(extractedPalette.primary ? { primary: extractedPalette.primary } : {}),
      ...(extractedPalette.secondary ? { secondary: extractedPalette.secondary } : {}),
      ...(extractedPalette.accent ? { accent: extractedPalette.accent } : {}),
      ...(extractedPalette.text ? { text: extractedPalette.text } : {}),
    },
  };

  await prisma.project.update({
    where: { id: projectId },
    data: {
      modelSnapshot: {
        ...snapshot,
        styleGuide,
      } as Prisma.InputJsonValue,
    },
  });

  // Regenerate the style anchor so it stays visually consistent with the refreshed palette.
  try {
    await generateStyleAnchorImage(projectId);
  } catch (error) {
    console.error("[StyleAnchor] Failed to regenerate anchor after palette refresh:", error);
  }

  const refreshedProject = await prisma.project.findUnique({ where: { id: projectId } });
  const refreshedSnapshot = (refreshedProject?.modelSnapshot as Record<string, unknown> | null) ?? {};
  return refreshedSnapshot.styleGuide ?? styleGuide;
}

export async function extractProjectColorPalette(projectId: string): Promise<StyleGuideColorPalette> {
  const assets = await prisma.productAsset.findMany({
    where: { projectId, type: { in: ["MAIN", "ANGLE", "DETAIL"] } },
    orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    take: 3,
  });

  if (!assets.length) {
    throw new Error("项目中暂无可用商品图片来提取颜色。");
  }

  // If only one image, extract directly
  if (assets.length === 1) {
    return extractColorPaletteFromAsset(assets[0].id);
  }

  // If multiple images, combine them into one canvas for unified extraction
  const sharp = (await import("sharp")).default;
  const buffers = await Promise.all(assets.map((asset) => readStorageFile(asset.filePath)));
  const resized = await Promise.all(
    buffers.map((buffer) =>
      sharp(buffer)
        .resize(400, 400, { fit: "cover" })
        .toBuffer(),
    ),
  );

  // Compose horizontally
  const compositeWidth = 400 * resized.length;
  const composed = await sharp({
    create: { width: compositeWidth, height: 400, channels: 3, background: { r: 245, g: 245, b: 245 } },
  })
    .composite(resized.map((buffer, index) => ({ input: buffer, left: index * 400, top: 0 })))
    .jpeg({ quality: 85 })
    .toBuffer();

  const dataUrl = `data:image/jpeg;base64,${composed.toString("base64")}`;
  return extractColorPaletteFromImage(dataUrl);
}

// ---------------------------------------------------------------------------
// Palette option generation
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case red:
        h = (green - blue) / delta + (green < blue ? 6 : 0);
        break;
      case green:
        h = (blue - red) / delta + 2;
        break;
      case blue:
        h = (red - green) / delta + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const lightness = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const rgb = hexToRgb(hex);
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function isValidHex(value: string | undefined): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function isGrayscale(hex: string): boolean {
  const { s } = hexToHsl(hex);
  return s < 0.08;
}

function blendWithTheme(productHex: string, themeHex: string, blend = 0.35): string {
  const productHsl = hexToHsl(productHex);
  const themeHsl = hexToHsl(themeHex);

  // Hue: move product hue partway toward theme hue along shortest path
  let hueDiff = themeHsl.h - productHsl.h;
  if (hueDiff > 180) hueDiff -= 360;
  if (hueDiff < -180) hueDiff += 360;
  const h = productHsl.h + hueDiff * blend;

  // Saturation/lightness: slightly pull toward theme
  const s = productHsl.s + (themeHsl.s - productHsl.s) * blend;
  const l = productHsl.l + (themeHsl.l - productHsl.l) * blend * 0.5;

  return hslToHex(h, clamp(s, 0, 1), clamp(l, 0, 1));
}

function ensureContrast(background: string, text: string, minRatio = 4.5): string {
  const bgL = hexToHsl(background).l;
  const textL = hexToHsl(text).l;
  const ratio = (bgL + 0.05) / (textL + 0.05);
  const safeRatio = ratio >= 1 ? ratio : 1 / ratio;
  if (safeRatio >= minRatio) return text;

  // Push text toward opposite lightness
  const targetL = bgL > 0.5 ? 0.08 : 0.92;
  const { h, s } = hexToHsl(text);
  return hslToHex(h, s, targetL);
}

function lighterSurface(background: string): string {
  const { h, s, l } = hexToHsl(background);
  return hslToHex(h, Math.max(0, s - 0.03), Math.min(0.98, l + 0.06));
}

interface PaletteTheme {
  id: string;
  name: string;
  description: string;
  colorTokens: {
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    accent: string;
    text: string;
  };
}

const paletteThemes: PaletteTheme[] = [
  {
    id: "warm",
    name: "温暖养生",
    description: "暖调米白背景，搭配产品主色与暖橙/砖红强调，适合食品、养生、生活方式类商品。",
    colorTokens: {
      background: "#FAF6F1",
      surface: "#FFFFFF",
      primary: "#8B4A2F",
      secondary: "#C49A6C",
      accent: "#D96C4A",
      text: "#2C211B",
    },
  },
  {
    id: "cool",
    name: "清新冷调",
    description: "干净冷白背景，搭配青蓝/雾蓝强调，适合科技、个护、清爽风格商品。",
    colorTokens: {
      background: "#F3F7FA",
      surface: "#FFFFFF",
      primary: "#2A4D69",
      secondary: "#6B8FAB",
      accent: "#3A9BCD",
      text: "#1A2530",
    },
  },
  {
    id: "luxury",
    name: "奢华高端",
    description: "深背景配香槟金/暗金强调，营造高端、克制、仪式感，适合高客单价商品。",
    colorTokens: {
      background: "#15120F",
      surface: "#1E1A16",
      primary: "#E8DCC4",
      secondary: "#A89F91",
      accent: "#C9A227",
      text: "#F5F1EA",
    },
  },
  {
    id: "natural",
    name: "自然原生",
    description: "草纸/亚麻质感背景，搭配植物绿/大地色，适合天然、有机、手作类商品。",
    colorTokens: {
      background: "#F5F0E6",
      surface: "#FFFFFF",
      primary: "#4A5D45",
      secondary: "#8B9D83",
      accent: "#B89A5A",
      text: "#2A2620",
    },
  },
  {
    id: "minimal",
    name: "极简干净",
    description: "中性浅灰背景，高对比黑白灰，适合科技、日常、强调产品本身的商品。",
    colorTokens: {
      background: "#F7F7F7",
      surface: "#FFFFFF",
      primary: "#1A1A1A",
      secondary: "#888888",
      accent: "#B0B0B0",
      text: "#111111",
    },
  },
];

function buildPaletteOptionFromTheme(
  theme: PaletteTheme,
  extracted: Partial<StyleGuideColorPalette>,
): PaletteOption {
  const tokens = { ...theme.colorTokens };

  // Respect the real product identity colors when available
  if (isValidHex(extracted.primary) && !isGrayscale(extracted.primary)) {
    tokens.primary = blendWithTheme(extracted.primary, theme.colorTokens.primary, 0.25);
  }

  if (isValidHex(extracted.secondary) && !isGrayscale(extracted.secondary)) {
    tokens.secondary = blendWithTheme(extracted.secondary, theme.colorTokens.secondary, 0.3);
  }

  if (isValidHex(extracted.accent) && !isGrayscale(extracted.accent)) {
    tokens.accent = blendWithTheme(extracted.accent, theme.colorTokens.accent, 0.35);
  }

  if (isValidHex(extracted.background)) {
    // Keep theme background but gently tint with product background
    tokens.background = blendWithTheme(theme.colorTokens.background, extracted.background, 0.15);
  }

  tokens.surface = lighterSurface(tokens.background);
  tokens.text = ensureContrast(tokens.background, isValidHex(extracted.text) ? extracted.text : theme.colorTokens.text);

  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    colorTokens: {
      primary: tokens.primary,
      secondary: tokens.secondary,
      accent: tokens.accent,
      background: tokens.background,
      surface: tokens.surface,
      text: tokens.text,
    },
  };
}

function rankThemesByStyleHint(detectedStyle: string | undefined | null, styleTags: string[] | undefined): PaletteTheme[] {
  const hints = [
    ...(detectedStyle ? [detectedStyle] : []),
    ...(styleTags ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const scoreMap: Record<string, number> = {
    warm: 0,
    cool: 0,
    luxury: 0,
    natural: 0,
    minimal: 0,
  };

  const keywords: Record<string, string[]> = {
    warm: ["温暖", "养生", "食养", " Lifestyle", "柔和", "暖", "温馨", "亲和", "食品"],
    cool: ["科技", "清爽", "冷", "蓝", "清新", "极简", "未来", "冷色调", "cool"],
    luxury: ["奢华", "高端", "黑金", " Luxury", "premium", "高级", "贵重", "仪式感"],
    natural: ["自然", "原生", "有机", "手作", "草本", "亚麻", "大地", "木", "天然"],
    minimal: ["极简", "干净", "北欧", "简约", "白", "灰", "克制", "少即是多"],
  };

  for (const [themeId, words] of Object.entries(keywords)) {
    for (const word of words) {
      if (hints.includes(word)) {
        scoreMap[themeId] += 1;
      }
    }
  }

  // Default tie-breaker: warm first for lifestyle/food, minimal for generic
  return [...paletteThemes].sort((a, b) => scoreMap[b.id] - scoreMap[a.id]);
}

export async function generatePaletteOptions(input: {
  projectId: string;
  detectedStyle?: string | null;
  styleTags?: string[] | null;
  projectStyle?: string | null;
  extractedPalette?: Partial<StyleGuideColorPalette>;
}): Promise<PaletteOption[]> {
  const { projectId, detectedStyle, styleTags, projectStyle, extractedPalette } = input;

  // Try to get product-faithful colors if no extracted palette was passed in
  let productPalette = extractedPalette ?? {};
  if (!productPalette.primary || !productPalette.accent) {
    try {
      productPalette = await extractProjectColorPalette(projectId);
    } catch (error) {
      console.error("[PaletteOptions] Could not extract product palette, using theme defaults:", error);
      productPalette = extractedPalette ?? {};
    }
  }

  const styleHint = detectedStyle || projectStyle || "";
  const rankedThemes = rankThemesByStyleHint(styleHint, styleTags ?? []);

  // Return 3-5 options; prefer the top-ranked themes but always give at least warm/cool/minimal
  const selectedThemes = rankedThemes.slice(0, 4);
  if (!selectedThemes.some((theme) => theme.id === "minimal")) {
    const minimal = paletteThemes.find((theme) => theme.id === "minimal");
    if (minimal) selectedThemes.push(minimal);
  }

  return selectedThemes.map((theme) => buildPaletteOptionFromTheme(theme, productPalette));
}

export function applyPaletteToStyleGuide(
  styleGuide: Record<string, unknown>,
  palette: PaletteOption,
): Record<string, unknown> {
  // Drop any existing anchor so the next lazy generation picks up the new palette.
  const { anchorImageAssetId: _anchorAssetId, anchorImageUrl: _anchorUrl, ...rest } = styleGuide;
  void _anchorAssetId;
  void _anchorUrl;

  return {
    ...rest,
    colorPalette: {
      background: palette.colorTokens.background,
      primary: palette.colorTokens.primary,
      secondary: palette.colorTokens.secondary,
      accent: palette.colorTokens.accent,
      text: palette.colorTokens.text,
    },
    selectedPaletteId: palette.id,
  };
}

// ---------------------------------------------------------------------------
// Lazy style anchor generation
// ---------------------------------------------------------------------------

const anchorLocks = new Map<string, Promise<unknown>>();

async function readExistingStyleAnchor(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { modelSnapshot: true },
  });
  if (!project) return null;

  const snapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
  const styleGuide = snapshot.styleGuide as Record<string, unknown> | null;
  const anchorAssetId = typeof styleGuide?.anchorImageAssetId === "string" ? styleGuide.anchorImageAssetId : null;
  if (!anchorAssetId) return null;

  return prisma.productAsset.findUnique({ where: { id: anchorAssetId } });
}

export async function getOrCreateStyleAnchor(
  projectId: string,
  preferredModelId?: string | null,
): Promise<import("@prisma/client").ProductAsset | null> {
  const existing = await readExistingStyleAnchor(projectId);
  if (existing) return existing;

  const currentLock = anchorLocks.get(projectId);
  if (currentLock) {
    return currentLock as Promise<import("@prisma/client").ProductAsset | null>;
  }

  const promise = (async () => {
    try {
      return await generateStyleAnchorImage(projectId, preferredModelId);
    } catch (error) {
      console.error("[StyleAnchor] Lazy anchor generation failed:", error);
      return null;
    }
  })();

  anchorLocks.set(projectId, promise);
  try {
    return await promise;
  } finally {
    anchorLocks.delete(projectId);
  }
}
