import { Prisma, type ProductAsset } from "@prisma/client";
import { z, ZodError } from "zod";

import {
  buildProductAnalysisPrompt,
  buildProductAnalysisFromVisualFactsPrompt,
  buildProductAnalysisRepairPrompt,
  buildProductVisualFactPrompt,
  buildTextAnalysisPrompt,
} from "@/lib/ai/prompts";
import { assetToAnalysisDataUrl } from "@/lib/ai/analysis-image";
import { productAnalysisOutputSchema } from "@/lib/ai/schemas/product-analysis";
import type { ProductAnalysisOutput } from "@/lib/ai/schemas/product-analysis";
import { isAnalysisModelCandidate } from "@/lib/ai/model-matcher";
import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { completeTask, createTask, failTask, findRecentRunningTask } from "@/lib/services/task-service";
import { extractAllVariantAnalyses } from "@/lib/services/variant-asset-extraction-service";
import type { GroupedAnalysisAssets } from "@/lib/ai/prompts";

function normalizeModelId(value: string) {
  return value.toLowerCase();
}

function hasCapability(model: { capabilities: unknown }, key: string) {
  const capabilities = (model.capabilities ?? {}) as Record<string, boolean>;
  return Boolean(capabilities[key]);
}

function isPreviewLike(modelId: string) {
  return /(preview|experimental|beta|test)/i.test(modelId);
}

function isLiteLike(modelId: string) {
  return /(lite|flash-lite)/i.test(modelId);
}

function isStableAnalysisCandidate(modelId: string) {
  return isAnalysisModelCandidate(modelId) && !isPreviewLike(modelId) && !isLiteLike(modelId);
}

