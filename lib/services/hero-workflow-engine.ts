import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { generateWhiteBgImage } from "@/lib/services/hero-white-bg-service";
import { createGeneration, runGeneration } from "@/lib/services/hero-scene-generation-service";
import { createVariant, batchComposeVariants } from "@/lib/services/hero-scene-variant-service";
import { generateAllProductAssets } from "@/lib/services/hero-product-asset-service";
import { createExport } from "@/lib/services/hero-scene-export-service";
import { getAllScenes } from "@/lib/services/hero-scene-service";
import { readStorageFile } from "@/lib/storage/asset-manager";
import { env } from "@/lib/utils/env";
import type {
  WorkflowStage,
  WorkflowStatus,
  WorkflowStageData,
  HeroWorkflowRecord,
  WorkflowExtractData,
  WorkflowStrategyData,
  WorkflowCopyItem,
  WorkflowSceneItem,
  WorkflowVariantItem,
  WorkflowAssetItem,
  WorkflowReviewData,
  WorkflowStoreLink,
} from "@/types/hero-workflow";

const STAGES: WorkflowStage[] = [
  "EXTRACT",
  "STRATEGY",
  "WHITE_BG",
  "SCENES",
  "COPIES",
  "VARIANTS",
  "ASSETS",
  "REVIEW",
  "EXPORT",
];

const REVIEWABLE_STAGES: Set<WorkflowStage> = new Set([
  "EXTRACT",
  "STRATEGY",
  "SCENES",
  "COPIES",
  "VARIANTS",
  "ASSETS",
  "REVIEW",
]);

const LAYOUT_STYLE_OPTIONS = ["title-top", "title-bottom", "title-left", "title-right", "center-tag"];

async function resolveImageDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;

  if (url.startsWith("/api/files/")) {
    const match = url.match(/\/api\/files\/(.*)$/);
    if (!match) throw new Error("无法解析图片路径");
    const buffer = await readStorageFile(match[1]);
    const ext = match[1].split(".").pop()?.toLowerCase() ?? "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  return url;
}

async function pickVisionModel(): Promise<string> {
  const { provider } = await getProviderAdapter("text");
  const model = provider.models.find((m) => {
    const caps = m.capabilities as Record<string, unknown>;
    return caps?.vision && (caps?.text || caps?.structured_output);
  });
  if (!model) throw new Error("未找到支持视觉的模型，请在 AI 配置中启用 vision 模型");
  return model.modelId;
}

async function pickTextModel(): Promise<string> {
  const { provider } = await getProviderAdapter("text");
  const model =
    provider.models.find((m) => (m as { isDefaultAnalysis?: boolean }).isDefaultAnalysis) ??
    provider.models.find((m) => {
      const caps = m.capabilities as Record<string, unknown>;
      return caps?.text || caps?.structured_output;
    });
  if (!model) throw new Error("未找到可用的文本模型");
  return model.modelId;
}

