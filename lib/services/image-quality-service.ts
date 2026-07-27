import { Prisma } from "@prisma/client";
import { z } from "zod";

import { isLikelyVisionModelId } from "@/lib/ai/capability-detector";
import { buildImageQualityScorePrompt } from "@/lib/ai/prompts";
import { prisma } from "@/lib/db/prisma";
import { readStorageFile } from "@/lib/storage/asset-manager";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { contentLanguageNamesForPrompt, normalizeContentLanguage } from "@/lib/utils/content-language";

const qualityScoreSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  colorConsistencyScore: z.number().int().min(0).max(100),
  promptAlignmentScore: z.number().int().min(0).max(100),
  copyAlignmentScore: z.number().int().min(0).max(100),
  compositionScore: z.number().int().min(0).max(100),
  typographyScore: z.number().int().min(0).max(100),
  productFidelityScore: z.number().int().min(0).max(100).default(0),
  packagingFidelityScore: z.number().int().min(0).max(100).default(0),
  factualityScore: z.number().int().min(0).max(100).default(0),
  complianceScore: z.number().int().min(0).max(100).default(0),
  thumbnailScore: z.number().int().min(0).max(100).default(0),
  ocrScore: z.number().int().min(0).max(100).default(0),
  analysis: z.string().min(1),
});

export type ImageQualityScoreResult = z.infer<typeof qualityScoreSchema>;

export const IMAGE_QUALITY_THRESHOLDS = {
  overallScore: 78,
  colorConsistencyScore: 85,
  promptAlignmentScore: 80,
  typographyScore: 75,
  productFidelityScore: 88,
  packagingFidelityScore: 92,
  factualityScore: 95,
  complianceScore: 100,
  thumbnailScore: 82,
  ocrScore: 90,
} as const;

export function assessImageQualityGate(
  score: Partial<Record<keyof typeof IMAGE_QUALITY_THRESHOLDS, number>>,
  options?: { requiresPackaging?: boolean },
) {
  const failed = Object.entries(IMAGE_QUALITY_THRESHOLDS).flatMap(([field, threshold]) => {
    if (field === "packagingFidelityScore" && !options?.requiresPackaging) return [];
    const actual = Number(score[field as keyof typeof IMAGE_QUALITY_THRESHOLDS] ?? 0);
    return actual >= threshold ? [] : [{ field, actual, threshold }];
  });
  return {
    passed: failed.length === 0,
    failed,
    summary: failed.length === 0
      ? "质量评分已达到发布门槛"
      : failed.map((item) => `${item.field} ${item.actual}/${item.threshold}`).join("；"),
  };
}

type VisionModelCandidate = {
  modelId: string;
  capabilities: unknown;
  isAvailable?: boolean | null;
  isDefaultAnalysis?: boolean | null;
};

function modelCapabilities(model: VisionModelCandidate) {
  return (model.capabilities ?? {}) as Record<string, unknown>;
}

function hasExplicitVisionCapability(model: VisionModelCandidate) {
  const capabilities = modelCapabilities(model);
  return Boolean(capabilities.vision) || Boolean(capabilities.image_vision);
}

function isUsableVisionCandidate(model: VisionModelCandidate, allowNameInference: boolean) {
  const capabilities = modelCapabilities(model);
  return model.isAvailable !== false &&
    Boolean(capabilities.text) &&
    (hasExplicitVisionCapability(model) || (allowNameInference && isLikelyVisionModelId(model.modelId)));
}

export function scoreVisionModelPriority(modelId: string) {
  const id = modelId.toLowerCase();
  let score = 0;

  if (isLikelyVisionModelId(id)) score += 10;
  if (/vision|(?:^|[-_.])vl(?:$|[-_.])/.test(id)) score += 2;

  if (/preview|experimental|beta|test|audio|realtime|transcrib|speech|tts/.test(id)) score -= 20;

  return score;
}

function pickVisionModel(models: VisionModelCandidate[], allowNameInference = false) {
  const visionModels = models.filter((model) => isUsableVisionCandidate(model, allowNameInference));

  if (!visionModels.length) {
    return null;
  }

  return visionModels
    .slice()
    .sort((a, b) => {
      const defaultDifference = Number(Boolean(b.isDefaultAnalysis)) - Number(Boolean(a.isDefaultAnalysis));
      return defaultDifference || scoreVisionModelPriority(b.modelId) - scoreVisionModelPriority(a.modelId);
    })[0]?.modelId ?? null;
}

