import type { ProductAsset } from "@prisma/client";
import { z } from "zod";

import { assetToAnalysisDataUrl } from "@/lib/ai/analysis-image";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { prisma } from "@/lib/db/prisma";

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

function isLikelyVisionModel(modelId: string) {
  return /vision|vl|4o|omni|gemini|multimodal|qwen-vl|kimi|moonshot/i.test(modelId);
}

function pickVisionModel(provider: { models: Array<{ modelId: string; capabilities: unknown; isDefaultAnalysis?: boolean | null }> }) {
  const stableModels = provider.models.filter((model) => !/preview|experimental|beta|test/i.test(model.modelId));

  // 1) 优先使用明确声明支持 vision 的模型
  const explicitVisionModels = stableModels.filter((model) => readCapabilities(model).vision);
  if (explicitVisionModels.length > 0) {
    return (
      explicitVisionModels.find((model) => model.isDefaultAnalysis)?.modelId ??
      explicitVisionModels.find((model) => /gemini|gpt-4o|gpt-5/i.test(model.modelId))?.modelId ??
      explicitVisionModels[0]?.modelId
    );
  }

  // 2) 兜底：模型 ID 符合常见视觉模型命名但未正确标记 capabilities 时，也允许尝试
  const implicitVisionModels = stableModels.filter((model) => isLikelyVisionModel(model.modelId));
  if (implicitVisionModels.length > 0) {
    return (
      implicitVisionModels.find((model) => model.isDefaultAnalysis)?.modelId ??
      implicitVisionModels[0]?.modelId
    );
  }

  return null;
}

function pickTextModel(provider: { models: Array<{ modelId: string; capabilities: unknown; isDefaultAnalysis?: boolean | null; isDefaultPlanning?: boolean | null }> }) {
  const stableTextModels = provider.models.filter((model) => {
    const capabilities = readCapabilities(model);
    return capabilities.text && !/preview|experimental|beta|test/i.test(model.modelId);
  });

  if (stableTextModels.length === 0) {
    return null;
  }

  return (
    stableTextModels.find((model) => model.isDefaultAnalysis)?.modelId ??
    stableTextModels.find((model) => model.isDefaultPlanning)?.modelId ??
    stableTextModels.find((model) => /gemini|gpt-4o|gpt-5|claude/i.test(model.modelId))?.modelId ??
    stableTextModels[0]?.modelId
  );
}