function mapWorkflowRecord(row: {
  id: string;
  productName: string;
  sourceImageUrl: string;
  status: string;
  currentStage: string;
  stageData: unknown;
  config: unknown;
  reviewResult: unknown;
  exportRecordId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): HeroWorkflowRecord {
  return {
    ...row,
    status: row.status as WorkflowStatus,
    currentStage: row.currentStage as WorkflowStage,
    stageData: (row.stageData ?? {}) as WorkflowStageData,
    config: row.config ? (row.config as Record<string, unknown>) : undefined,
    reviewResult: row.reviewResult ? (row.reviewResult as WorkflowReviewData) : undefined,
    exportRecordId: row.exportRecordId ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createWorkflow(input: {
  productName?: string;
  sourceImageUrl: string;
  initialConfig?: Record<string, unknown>;
}) {
  const row = await prisma.heroWorkflow.create({
    data: {
      productName: input.productName || "未命名商品",
      sourceImageUrl: input.sourceImageUrl,
      status: "PENDING",
      currentStage: "EXTRACT",
      config: (input.initialConfig ?? {}) as any,
      stageData: {},
    },
  });
  return mapWorkflowRecord(row);
}

export async function getWorkflowById(id: string) {
  const row = await prisma.heroWorkflow.findUnique({ where: { id } });
  if (!row) return null;
  return mapWorkflowRecord(row);
}

export async function listWorkflows(status?: WorkflowStatus) {
  const rows = await prisma.heroWorkflow.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapWorkflowRecord);
}

export async function deleteWorkflow(id: string) {
  await prisma.heroWorkflow.delete({ where: { id } });
}

export async function updateWorkflowStageData(
  id: string,
  stage: WorkflowStage,
  data: Partial<WorkflowStageData>,
) {
  const existing = await prisma.heroWorkflow.findUnique({ where: { id } });
  if (!existing) throw new Error("工作流不存在");

  const stageData = { ...(existing.stageData as any), ...data };
  const row = await prisma.heroWorkflow.update({
    where: { id },
    data: { stageData: stageData as any },
  });
  return mapWorkflowRecord(row);
}

export async function updateWorkflowConfig(id: string, config: Record<string, unknown>) {
  const existing = await prisma.heroWorkflow.findUnique({ where: { id } });
  if (!existing) throw new Error("工作流不存在");

  const merged = { ...(existing.config as any), ...config };
  const row = await prisma.heroWorkflow.update({
    where: { id },
    data: { config: merged as any },
  });
  return mapWorkflowRecord(row);
}

async function setWorkflowStatus(
  id: string,
  status: WorkflowStatus,
  errorMessage?: string,
) {
  const row = await prisma.heroWorkflow.update({
    where: { id },
    data: {
      status,
      errorMessage: errorMessage ?? null,
    },
  });
  return mapWorkflowRecord(row);
}

async function advanceStage(workflow: HeroWorkflowRecord): Promise<HeroWorkflowRecord> {
  const currentIndex = STAGES.indexOf(workflow.currentStage);
  if (currentIndex === -1 || currentIndex === STAGES.length - 1) {
    return setWorkflowStatus(workflow.id, "COMPLETED");
  }
  const nextStage = STAGES[currentIndex + 1];
  const row = await prisma.heroWorkflow.update({
    where: { id: workflow.id },
    data: { currentStage: nextStage },
  });
  return mapWorkflowRecord(row);
}

export async function submitStageReviewAndContinue(
  id: string,
  stageDataPatch?: Partial<WorkflowStageData>,
) {
  const workflow = await getWorkflowById(id);
  if (!workflow) throw new Error("工作流不存在");
  if (workflow.status !== "REVIEW_REQUIRED") {
    throw new Error("当前阶段不在审核状态");
  }

  if (stageDataPatch) {
    await updateWorkflowStageData(id, workflow.currentStage, stageDataPatch);
  }

  const advanced = await advanceStage(workflow);
  return runWorkflowToNextGate(advanced.id);
}

export async function retryCurrentStage(id: string) {
  const workflow = await getWorkflowById(id);
  if (!workflow) throw new Error("工作流不存在");
  return runStage(workflow);
}

export async function skipCurrentStage(id: string) {
  const workflow = await getWorkflowById(id);
  if (!workflow) throw new Error("工作流不存在");
  const advanced = await advanceStage(workflow);
  return runWorkflowToNextGate(advanced.id);
}

const extractOutputSchema = z.object({
  productName: z.string(),
  productDescription: z.string().optional(),
  category: z.string().optional(),
  specs: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  ingredients: z.array(z.string()).default([]),
  nutritionRows: z.array(z.object({ label: z.string(), value: z.string(), unit: z.string() })).default([]),
});

async function runExtractStage(workflow: HeroWorkflowRecord): Promise<WorkflowStageData> {
  const model = await pickVisionModel();
  const { adapter } = await getProviderAdapter("text");
  const imageUrl = await resolveImageDataUrl(workflow.sourceImageUrl);

  const prompt = `你是一位电商商品信息提取专家。请分析这张商品图片，提取以下信息并以 JSON 返回：
{
  "productName": "商品名称",
  "productDescription": "一句话卖点描述",
  "category": "商品类别",
  "specs": [{"label":"规格项","value":"值"}],
  "ingredients": ["成分1", "成分2"],
  "nutritionRows": [{"label":"项目","value":"数值","unit":"单位"}]
}
如果图片中无法识别某项，对应字段留空或空数组。不要添加 markdown 代码块。`;

  const result = await adapter.generateStructured({
    model,
    systemPrompt: "Return one strict JSON object only. No markdown.",
    userPrompt: prompt,
    schema: extractOutputSchema,
    images: [imageUrl],
    timeoutMs: 120000,
  });

  const extract = result.parsed;
  if (workflow.productName && workflow.productName !== "未命名商品") {
    extract.productName = workflow.productName;
  }

  return { extract };
}

const strategyOutputSchema = z.object({
  sceneIds: z.array(z.string()).min(1).max(6),
  layouts: z.array(z.string()).min(1).max(5),
  copyStyles: z.array(z.string()).min(1),
  copyCount: z.number().min(1).max(20),
  assetTypes: z.array(z.enum(["white-bg", "spec", "ingredient", "nutrition"])).min(1),
});

async function runStrategyStage(workflow: HeroWorkflowRecord): Promise<WorkflowStageData> {
  const scenes = await getAllScenes();
  const extract = workflow.stageData.extract;
  if (!extract) throw new Error("缺少商品提取信息");

  const config = workflow.config || {};
  const defaultStores = (config.defaultStores as WorkflowStoreLink[]) || [
    { name: "默认店铺", links: ["链接1"] },
  ];

  const model = await pickTextModel();
  const { adapter } = await getProviderAdapter("text");

  const sceneList = scenes.map((s) => ({ id: s.id, name: s.name, category: s.category }));
  const prompt = `你是一位拼多多主图运营专家。请为以下商品制定主图生成策略，返回 JSON：
商品名称：${extract.productName}
卖点：${extract.productDescription || "未提供"}
类别：${extract.category || "未提供"}
可选场景：${JSON.stringify(sceneList.map((s) => `${s.name}(${s.id})`))}
可选排版：${JSON.stringify(LAYOUT_STYLE_OPTIONS)}

要求：
1. 从可选场景中选择 2-6 个最匹配的场景 ID。
2. 选择 1-5 种排版。
3. copyStyles 写文案风格关键词，如["促销型","信任型","种草型"]。
4. copyCount 是生成的主图文案条数，建议 5-12。
5. assetTypes 选择需要生成的素材类型：white-bg, spec, ingredient, nutrition。

返回格式：
{
  "sceneIds": ["id1","id2"],
  "layouts": ["title-bottom","center-tag"],
  "copyStyles": ["促销型"],
  "copyCount": 8,
  "assetTypes": ["white-bg","spec","ingredient","nutrition"]
}`;

  const result = await adapter.generateStructured({
    model,
    systemPrompt: "Return one strict JSON object only. No markdown.",
    userPrompt: prompt,
    schema: strategyOutputSchema,
    timeoutMs: 120000,
  });

  const strategy: WorkflowStrategyData = {
    sceneIds: result.parsed.sceneIds.filter((id) => sceneList.some((s) => s.id === id)),
    layouts: result.parsed.layouts.filter((l) => LAYOUT_STYLE_OPTIONS.includes(l)),
    copyStyles: result.parsed.copyStyles,
    copyCount: result.parsed.copyCount,
    assetTypes: result.parsed.assetTypes,
    stores: defaultStores,
  };

  if (strategy.sceneIds.length === 0 && sceneList.length > 0) {
    strategy.sceneIds = [sceneList[0].id];
  }
  if (strategy.layouts.length === 0) {
    strategy.layouts = ["title-bottom"];
  }

  return { strategy };
}

async function runWhiteBgStage(workflow: HeroWorkflowRecord): Promise<WorkflowStageData> {
  const extract = workflow.stageData.extract;
  if (!extract) throw new Error("缺少商品提取信息");

  const imageUrl = await generateWhiteBgImage(
    extract.productName,
    extract.productDescription,
    workflow.sourceImageUrl,
  );

  return { whiteBg: { imageUrl } };
}

async function runScenesStage(workflow: HeroWorkflowRecord): Promise<WorkflowStageData> {
  const extract = workflow.stageData.extract;
  const strategy = workflow.stageData.strategy;
  if (!extract || !strategy) throw new Error("缺少前置数据");

  const scenes = await getAllScenes();
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));

  const generationInputs = strategy.sceneIds.map((sceneId) => {
    const scene = sceneMap.get(sceneId);
    if (!scene) throw new Error(`场景不存在: ${sceneId}`);
    return { sceneId, sceneName: scene.name };
  });

  const created = await Promise.all(
    generationInputs.map(({ sceneId }) =>
      createGeneration({
        productName: extract.productName,
        productDescription: extract.productDescription,
        sourceImageUrl: workflow.sourceImageUrl,
        sceneLibraryId: sceneId,
      }),
    ),
  );

  const results = await Promise.all(
    created.map(async (gen, idx) => {
      try {
        await runGeneration(gen.id);
        const refreshed = await prisma.heroSceneGeneration.findUnique({
          where: { id: gen.id },
          include: { sceneLibrary: true },
        });
        return {
          generationId: gen.id,
          sceneId: generationInputs[idx].sceneId,
          sceneName: generationInputs[idx].sceneName,
          imageUrl: refreshed?.generatedImageUrl ?? undefined,
          status: refreshed?.status ?? "PENDING",
          errorMessage: refreshed?.errorMessage ?? undefined,
        } as WorkflowSceneItem;
      } catch (error) {
        return {
          generationId: gen.id,
          sceneId: generationInputs[idx].sceneId,
          sceneName: generationInputs[idx].sceneName,
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "场景生成失败",
        } as WorkflowSceneItem;
      }
    }),
  );

  return { scenes: results };
}