async function getVisionAdapter() {
  // Quality scoring must follow the configured analysis provider. A stale model
  // from another provider must not win because its id merely sounds expensive.
  try {
    const textContext = await getProviderAdapter("text");
    const textModels = textContext.provider.models as VisionModelCandidate[];
    const defaultAnalysisModel = textModels.find(
      (model) => model.isDefaultAnalysis && isUsableVisionCandidate(model, true),
    );
    const sameProviderVision = defaultAnalysisModel?.modelId ??
      pickVisionModel(textModels, false) ??
      pickVisionModel(textModels, true);
    if (sameProviderVision) {
      return { ...textContext, visionModel: sameProviderVision };
    }

    const providers = await prisma.providerConfig.findMany({
      where: { isActive: true, id: { not: textContext.provider.id } },
      include: { models: true },
      orderBy: { updatedAt: "desc" },
    });
    for (const provider of providers) {
      const visionModel = pickVisionModel(provider.models as VisionModelCandidate[], false) ??
        pickVisionModel(provider.models as VisionModelCandidate[], true);
      if (!visionModel) continue;
      const context = await getProviderAdapter(undefined, provider.id);
      return { ...context, visionModel };
    }
  } catch (error) {
    console.error("[ImageQualityScore] Failed to resolve the configured vision model:", error);
  }

  return null;
}

async function contentLanguageName(project: { modelSnapshot: unknown } | null) {
  const snapshot = (project?.modelSnapshot as Record<string, unknown> | null) ?? {};
  const previewConfig = (snapshot.previewConfig as Record<string, unknown> | undefined) ?? {};
  const lang = typeof previewConfig.contentLanguage === "string" ? previewConfig.contentLanguage : "zh-CN";
  return contentLanguageNamesForPrompt[normalizeContentLanguage(lang)];
}

