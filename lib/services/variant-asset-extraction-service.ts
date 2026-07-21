import { z } from "zod";

import { getProviderAdapter } from "@/lib/services/provider-service";
import { prisma } from "@/lib/db/prisma";
import { assetToDataUrl } from "@/lib/storage/asset-manager";

const extractionSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  keyIngredients: z.array(z.string()).optional(),
  packagingNotes: z.string().optional(),
  differences: z.string().optional(),
  specs: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
  nutritionFacts: z.record(z.string(), z.string()).optional(),
});

export type VariantAssetExtractionResult = z.infer<typeof extractionSchema>;

function readCapabilities(model: { capabilities: unknown }) {
  return (model.capabilities as Record<string, boolean> | null) ?? {};
}

function pickVisionModel(provider: { models: Array<{ modelId: string; capabilities: unknown; isDefaultAnalysis?: boolean | null }> }) {
  const stableVisionModels = provider.models.filter((model) => {
    const capabilities = readCapabilities(model);
    return capabilities.vision && !/preview|experimental|beta|test/i.test(model.modelId);
  });

  if (stableVisionModels.length === 0) {
    return null;
  }

  return (
    stableVisionModels.find((model) => model.isDefaultAnalysis)?.modelId ??
    stableVisionModels.find((model) => /gemini|gpt-4o|gpt-5/i.test(model.modelId))?.modelId ??
    stableVisionModels[0]?.modelId
  );
}

function buildExtractionPrompt(variantName: string): string {
  return [
    "你是一位食品电商详情页助手。请根据上传的包装图、标签图、产品图，提取该规格的以下字段。",
    "如果图片中看不到某字段，或你不确定，请直接省略该字段，不要编造。",
    "",
    `- 规格名称(name)：包装上显示的该规格/口味名称。当前已知名称为 "${variantName}"，如果包装上有更准确的名称请修正。`,
    "- 一句话描述(description)：这个规格是什么、主打什么口感/风味。",
    "- 关键食材(keyIngredients)：主要配料列表，如 ['猪肉', '玉米', '小麦粉']。",
    "- 包装说明(packagingNotes)：净含量、规格、袋数、包装颜色/形状等。",
    "- 差异点(differences)：与同系列其他规格相比，这个规格最明显的区别。",
    "- 规格参数(specs)：标签上可见的成对参数，如 [{'label':'净含量','value':'500g'}]。",
    "- 营养成分(nutritionFacts)：每100g的营养成分键值对，如 {'能量':'180kJ','蛋白质':'8g'}。",
    "",
    "返回严格的 JSON 对象，不要包含 markdown 代码块。",
  ].join("\n");
}

export async function extractVariantAnalysisFromAssets(
  projectId: string,
  variantId: string,
): Promise<VariantAssetExtractionResult> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
  });
  if (!variant || variant.projectId !== projectId) {
    throw new Error("规格变体不存在");
  }

  const assets = await prisma.productAsset.findMany({
    where: {
      projectId,
      variantId,
      type: {
        in: ["PACKAGING", "MAIN", "ANGLE", "DETAIL", "NUTRITION", "INGREDIENT"],
      },
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    take: 4,
  });

  if (assets.length === 0) {
    throw new Error("该规格没有可用的包装图或标签图，请先上传素材。");
  }

  const { provider, adapter } = await getProviderAdapter("text");
  const model = pickVisionModel(provider);
  if (!model) {
    throw new Error("当前 Provider 没有可用的视觉模型，无法自动识别包装信息。");
  }

  const imageUrls = await Promise.all(assets.map((asset) => assetToDataUrl(asset)));

  const result = await adapter.generateStructured({
    model,
    systemPrompt: "Return strict JSON only. Do not make up values that are not visible in the images.",
    userPrompt: buildExtractionPrompt(variant.name),
    schema: extractionSchema,
    images: imageUrls,
    timeoutMs: 180000,
    monitor: {
      projectId,
      operation: "variant_asset_extraction",
    },
  });

  return result.parsed;
}
