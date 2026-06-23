import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { assetPublicUrl, assetToDataUrl, readStorageFile, saveStyleAnchorImage } from "@/lib/storage/asset-manager";
import { getProviderAdapter } from "@/lib/services/provider-service";
import type { StyleGuideColorPalette } from "@/lib/ai/prompts";

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

export async function generateStyleAnchorImage(projectId: string) {
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

  return styleGuide;
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