function extractJsonBlock(raw: string) {
  const direct = raw.trim();
  if (direct.startsWith("{") || direct.startsWith("[")) {
    return direct;
  }

  const fencedMatch = direct.match(/```json([\s\S]*?)```/i) || direct.match(/```([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = direct.indexOf("{");
  const lastBrace = direct.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return direct.slice(firstBrace, lastBrace + 1);
  }

  return direct;
}

function shouldAttemptRepair(error: unknown) {
  return (
    error instanceof ZodError ||
    error instanceof SyntaxError ||
    (error instanceof Error && /json|schema|parse/i.test(error.message))
  );
}

function pickAnalysisModel(
  provider: Awaited<ReturnType<typeof getProviderAdapter>>["provider"],
  preferredModelId?: string | null,
) {
  if (preferredModelId) {
    const preferred = provider.models.find((item) => item.modelId === preferredModelId);
    if (preferred && hasCapability(preferred, "text") && isAnalysisModelCandidate(preferred.modelId)) {
      return preferred.modelId;
    }
  }

  const defaultAnalysisModel = provider.models.find(
    (item) =>
      item.isDefaultAnalysis &&
      hasCapability(item, "text") &&
      isAnalysisModelCandidate(item.modelId),
  );
  if (defaultAnalysisModel) {
    return defaultAnalysisModel.modelId;
  }

  const textVisionModels = provider.models.filter(
    (item) => hasCapability(item, "text") && hasCapability(item, "vision"),
  );
  const textModels = provider.models.filter(
    (item) => hasCapability(item, "text") && isAnalysisModelCandidate(item.modelId),
  );

  const findMatch = (
    models: typeof provider.models,
    predicate: (model: (typeof provider.models)[number]) => boolean,
  ) => models.find(predicate)?.modelId;

  return (
    findMatch(
      textVisionModels,
      (item) => normalizeModelId(item.modelId).includes("gemini") && isStableAnalysisCandidate(item.modelId),
    ) ??
    findMatch(
      textVisionModels,
      (item) => normalizeModelId(item.modelId).includes("gpt-4o") && isStableAnalysisCandidate(item.modelId),
    ) ??
    findMatch(textVisionModels, (item) => isStableAnalysisCandidate(item.modelId)) ??
    findMatch(textModels, (item) => isStableAnalysisCandidate(item.modelId)) ??
    textModels[0]?.modelId ??
    null
  );
}

function groupAssetsByRole(assets: ProductAsset[]): GroupedAnalysisAssets {
  const identity = assets
    .filter((asset) => asset.type === "MAIN" || asset.type === "ANGLE" || asset.type === "DETAIL")
    .sort((a, b) => {
      const order: Record<string, number> = { MAIN: 0, ANGLE: 1, DETAIL: 2 };
      const aOrder = order[a.type] ?? 99;
      const bOrder = order[b.type] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.sortOrder - b.sortOrder;
    })
    .slice(0, 3);

  return {
    identity,
    packaging: assets.filter((asset) => asset.type === "PACKAGING").slice(0, 2),
    nutrition: assets.filter((asset) => asset.type === "NUTRITION").slice(0, 1),
    ingredient: assets.filter((asset) => asset.type === "INGREDIENT").slice(0, 1),
  };
}

function selectAnalysisImageAssets(grouped: GroupedAnalysisAssets) {
  return [
    ...grouped.identity.slice(0, 3),
    ...grouped.packaging.slice(0, 1),
    ...grouped.nutrition.slice(0, 1),
    ...grouped.ingredient.slice(0, 1),
  ];
}

async function repairAnalysisOutput(input: {
  adapter: Awaited<ReturnType<typeof getProviderAdapter>>["adapter"];
  model: string;
  raw: string;
}) {
  const repaired = await input.adapter.generateText({
    model: input.model,
    systemPrompt: "Return one strict JSON object only.",
    userPrompt: buildProductAnalysisRepairPrompt(input.raw),
    reasoningEffort: "low",
    maxOutputTokens: 6000,
    timeoutMs: 300000,
    monitor: {
      operation: "analysis_output_repair",
    },
  });

  const parsed = productAnalysisOutputSchema.parse(JSON.parse(extractJsonBlock(repaired.text)));
  return {
    parsed,
    repairedRaw: repaired.text,
  };
}

function normalizeAnalysisProviderError(error: unknown): never {
  const detail = error instanceof Error ? error.message : "Unknown analysis error";

  if (/monthly spending limit|spending limit|billing|quota|insufficient_quota/i.test(detail)) {
    throw new Error("当前 API Key 的分析额度已用尽。请前往代理商控制台提高或移除月度限额，或更换可用的 API Key。");
  }

  if (/429|rate limit|限流/i.test(detail)) {
    throw new Error("当前分析请求触发了限流。请稍后重试，或降低调用频率。");
  }

  if (/invalid token|unauthorized|forbidden/i.test(detail)) {
    throw new Error("当前 Provider 鉴权失败。请检查 baseURL、API Key 或代理商权限配置。");
  }

  if (/timed out|aborterror|network error|fetch failed/i.test(detail)) {
    throw new Error("当前 Provider 请求超时或网络异常，请稍后重试。");
  }

  throw error instanceof Error ? error : new Error(detail);
}

type AnalysisDependencies = {
  adapter: Awaited<ReturnType<typeof getProviderAdapter>>["adapter"];
  model: string;
  projectId: string;
};

const visualFactExtractionSchema = z.object({
  productName: z.string(),
  category: z.string(),
  subcategory: z.string(),
  physicalProductDescription: z.string(),
  packagingDescription: z.string(),
  exactFacts: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      evidence: z.string(),
    }),
  ),
  ingredients: z.array(z.string()),
  nutritionFacts: z.record(z.string(), z.string()),
  visibleMarketingClaims: z.array(z.string()),
  conflicts: z.array(
    z.object({
      topic: z.string(),
      physicalLabelValue: z.string(),
      packagingValue: z.string(),
    }),
  ),
});

async function runStructuredAnalysis(
  deps: AnalysisDependencies,
  prompt: string,
  imageUrls: string[],
): Promise<{ parsed: ProductAnalysisOutput; rawResult: Prisma.JsonObject }> {
  try {
    const structured = await deps.adapter.generateStructured({
      model: deps.model,
      systemPrompt: "Return one strict JSON object only. No markdown.",
      userPrompt: prompt,
      schema: productAnalysisOutputSchema,
      images: imageUrls,
      reasoningEffort: "low",
      maxOutputTokens: 6000,
      timeoutMs: 300000,
      monitor: {
        projectId: deps.projectId,
        operation: "project_analysis",
      },
    });

    return {
      parsed: structured.parsed,
      rawResult: {
        mode: "structured",
        model: deps.model,
        raw: structured.raw,
      },
    };
  } catch (error) {
    if (!shouldAttemptRepair(error)) {
      normalizeAnalysisProviderError(error);
    }

    const fallbackText = await deps.adapter.generateText({
      model: deps.model,
      systemPrompt: "Return one strict JSON object only. No markdown.",
      userPrompt: prompt,
      images: imageUrls,
      reasoningEffort: "low",
      maxOutputTokens: 6000,
      timeoutMs: 300000,
      monitor: {
        projectId: deps.projectId,
        operation: "project_analysis_fallback",
      },
    });

    try {
      const directParsed = productAnalysisOutputSchema.parse(JSON.parse(extractJsonBlock(fallbackText.text)));
      return {
        parsed: directParsed,
        rawResult: {
          mode: "text_fallback",
          model: deps.model,
          initialError:
            error instanceof ZodError
              ? error.flatten()
              : error instanceof Error
                ? error.message
                : "Unknown analysis error",
          fallbackRaw: fallbackText.text,
        },
      };
    } catch {
      const repaired = await repairAnalysisOutput({
        adapter: deps.adapter,
        model: deps.model,
        raw: fallbackText.text,
      }).catch((repairError) => {
        normalizeAnalysisProviderError(repairError);
      });

      return {
        parsed: repaired.parsed,
        rawResult: {
          mode: "text_repair",
          model: deps.model,
          initialError:
            error instanceof ZodError
              ? error.flatten()
              : error instanceof Error
                ? error.message
                : "Unknown analysis error",
          fallbackRaw: fallbackText.text,
          repairedRaw: repaired.repairedRaw,
        },
      };
    }
  }
}

async function runStagedImageAnalysis(
  deps: AnalysisDependencies,
  groupedAssets: GroupedAnalysisAssets,
  imageUrls: string[],
): Promise<{ parsed: ProductAnalysisOutput; rawResult: Prisma.JsonObject }> {
  const visualFacts = await deps.adapter.generateStructured({
    model: deps.model,
    systemPrompt: "Extract visible product facts into one strict JSON object. No markdown.",
    userPrompt: buildProductVisualFactPrompt(groupedAssets),
    schema: visualFactExtractionSchema,
    images: imageUrls,
    reasoningEffort: "low",
    maxOutputTokens: 4000,
    timeoutMs: 180000,
    monitor: {
      projectId: deps.projectId,
      operation: "project_visual_fact_extraction",
    },
  }).catch((error) => normalizeAnalysisProviderError(error));

  const strategy = await runStructuredAnalysis(
    deps,
    buildProductAnalysisFromVisualFactsPrompt(visualFacts.parsed),
    [],
  );

  return {
    parsed: strategy.parsed,
    rawResult: {
      mode: "staged_visual_analysis",
      model: deps.model,
      visualFacts: visualFacts.parsed,
      visualRaw: visualFacts.raw,
      strategy: strategy.rawResult,
    } as Prisma.JsonObject,
  };
}

export async function analyzeProject(
  projectId: string,
  preferredModelId?: string | null,
  idempotencyKey?: string | null,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assets: { orderBy: { sortOrder: "asc" } },
      variants: {
        orderBy: { sortOrder: "asc" },
        include: { assets: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  const { provider, adapter } = await getProviderAdapter("text");
  const model = pickAnalysisModel({ ...provider, models: provider.models }, preferredModelId);

  if (!model) {
    throw new Error("No analysis model available.");
  }

  const existingTask = idempotencyKey ? null : await findRecentRunningTask({
    projectId,
    taskType: "ANALYZE",
    maxAgeMinutes: 10,
  });
  if (existingTask) {
    throw new Error("当前商品分析仍在进行中，请等待这一轮完成后再试。");
  }

  const task = await createTask({
    projectId,
    taskType: "ANALYZE",
    idempotencyKey,
    inputPayload: { model },
  });

  try {
    const groupedBaseAssets = groupAssetsByRole(project.assets);
    const baseImageAssets = selectAnalysisImageAssets(groupedBaseAssets).slice(0, 6);
    const baseImageUrls = baseImageAssets.length > 0
      ? await Promise.all(baseImageAssets.map((asset) => assetToAnalysisDataUrl(asset)))
      : [];

    const hasAssets = baseImageUrls.length > 0;
    let basePrompt: string;

    if (hasAssets) {
      basePrompt = buildProductAnalysisPrompt(groupedBaseAssets);
    } else {
      const snapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
      basePrompt = buildTextAnalysisPrompt({
        name: (snapshot.productInfo as string | undefined) || project.name,
        description: project.description,
        category: snapshot.category as string | undefined,
        sellingPoints: snapshot.sellingPoints as string | undefined,
        targetAudience: snapshot.targetAudience as string | undefined,
        variantNames: project.variants.map((variant) => variant.name),
      });
    }

    const deps: AnalysisDependencies = { adapter, model, projectId };
    const variantsHaveAssets = project.variants.some((variant) => variant.assets.length > 0);
    const baseAnalysisPromise = hasAssets
      ? runStagedImageAnalysis(deps, groupedBaseAssets, baseImageUrls)
      : runStructuredAnalysis(deps, basePrompt, baseImageUrls);
    const variantAnalysisPromise = project.variants.length > 0 && variantsHaveAssets
      ? analyzeProjectVariants(projectId, project.variants)
      : Promise.resolve();
    const [baseResult] = await Promise.all([baseAnalysisPromise, variantAnalysisPromise]);

    const saved = await prisma.productAnalysis.upsert({
      where: { projectId },
      update: {
        rawResult: baseResult.rawResult as Prisma.InputJsonValue,
        normalizedResult: baseResult.parsed as Prisma.InputJsonValue,
      },
      create: {
        projectId,
        rawResult: baseResult.rawResult as Prisma.InputJsonValue,
        normalizedResult: baseResult.parsed as Prisma.InputJsonValue,
      },
    });

    if (project.variants.length > 0 && !variantsHaveAssets) {
      await analyzeProjectVariants(projectId, project.variants);
    }

    const detectedStyle = baseResult.parsed.detectedStyle;

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "ANALYZED",
        style: detectedStyle && detectedStyle.length > 0 ? detectedStyle : project.style,
        modelSnapshot: {
          ...(project.modelSnapshot as Record<string, unknown> | null),
          analysisModelId: model,
          providerConfigId: provider.id,
          detectedStyle: detectedStyle || null,
        },
      },
    });

    await completeTask(task.id, saved.normalizedResult);
    return saved;
  } catch (error) {
    await failTask(task.id, error instanceof Error ? error.message : "Analysis failed");
    throw error;
  }
}

type ProjectVariantWithAssets = Prisma.ProductVariantGetPayload<{ include: { assets: true } }>;

async function analyzeProjectVariants(
  projectId: string,
  variants: ProjectVariantWithAssets[],
) {
  const results = await extractAllVariantAnalyses(projectId);
  await prisma.$transaction(
    variants.map((variant) => {
      const metadata = (variant.metadata ?? {}) as Record<string, unknown>;
      const existingAnalysis =
        typeof metadata.analysis === "object" && metadata.analysis !== null
          ? (metadata.analysis as Record<string, unknown>)
          : {};

      return prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          metadata: {
            ...metadata,
            analysis: {
              ...existingAnalysis,
              ...(results[variant.id] ?? {}),
            },
          } as Prisma.InputJsonValue,
        },
      });
    }),
  );
}

export async function updateAnalysis(projectId: string, normalizedResult: unknown) {
  const jsonValue = normalizedResult as Prisma.InputJsonValue;
  return prisma.productAnalysis.upsert({
    where: { projectId },
    update: { normalizedResult: jsonValue },
    create: {
      projectId,
      rawResult: jsonValue,
      normalizedResult: jsonValue,
    },
  });
}