function selectVariantVisionAssets(assets: ProductAsset[]) {
  const selected: ProductAsset[] = [];
  const addFirst = (types: ProductAsset["type"][]) => {
    const match = assets.find((asset) => types.includes(asset.type) && !selected.some((item) => item.id === asset.id));
    if (match) selected.push(match);
  };

  addFirst(["PACKAGING"]);
  addFirst(["MAIN", "ANGLE", "DETAIL"]);
  addFirst(["NUTRITION", "INGREDIENT"]);

  for (const asset of assets) {
    if (selected.length >= 3) break;
    if (!selected.some((item) => item.id === asset.id)) selected.push(asset);
  }

  return selected;
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildVisionExtractionPrompt(variantName: string): string {
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

function buildTextExtractionPrompt(context: {
  variantName: string;
  productInfo?: string | null;
  category?: string | null;
  sellingPoints?: string | null;
  targetAudience?: string | null;
  baseAnalysis?: Record<string, unknown> | null;
}): string {
  const baseFields = [
    context.productInfo ? `产品信息：${context.productInfo}` : "",
    context.category ? `品类：${context.category}` : "",
    context.sellingPoints ? `核心卖点：${context.sellingPoints}` : "",
    context.targetAudience ? `目标人群：${context.targetAudience}` : "",
  ].filter(Boolean);

  const baseSpecs: string[] = [];
  if (context.baseAnalysis) {
    const ingredients = context.baseAnalysis.ingredients;
    if (Array.isArray(ingredients) && ingredients.length > 0) {
      baseSpecs.push(`通用配料：${ingredients.join("、")}`);
    }
    const nutritionFacts = context.baseAnalysis.nutritionFacts;
    if (typeof nutritionFacts === "object" && nutritionFacts !== null) {
      baseSpecs.push(
        `通用营养成分：${Object.entries(nutritionFacts as Record<string, string>)
          .map(([k, v]) => `${k} ${v}`)
          .join("，")}`,
      );
    }
  }

  return [
    "你是一位食品电商详情页助手。请根据下面的商品基础信息和规格名称，生成该规格的独立分析。",
    "不要编造图片上才看得到的具体数值；如果某项不确定，请直接省略。",
    "",
    ...baseFields,
    ...baseSpecs,
    ``,
    `需要分析的规格名称："${context.variantName}"`,
    ``,
    "请返回以下字段：",
    "- 规格名称(name)：如果当前名称已准确可省略；否则给出更规范的名称。",
    "- 一句话描述(description)：这个规格是什么、主打什么口感/风味。",
    "- 关键食材(keyIngredients)：该规格的主要配料列表。",
    "- 包装说明(packagingNotes)：可推断的净含量、规格、包装特征。",
    "- 差异点(differences)：与同系列其他规格相比，这个规格最明显的区别。",
    "- 规格参数(specs)：成对参数，如 [{'label':'净含量','value':'500g'}]。",
    "- 营养成分(nutritionFacts)：每100g营养成分键值对，只有在你有把握时才填。",
    "",
    "返回严格的 JSON 对象，不要包含 markdown 代码块。",
  ].join("\n");
}

async function extractFromVision(
  projectId: string,
  variantId: string,
  variantName: string,
): Promise<VariantAssetExtractionResult | null> {
  const assets = await prisma.productAsset.findMany({
    where: {
      projectId,
      variantId,
      type: {
        in: ["PACKAGING", "MAIN", "ANGLE", "DETAIL", "NUTRITION", "INGREDIENT"],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const selectedAssets = selectVariantVisionAssets(assets);

  if (selectedAssets.length === 0) {
    return null;
  }

  const { provider, adapter } = await getProviderAdapter("text");
  const model = pickVisionModel(provider);
  if (!model) {
    return null;
  }

  const imageUrls = await Promise.all(selectedAssets.map((asset) => assetToAnalysisDataUrl(asset)));

  const result = await adapter.generateStructured({
    model,
    systemPrompt: "Return strict JSON only. Do not make up values that are not visible in the images.",
    userPrompt: buildVisionExtractionPrompt(variantName),
    schema: extractionSchema,
    images: imageUrls,
    reasoningEffort: "low",
    maxOutputTokens: 2500,
    timeoutMs: 180000,
    monitor: {
      projectId,
      operation: "variant_asset_extraction_vision",
    },
  });

  return result.parsed;
}

async function extractFromText(
  projectId: string,
  variantId: string,
  variantName: string,
): Promise<VariantAssetExtractionResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { analysis: true },
  });
  if (!project) {
    throw new Error("项目不存在");
  }

  const { provider, adapter } = await getProviderAdapter("text");
  const model = pickTextModel(provider);
  if (!model) {
    throw new Error("当前 Provider 没有可用的文本模型，无法生成规格分析。");
  }

  const snapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
  const baseAnalysis =
    typeof project.analysis?.normalizedResult === "object" && project.analysis?.normalizedResult !== null
      ? (project.analysis.normalizedResult as Record<string, unknown>)
      : null;

  const result = await adapter.generateStructured({
    model,
    systemPrompt: "Return strict JSON only. Infer reasonably but do not invent specific numeric values you cannot verify.",
    userPrompt: buildTextExtractionPrompt({
      variantName,
      productInfo: typeof snapshot.productInfo === "string" ? snapshot.productInfo : undefined,
      category: typeof snapshot.category === "string" ? snapshot.category : undefined,
      sellingPoints: typeof snapshot.sellingPoints === "string" ? snapshot.sellingPoints : undefined,
      targetAudience: typeof snapshot.targetAudience === "string" ? snapshot.targetAudience : undefined,
      baseAnalysis,
    }),
    schema: extractionSchema,
    reasoningEffort: "low",
    maxOutputTokens: 2500,
    timeoutMs: 180000,
    monitor: {
      projectId,
      operation: "variant_asset_extraction_text",
    },
  });

  return result.parsed;
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

  // 优先尝试视觉模型读取包装/标签图
  const visionResult = await extractFromVision(projectId, variantId, variant.name);
  if (visionResult) {
    return visionResult;
  }

  // 无视觉模型或无素材时，回退到文字模型基于商品信息生成
  return extractFromText(projectId, variantId, variant.name);
}

const variantExtractionMapSchema = z.record(z.string(), extractionSchema);

function buildUnifiedVisionExtractionPrompt(
  ranges: Array<{ variantId: string; name: string; start: number; end: number }>,
) {
  const imageList = ranges
    .map((range) => `图片 ${range.start + 1}-${range.end}：${range.name}（规格 ID: ${range.variantId}）`)
    .join("\n");

  return [
    "你是一位食品电商详情页助手。请根据上传的各规格包装图、标签图、产品图，一次性提取所有规格的信息。",
    "如果某个规格的图片中看不到某字段，或你不确定，请对该字段返回空字符串、空数组或空对象，不要编造。",
    "所有规格返回的字段结构必须完全一致，便于后续批量使用。",
    "",
    "图片对应关系（按顺序）：",
    imageList,
    "",
    "请返回严格 JSON 对象，外层 key 必须是上方的规格 ID，value 为以下字段：",
    "- name: 包装上显示的规格名称",
    "- description: 一句话描述",
    "- keyIngredients: 主要配料列表",
    "- packagingNotes: 净含量、规格、袋数、包装颜色/形状等",
    "- differences: 与同系列其他规格相比最明显的区别",
    "- specs: 标签上可见的成对参数，格式 [{ label, value }]",
    "- nutritionFacts: 每100g营养成分键值对",
    "",
    "返回示例结构：",
    '{ "variantIdA": { "name": "", "description": "", "keyIngredients": [], "packagingNotes": "", "differences": "", "specs": [], "nutritionFacts": {} }, "variantIdB": { ... } }',
  ].join("\n");
}

function buildUnifiedTextExtractionPrompt(
  variants: Array<{ id: string; name: string }>,
  context: {
    productInfo?: string;
    category?: string;
    sellingPoints?: string;
    targetAudience?: string;
    baseAnalysis?: Record<string, unknown> | null;
  },
) {
  const baseFields = [
    context.productInfo ? `产品信息：${context.productInfo}` : "",
    context.category ? `品类：${context.category}` : "",
    context.sellingPoints ? `核心卖点：${context.sellingPoints}` : "",
    context.targetAudience ? `目标人群：${context.targetAudience}` : "",
  ].filter(Boolean);

  const baseSpecs: string[] = [];
  if (context.baseAnalysis) {
    const ingredients = context.baseAnalysis.ingredients;
    if (Array.isArray(ingredients) && ingredients.length > 0) {
      baseSpecs.push(`通用配料：${ingredients.join("、")}`);
    }
    const nutritionFacts = context.baseAnalysis.nutritionFacts;
    if (typeof nutritionFacts === "object" && nutritionFacts !== null) {
      baseSpecs.push(
        `通用营养成分：${Object.entries(nutritionFacts as Record<string, string>)
          .map(([k, v]) => `${k} ${v}`)
          .join("，")}`,
      );
    }
  }

  const variantList = variants.map((v) => `- ${v.name}（规格 ID: ${v.id}）`).join("\n");

  return [
    "你是一位食品电商详情页助手。请根据商品基础信息和以下规格列表，一次性为所有规格生成独立分析。",
    "不要编造图片上才看得到的具体数值；如果某项不确定，请返回空字符串、空数组或空对象。",
    "所有规格返回的字段结构必须完全一致。",
    "",
    ...baseFields,
    ...baseSpecs,
    "",
    "需要分析的规格：",
    variantList,
    "",
    "请返回严格 JSON 对象，外层 key 必须是规格 ID，value 为以下字段：",
    "- name: 规格名称",
    "- description: 一句话描述",
    "- keyIngredients: 主要配料列表",
    "- packagingNotes: 净含量、规格、包装特征",
    "- differences: 与同系列其他规格相比最明显的区别",
    "- specs: 成对参数，格式 [{ label, value }]",
    "- nutritionFacts: 每100g营养成分键值对",
    "",
    "返回示例结构：",
    '{ "variantIdA": { "name": "", "description": "", "keyIngredients": [], "packagingNotes": "", "differences": "", "specs": [], "nutritionFacts": {} }, "variantIdB": { ... } }',
  ].join("\n");
}

function mapExtractionResultsToVariantIds(
  parsed: Record<string, unknown>,
  variants: Array<{ id: string; name: string }>,
): Record<string, VariantAssetExtractionResult> {
  const result: Record<string, VariantAssetExtractionResult> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const matchById = variants.find((v) => v.id === key);
    const matchByName = variants.find((v) => v.name === key);
    const variant = matchById ?? matchByName;
    if (!variant || typeof value !== "object" || value === null) continue;
    const parsedValue = extractionSchema.safeParse(value);
    if (parsedValue.success) {
      result[variant.id] = parsedValue.data;
    }
  }
  return result;
}

export async function extractAllVariantAnalyses(
  projectId: string,
): Promise<Record<string, VariantAssetExtractionResult>> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { variants: true, analysis: true },
  });
  if (!project) {
    throw new Error("项目不存在");
  }

  const variants = project.variants;
  if (variants.length === 0) {
    return {};
  }

  const variantAssetGroups = await Promise.all(
    variants.map(async (variant) => {
      const assets = await prisma.productAsset.findMany({
        where: {
          projectId,
          variantId: variant.id,
          type: {
            in: ["PACKAGING", "MAIN", "ANGLE", "DETAIL", "NUTRITION", "INGREDIENT"],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      return { variant, assets: selectVariantVisionAssets(assets) };
    }),
  );

  const hasAnyAssets = variantAssetGroups.some(({ assets }) => assets.length > 0);
  const { provider, adapter } = await getProviderAdapter("text");

  // Keep each vision request small and run independent variant batches concurrently.
  if (hasAnyAssets) {
    const visionModel = pickVisionModel(provider);
    if (visionModel) {
      const batchResults = await Promise.all(
        chunkItems(variantAssetGroups, 4).map(async (batch) => {
          const imageUrls: string[] = [];
          const ranges: Array<{ variantId: string; name: string; start: number; end: number }> = [];
          for (const { variant, assets } of batch) {
            const start = imageUrls.length;
            const urls = await Promise.all(assets.map((asset) => assetToAnalysisDataUrl(asset)));
            imageUrls.push(...urls);
            ranges.push({ variantId: variant.id, name: variant.name, start, end: imageUrls.length });
          }

          const result = await adapter.generateStructured({
            model: visionModel,
            systemPrompt: "Return strict JSON only. Do not make up values that are not visible in the images.",
            userPrompt: buildUnifiedVisionExtractionPrompt(ranges),
            schema: variantExtractionMapSchema,
            images: imageUrls,
            reasoningEffort: "low",
            maxOutputTokens: 5000,
            timeoutMs: 300000,
            monitor: {
              projectId,
              operation: "variant_unified_extraction_vision",
            },
          });

          return mapExtractionResultsToVariantIds(
            result.parsed,
            batch.map(({ variant }) => variant),
          );
        }),
      );

      return Object.assign({}, ...batchResults);
    }
  }

  // Fallback: single text call based on product context and variant names.
  const textModel = pickTextModel(provider);
  if (!textModel) {
    throw new Error("当前 Provider 没有可用的文本模型，无法生成规格分析。");
  }

  const snapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
  const baseAnalysis =
    typeof project.analysis?.normalizedResult === "object" && project.analysis?.normalizedResult !== null
      ? (project.analysis.normalizedResult as Record<string, unknown>)
      : null;

  const prompt = buildUnifiedTextExtractionPrompt(
    variants.map((v) => ({ id: v.id, name: v.name })),
    {
      productInfo: typeof snapshot.productInfo === "string" ? snapshot.productInfo : undefined,
      category: typeof snapshot.category === "string" ? snapshot.category : undefined,
      sellingPoints: typeof snapshot.sellingPoints === "string" ? snapshot.sellingPoints : undefined,
      targetAudience: typeof snapshot.targetAudience === "string" ? snapshot.targetAudience : undefined,
      baseAnalysis,
    },
  );

  const result = await adapter.generateStructured({
    model: textModel,
    systemPrompt: "Return strict JSON only. Infer reasonably but do not invent specific numeric values you cannot verify.",
    userPrompt: prompt,
    schema: variantExtractionMapSchema,
    reasoningEffort: "low",
    maxOutputTokens: 5000,
    timeoutMs: 300000,
    monitor: {
      projectId,
      operation: "variant_unified_extraction_text",
    },
  });

  return mapExtractionResultsToVariantIds(result.parsed, variants);
}