const copiesOutputSchema = z.object({
  copies: z.array(
    z.object({
      copyText: z.string().min(1).max(40),
      subCopyText: z.string().max(60).optional(),
      tags: z.array(z.string().max(10)).default([]),
    }),
  ),
});

async function runCopiesStage(workflow: HeroWorkflowRecord): Promise<WorkflowStageData> {
  const extract = workflow.stageData.extract;
  const strategy = workflow.stageData.strategy;
  if (!extract || !strategy) throw new Error("缺少前置数据");

  const model = await pickTextModel();
  const { adapter } = await getProviderAdapter("text");

  const prompt = `你是一位拼多多主图文案专家。请为以下商品生成 ${strategy.copyCount} 条主图文案，每条包含主标题、可选副标题、标签。
商品名称：${extract.productName}
卖点：${extract.productDescription || ""}
文案风格：${strategy.copyStyles.join(",")}

要求：
1. 主标题 copyText 控制在 4-12 个字，突出卖点。
2. 副标题 subCopyText 控制在 10 个字以内，可空。
3. tags 是 1-3 个促销标签，如["限时","包邮","买一发二"]。
4. 不要出现极限词、虚假宣传、违禁词。

返回 JSON 格式：
{
  "copies": [{"copyText":"...","subCopyText":"...","tags":["..."]}]
}`;

  const result = await adapter.generateStructured({
    model,
    systemPrompt: "Return one strict JSON object only. No markdown.",
    userPrompt: prompt,
    schema: copiesOutputSchema,
    timeoutMs: 120000,
  });

  const copies: WorkflowCopyItem[] = result.parsed.copies.slice(0, strategy.copyCount).map((c) => ({
    copyText: c.copyText,
    subCopyText: c.subCopyText,
    tags: (c.tags ?? []).slice(0, 3),
  }));

  return { copies };
}

