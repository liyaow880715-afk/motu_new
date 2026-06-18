import { z } from "zod";

import { buildImageQualityScorePrompt } from "@/lib/ai/prompts";
import { prisma } from "@/lib/db/prisma";
import { readStorageFile } from "@/lib/storage/asset-manager";
import { getProviderAdapter } from "@/lib/services/provider-service";

const qualityScoreSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  colorConsistencyScore: z.number().int().min(0).max(100),
  promptAlignmentScore: z.number().int().min(0).max(100),
  copyAlignmentScore: z.number().int().min(0).max(100),
  compositionScore: z.number().int().min(0).max(100),
  typographyScore: z.number().int().min(0).max(100),
  analysis: z.string().min(1),
});

export type ImageQualityScoreResult = z.infer<typeof qualityScoreSchema>;

function scoreVisionModelPriority(modelId: string) {
  const id = modelId.toLowerCase();
  let score = 0;

  // Prefer well-known vision models
  if (/gpt-4o|gpt-5|claude-3.5|claude-4|gemini-1\.5|gemini-2|qwen-vl|kimi-vl/.test(id)) score += 10;
  if (/vision|vl/.test(id)) score += 5;
  if (/pro|max|ultra/.test(id)) score += 3;

  // Deprioritize previews / experiments
  if (/preview|experimental|beta|test/.test(id)) score -= 3;

  return score;
}

function pickVisionModel(models: Array<{ modelId: string; capabilities: unknown }>) {
  const visionModels = models.filter((model) => {
    const capabilities = (model.capabilities ?? {}) as Record<string, unknown>;
    return Boolean(capabilities.vision) || Boolean(capabilities.image_vision);
  });

  if (!visionModels.length) {
    return null;
  }

  return visionModels
    .slice()
    .sort((a, b) => scoreVisionModelPriority(b.modelId) - scoreVisionModelPriority(a.modelId))[0]?.modelId ?? null;
}

async function assetToDataUrl(asset: { filePath: string; mimeType: string | null }) {
  const buffer = await readStorageFile(asset.filePath);
  const mimeType = asset.mimeType ?? "image/png";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function scoreGeneratedImage(assetId: string) {
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

  // Use text provider with vision capability for evaluation
  const { adapter, provider } = await getProviderAdapter("text");
  const visionModel = pickVisionModel(provider.models);

  if (!visionModel) {
    throw new Error("当前没有可用的 vision 模型来进行图片质量评分。请在模型服务配置中配置一个支持 vision 的文本模型。");
  }

  const section = asset.section;
  const metadata = (asset.metadata as Record<string, unknown> | null) ?? {};
  const promptText = typeof metadata.prompt === "string" ? metadata.prompt : "";
  const aspectRatio = typeof metadata.aspectRatio === "string" ? metadata.aspectRatio : "9:16";

  const imageDataUrl = await assetToDataUrl(asset);

  const scoringPrompt = buildImageQualityScorePrompt({
    sectionType: section?.type ?? "UNKNOWN",
    title: section?.title ?? "",
    goal: section?.goal ?? "",
    copy: section?.copy ?? "",
    visualPrompt: section?.visualPrompt ?? "",
    prompt: promptText,
    aspectRatio,
  });

  const result = await adapter.generateStructured({
    model: visionModel,
    systemPrompt: "You are a strict visual-quality evaluator. Return valid JSON only.",
    userPrompt: scoringPrompt,
    schema: qualityScoreSchema,
    images: [imageDataUrl],
    timeoutMs: 120000,
    monitor: {
      projectId: asset.projectId,
      sectionId: asset.sectionId ?? undefined,
      operation: "score_image_quality",
    },
  });

  const scoreData = result.parsed;

  // Delete previous scores for this asset to keep only the latest
  await prisma.imageQualityScore.deleteMany({
    where: { assetId },
  });

  const record = await prisma.imageQualityScore.create({
    data: {
      assetId,
      overallScore: scoreData.overallScore,
      colorConsistencyScore: scoreData.colorConsistencyScore,
      promptAlignmentScore: scoreData.promptAlignmentScore,
      copyAlignmentScore: scoreData.copyAlignmentScore,
      compositionScore: scoreData.compositionScore,
      typographyScore: scoreData.typographyScore,
      analysis: scoreData.analysis,
      scoredByModel: visionModel,
      scoredAt: new Date(),
    },
  });

  return {
    ...record,
    raw: result.raw,
  };
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