async function assetToDataUrl(asset: { filePath: string; mimeType: string | null }) {
  const buffer = await readStorageFile(asset.filePath);
  const mimeType = asset.mimeType ?? "image/png";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

const SCORE_RATE_LIMIT_MS = 60_000;

export async function scoreGeneratedImage(assetId: string, options?: { force?: boolean }) {
  const asset = await prisma.productAsset.findUnique({
    where: { id: assetId },
    include: {
      section: true,
      qualityScores: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  if (!asset.mimeType?.startsWith("image/") && asset.mimeType !== "image/svg+xml") {
    throw new Error(`Asset is not an image: ${assetId}`);
  }

  const latestScore = asset.qualityScores[0];
  if (!options?.force && latestScore && latestScore.scoredAt && Date.now() - latestScore.scoredAt.getTime() < SCORE_RATE_LIMIT_MS) {
    console.log("[ImageQualityScore] Skipping rescore within rate limit:", assetId);
    return { ...latestScore, raw: null };
  }

  // Find any active provider that has a vision-capable model.
  const visionContext = await getVisionAdapter();

  if (!visionContext) {
    throw new Error("当前没有可用的 vision 模型来进行图片质量评分。请在模型服务配置中配置一个支持 vision 的文本模型（如 gpt-4o、gemini-1.5、claude-3.5 等）。");
  }

  const { adapter, provider, visionModel } = visionContext;
  console.log(`[ImageQualityScore] Using vision model ${visionModel} via provider ${provider.id} (${provider.name ?? provider.baseUrl})`);

  const section = asset.section;
  const metadata = (asset.metadata as Record<string, unknown> | null) ?? {};
  const promptText = typeof metadata.prompt === "string" ? metadata.prompt : "";
  const aspectRatio = typeof metadata.aspectRatio === "string" ? metadata.aspectRatio : "9:16";

  const [project, productReferenceAsset, labelReferenceAsset, packagingReferenceAsset, imageDataUrl] = await Promise.all([
    prisma.project.findUnique({ where: { id: asset.projectId } }),
    prisma.productAsset.findFirst({
      where: { projectId: asset.projectId, type: { in: ["MAIN", "ANGLE"] } },
      orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.productAsset.findFirst({
      where: { projectId: asset.projectId, type: { in: ["DETAIL", "NUTRITION"] } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.productAsset.findFirst({
      where: { projectId: asset.projectId, type: "PACKAGING" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    assetToDataUrl(asset),
  ]);

  const snapshot = (project?.modelSnapshot as Record<string, unknown> | null) ?? {};
  const styleGuide = (snapshot.styleGuide as Record<string, unknown> | undefined) ?? {};
  const colorPalette = (styleGuide.colorPalette as Record<string, string> | undefined) ?? {};
  const visualSystem = styleGuide.visualSystem as Record<string, string> | undefined;

  const toneAnchorAssetId = styleGuide.anchorKind === "approved_section_tone_anchor_v1" &&
    typeof styleGuide.anchorImageAssetId === "string" &&
    styleGuide.anchorImageAssetId !== assetId
    ? styleGuide.anchorImageAssetId
    : null;
  const [toneAnchorAsset, previousSection] = await Promise.all([
    toneAnchorAssetId
      ? prisma.productAsset.findUnique({ where: { id: toneAnchorAssetId } })
      : Promise.resolve(null),
    section
      ? prisma.pageSection.findFirst({
          where: {
            projectId: asset.projectId,
            order: { lt: section.order },
            currentImageAssetId: { not: null },
          },
          orderBy: { order: "desc" },
          include: { currentImageAsset: true },
        })
      : Promise.resolve(null),
  ]);

  const [
    productReferenceImageUrl,
    labelReferenceImageUrl,
    packagingReferenceImageUrl,
    toneAnchorImageUrl,
    previousImageUrl,
  ] = await Promise.all([
    productReferenceAsset ? assetToDataUrl(productReferenceAsset) : undefined,
    labelReferenceAsset ? assetToDataUrl(labelReferenceAsset) : undefined,
    packagingReferenceAsset ? assetToDataUrl(packagingReferenceAsset) : undefined,
    toneAnchorAsset ? assetToDataUrl(toneAnchorAsset) : undefined,
    previousSection?.currentImageAsset ? assetToDataUrl(previousSection.currentImageAsset) : undefined,
  ]);
  const targetLanguage = project ? await contentLanguageName(project) : undefined;

  const scoringPrompt = buildImageQualityScorePrompt({
    sectionType: section?.type ?? "UNKNOWN",
    title: section?.title ?? "",
    goal: section?.goal ?? "",
    copy: section
      ? (() => {
          const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
          return [
            typeof editableData.mainTitle === "string" ? editableData.mainTitle : "",
            typeof editableData.subTitle === "string" ? editableData.subTitle : "",
            ...(Array.isArray(editableData.supportingPoints)
              ? editableData.supportingPoints.filter((value): value is string => typeof value === "string")
              : []),
            typeof editableData.complianceNote === "string" ? editableData.complianceNote : "",
          ].filter(Boolean).join(" / ");
        })()
      : "",
    visualPrompt: section?.visualPrompt ?? "",
    prompt: promptText,
    aspectRatio,
    targetLanguage,
    colorPalette,
    visualSystem: visualSystem ? JSON.stringify(visualSystem, null, 2) : undefined,
    productReferenceImageUrl,
    labelReferenceImageUrl,
    packagingReferenceImageUrl,
    toneAnchorImageUrl,
    previousImageUrl,
  });

  const images: string[] = [imageDataUrl];
  if (productReferenceImageUrl) {
    images.push(productReferenceImageUrl);
  }
  if (labelReferenceImageUrl) {
    images.push(labelReferenceImageUrl);
  }
  if (packagingReferenceImageUrl) {
    images.push(packagingReferenceImageUrl);
  }
  if (toneAnchorImageUrl) {
    images.push(toneAnchorImageUrl);
  }
  if (previousImageUrl) {
    images.push(previousImageUrl);
  }

  const result = await adapter.generateStructured({
    model: visionModel,
    systemPrompt: "You are a strict visual-quality evaluator. Return valid JSON only.",
    userPrompt: scoringPrompt,
    schema: qualityScoreSchema,
    images,
    timeoutMs: 120000,
    monitor: {
      projectId: asset.projectId,
      sectionId: asset.sectionId ?? undefined,
      operation: "score_image_quality",
    },
  });

  const scoreData = result.parsed;

  // Replace previous scores in one transaction so a failure never leaves the asset without a score.
  const [, record] = await prisma.$transaction([
    prisma.imageQualityScore.deleteMany({
      where: { assetId },
    }),
    prisma.imageQualityScore.create({
      data: {
        assetId,
        overallScore: scoreData.overallScore,
        colorConsistencyScore: scoreData.colorConsistencyScore,
        promptAlignmentScore: scoreData.promptAlignmentScore,
        copyAlignmentScore: scoreData.copyAlignmentScore,
        compositionScore: scoreData.compositionScore,
        typographyScore: scoreData.typographyScore,
        productFidelityScore: scoreData.productFidelityScore,
        packagingFidelityScore: scoreData.packagingFidelityScore,
        factualityScore: scoreData.factualityScore,
        complianceScore: scoreData.complianceScore,
        thumbnailScore: scoreData.thumbnailScore,
        ocrScore: scoreData.ocrScore,
        analysis: scoreData.analysis,
        scoredByModel: visionModel,
        scoredAt: new Date(),
      },
    }),
  ]);

  return {
    ...record,
    raw: result.raw,
  };
}

type PackagingPixelCheck = {
  passed?: boolean;
  meanAbsoluteError?: number;
  changedPixelRatio?: number;
  reason?: string;
};

export function assessGeneratedAssetQualityGate(
  score: Partial<Record<keyof typeof IMAGE_QUALITY_THRESHOLDS, number>>,
  options: {
    requiresPackaging?: boolean;
    generationMode?: unknown;
    packagingProtectionRequired?: boolean;
    packagingPixelCheck?: PackagingPixelCheck | null;
  },
) {
  const gate = assessImageQualityGate(score, { requiresPackaging: options.requiresPackaging });
  const constraints: string[] = [];

  if (options.generationMode !== "image_api") {
    constraints.push("业务成图不是 image_api");
  }
  if (options.packagingProtectionRequired && options.packagingPixelCheck?.passed !== true) {
    const check = options.packagingPixelCheck;
    constraints.push(
      check
        ? `包装保护区像素发生变化（平均差异 ${Number(check.meanAbsoluteError ?? 0).toFixed(2)}，变化比例 ${Math.round(Number(check.changedPixelRatio ?? 0) * 100)}%）`
        : "缺少包装保护区像素校验",
    );
  }

  return constraints.length === 0
    ? { ...gate, constraints }
    : {
        ...gate,
        passed: false,
        constraints,
        summary: [gate.passed ? "" : gate.summary, ...constraints].filter(Boolean).join("；"),
      };
}

export async function scoreAndReconcileGeneratedImage(assetId: string, options?: { force?: boolean }) {
  const score = await scoreGeneratedImage(assetId, options);
  const asset = await prisma.productAsset.findUnique({
    where: { id: assetId },
    include: { section: true },
  });
  if (!asset) throw new Error(`Asset not found: ${assetId}`);

  const metadata = (asset.metadata as Record<string, unknown> | null) ?? {};
  const providerInputs = Array.isArray(metadata.providerReferenceInputs)
    ? metadata.providerReferenceInputs.filter(
        (value): value is Record<string, unknown> => typeof value === "object" && value !== null,
      )
    : [];
  const requiresPackaging = metadata.fidelityMode === "packaging_edit" ||
    providerInputs.some((input) => input.type === "PACKAGING");
  const qualityGate = assessGeneratedAssetQualityGate(score, {
    requiresPackaging,
    generationMode: metadata.mode,
    packagingProtectionRequired: metadata.fidelityMode === "packaging_edit",
    packagingPixelCheck: (metadata.packagingPixelCheck as PackagingPixelCheck | undefined) ?? null,
  });
  const scoredAt = score.scoredAt?.toISOString() ?? null;

  const updatedAsset = await prisma.productAsset.update({
    where: { id: assetId },
    data: {
      metadata: {
        ...metadata,
        qualityGate: {
          passed: qualityGate.passed,
          summary: qualityGate.summary,
          failed: qualityGate.failed,
          constraints: qualityGate.constraints,
          scoreId: score.id,
          scoredAt,
        },
      } as Prisma.InputJsonValue,
    },
  });

  if (asset.section?.currentImageAssetId === assetId) {
    await prisma.pageSection.update({
      where: { id: asset.section.id },
      data: { status: qualityGate.passed ? "SUCCESS" : "REVIEW" },
    });
  }

  return { score, qualityGate, imageAsset: updatedAsset };
}

export async function getImageQualityScore(assetId: string) {
  return prisma.imageQualityScore.findFirst({
    where: { assetId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProjectImageQualityScores(projectId: string) {
  return prisma.imageQualityScore.findMany({
    where: { asset: { projectId } },
    include: { asset: { select: { id: true, filePath: true, fileName: true, sectionId: true, type: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function summarizeProjectColorContinuity(projectId: string) {
  const sections = await prisma.pageSection.findMany({
    where: { projectId, currentImageAssetId: { not: null } },
    orderBy: { order: "asc" },
    select: {
      id: true,
      sectionKey: true,
      title: true,
      order: true,
      currentImageAsset: {
        select: {
          id: true,
          qualityScores: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { colorConsistencyScore: true, scoredAt: true },
          },
        },
      },
    },
  });
  const scored = sections.flatMap((section) => {
    const score = section.currentImageAsset?.qualityScores[0];
    return score
      ? [{
          sectionId: section.id,
          sectionKey: section.sectionKey,
          title: section.title,
          order: section.order,
          assetId: section.currentImageAsset!.id,
          colorConsistencyScore: score.colorConsistencyScore,
        }]
      : [];
  });
  const values = scored.map((item) => item.colorConsistencyScore);
  return {
    status: scored.length === sections.length && scored.length > 0 ? "scored" : "incomplete",
    scoredCount: scored.length,
    totalCount: sections.length,
    averageScore: values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
    minimumScore: values.length > 0 ? Math.min(...values) : null,
    breaks: scored.filter((item) => item.colorConsistencyScore < IMAGE_QUALITY_THRESHOLDS.colorConsistencyScore),
  };
}