async function runVariantsStage(workflow: HeroWorkflowRecord): Promise<WorkflowStageData> {
  const strategy = workflow.stageData.strategy;
  const copies = workflow.stageData.copies;
  const scenes = workflow.stageData.scenes;
  if (!strategy || !copies || !scenes) throw new Error("缺少前置数据");

  const completedScenes = scenes.filter((s) => s.status === "COMPLETED" && s.imageUrl);
  if (completedScenes.length === 0) throw new Error("没有已完成的场景底图");

  const variants: WorkflowVariantItem[] = [];
  const variantIds: string[] = [];

  for (const scene of completedScenes) {
    for (const copy of copies) {
      for (const layout of strategy.layouts) {
        const variant = await createVariant({
          generationId: scene.generationId,
          copyText: copy.copyText,
          subCopyText: copy.subCopyText,
          layoutStyle: layout as any,
          tags: copy.tags,
        });
        variants.push({
          variantId: variant.id,
          generationId: scene.generationId,
          copyText: copy.copyText,
          layoutStyle: layout,
          status: "PENDING",
        });
        variantIds.push(variant.id);
      }
    }
  }

  const composeResults = await batchComposeVariants(variantIds);

  const resultVariants = variants.map((v) => {
    const result = composeResults.find((r) => r.id === v.variantId);
    return {
      ...v,
      imageUrl: result?.url,
      status: result?.url ? "COMPLETED" : (result?.error ? "FAILED" : "PENDING"),
      errorMessage: result?.error,
    };
  });

  return { variants: resultVariants };
}

async function runAssetsStage(workflow: HeroWorkflowRecord): Promise<WorkflowStageData> {
  const extract = workflow.stageData.extract;
  const strategy = workflow.stageData.strategy;
  if (!extract || !strategy) throw new Error("缺少前置数据");

  const assetTypes = strategy.assetTypes;
  if (!assetTypes || assetTypes.length === 0) {
    return { assets: [] };
  }

  const allAssets = await generateAllProductAssets({
    productName: extract.productName,
    sourceImageUrl: workflow.sourceImageUrl,
    specs: extract.specs,
    ingredients: extract.ingredients,
    nutritionRows: extract.nutritionRows,
  });

  const assetItems: WorkflowAssetItem[] = [];
  for (const type of assetTypes) {
    const imageUrl = allAssets[type as keyof typeof allAssets];
    if (imageUrl) {
      const existing = await prisma.heroProductAsset.findFirst({
        where: { productName: extract.productName, type },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        assetItems.push({ assetId: existing.id, type, imageUrl: existing.imageUrl });
      }
    }
  }

  return { assets: assetItems };
}

const reviewOutputSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  issues: z.array(
    z.object({
      type: z.enum(["compliance", "quality", "consistency", "text"]),
      target: z.string(),
      message: z.string(),
      severity: z.enum(["low", "medium", "high"]),
    }),
  ).default([]),
});

async function runReviewStage(workflow: HeroWorkflowRecord): Promise<WorkflowStageData> {
  const extract = workflow.stageData.extract;
  const variants = workflow.stageData.variants;
  const assets = workflow.stageData.assets;
  if (!extract || !variants) throw new Error("缺少前置数据");

  const completedVariants = variants.filter((v) => v.status === "COMPLETED" && v.imageUrl);
  if (completedVariants.length === 0) throw new Error("没有可审查的变体");

  const model = await pickVisionModel();
  const { adapter } = await getProviderAdapter("text");

  const imageUrls = await Promise.all(
    completedVariants.slice(0, 6).map((v) => (v.imageUrl ? resolveImageDataUrl(v.imageUrl) : "")),
  );

  const prompt = `你是一位电商主图审核专家。请审查以下商品主图，从合规、质量、一致性三个维度打分并输出 JSON。
商品名称：${extract.productName}
卖点：${extract.productDescription || ""}

审查要求：
1. 合规：检查是否出现极限词（最、第一、最佳等）、虚假宣传、违禁词。
2. 质量：检查图片是否清晰、主体是否完整、文字是否可读。
3. 一致性：检查各图风格、商品主体是否一致。

返回 JSON：
{
  "score": 0-100,
  "passed": true/false,
  "issues": [{"type":"compliance|quality|consistency|text","target":"目标说明","message":"问题描述","severity":"low|medium|high"}]
}`;

  const result = await adapter.generateStructured({
    model,
    systemPrompt: "Return one strict JSON object only. No markdown.",
    userPrompt: prompt,
    schema: reviewOutputSchema,
    images: imageUrls.filter(Boolean),
    timeoutMs: 180000,
  });

  return { review: result.parsed };
}

async function runExportStage(workflow: HeroWorkflowRecord): Promise<WorkflowStageData> {
  const extract = workflow.stageData.extract;
  const strategy = workflow.stageData.strategy;
  const variants = workflow.stageData.variants;
  const assets = workflow.stageData.assets;
  if (!extract || !strategy || !variants) throw new Error("缺少前置数据");

  const completedVariantIds = variants
    .filter((v) => v.status === "COMPLETED" && v.variantId)
    .map((v) => v.variantId);

  if (completedVariantIds.length === 0) throw new Error("没有可导出的变体");

  const exportResult = await createExport({
    productName: extract.productName,
    variantIds: completedVariantIds,
    storeConfig: { stores: strategy.stores },
    assetIds: assets?.map((a) => a.assetId) ?? [],
  });

  return {
    export: {
      exportRecordId: exportResult.exportRecord.id,
      zipFilePath: exportResult.exportRecord.zipFilePath,
      variantCount: exportResult.exportRecord.variantCount,
    },
  };
}

async function runStage(workflow: HeroWorkflowRecord): Promise<HeroWorkflowRecord> {
  await setWorkflowStatus(workflow.id, "RUNNING");

  try {
    let stageDataPatch: Partial<WorkflowStageData> = {};

    switch (workflow.currentStage) {
      case "EXTRACT":
        stageDataPatch = await runExtractStage(workflow);
        break;
      case "STRATEGY":
        stageDataPatch = await runStrategyStage(workflow);
        break;
      case "WHITE_BG":
        stageDataPatch = await runWhiteBgStage(workflow);
        break;
      case "SCENES":
        stageDataPatch = await runScenesStage(workflow);
        break;
      case "COPIES":
        stageDataPatch = await runCopiesStage(workflow);
        break;
      case "VARIANTS":
        stageDataPatch = await runVariantsStage(workflow);
        break;
      case "ASSETS":
        stageDataPatch = await runAssetsStage(workflow);
        break;
      case "REVIEW":
        stageDataPatch = await runReviewStage(workflow);
        break;
      case "EXPORT":
        stageDataPatch = await runExportStage(workflow);
        break;
      default:
        throw new Error(`未知阶段: ${workflow.currentStage}`);
    }

    await updateWorkflowStageData(workflow.id, workflow.currentStage, stageDataPatch);

    if (workflow.currentStage === "EXPORT") {
      return setWorkflowStatus(workflow.id, "COMPLETED");
    }

    if (REVIEWABLE_STAGES.has(workflow.currentStage)) {
      return setWorkflowStatus(workflow.id, "REVIEW_REQUIRED");
    }

    const advanced = await advanceStage(workflow);
    return runStage(advanced);
  } catch (error) {
    const message = error instanceof Error ? error.message : "阶段执行失败";
    await setWorkflowStatus(workflow.id, "FAILED", message);
    throw error;
  }
}

export async function runWorkflowToNextGate(id: string): Promise<HeroWorkflowRecord> {
  const workflow = await getWorkflowById(id);
  if (!workflow) throw new Error("工作流不存在");
  if (workflow.status === "COMPLETED" || workflow.status === "FAILED") {
    return workflow;
  }
  return runStage(workflow);
}

export async function startWorkflow(id: string) {
  const workflow = await getWorkflowById(id);
  if (!workflow) throw new Error("工作流不存在");
  if (workflow.status !== "PENDING" && workflow.status !== "REVIEW_REQUIRED") {
    throw new Error("工作流状态不支持启动");
  }

  // Fire-and-forget autonomous run
  runWorkflowToNextGate(id).catch((error) => {
    console.error(`[HeroWorkflow] autonomous run failed for ${id}:`, error);
  });

  return getWorkflowById(id);
}
