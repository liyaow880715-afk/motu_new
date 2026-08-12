import type { ProductAsset } from "@prisma/client";

import { visualPromptAgentSchema } from "@/lib/ai/schemas/visual-prompt";
import { getProviderAdapter } from "@/lib/services/provider-service";
import type { ContentLanguage } from "@/lib/utils/content-language";

type VisualPromptMode = "ecommerce_section" | "image_edit";

type VisualPromptReferenceAsset = Pick<ProductAsset, "fileName" | "type" | "isMain">;

type BuildVisualPromptInput = {
  mode: VisualPromptMode;
  title: string;
  goal: string;
  copy: string;
  basePrompt: string;
  aspectRatio: "1:1" | "3:4" | "9:16";
  contentLanguage: ContentLanguage;
  referenceImages?: string[];
  referenceAssets?: VisualPromptReferenceAsset[];
  productContext?: unknown;
  visualStyleGuide?: unknown;
  platform?: string | null;
  projectId: string;
  sectionId: string;
  operation: string;
};

export type VisualPromptBuildResult = {
  prompt: string;
  source: "agent" | "fallback";
  model: string | null;
  analysisSummary: string;
  qualityChecklist: string[];
};

const VISUAL_PROMPT_AGENT_TIMEOUT_MS = 60_000;
const MAX_CONTEXT_CHARS = 14_000;

function readCapabilities(model: { capabilities: unknown }) {
  return (model.capabilities as Record<string, boolean> | null) ?? {};
}

function pickPromptModel(
  models: Array<{
    modelId: string;
    capabilities: unknown;
    isDefaultPlanning?: boolean;
    isDefaultAnalysis?: boolean;
  }>,
  needsVision: boolean,
) {
  const textModels = models.filter((model) => readCapabilities(model).text);
  const visionTextModels = textModels.filter((model) => readCapabilities(model).vision);
  const candidates = needsVision && visionTextModels.length > 0 ? visionTextModels : textModels;

  return (
    candidates.find((model) => model.isDefaultPlanning)?.modelId ??
    candidates.find((model) => model.isDefaultAnalysis)?.modelId ??
    candidates.find((model) => /gpt-4o|gpt-4\.1|gpt-5|gemini|qwen.*vl|kimi|moonshot/i.test(model.modelId))?.modelId ??
    candidates[0]?.modelId ??
    null
  );
}

function serializeContext(value: unknown) {
  if (value === undefined || value === null) return null;

  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > MAX_CONTEXT_CHARS
      ? `${serialized.slice(0, MAX_CONTEXT_CHARS)}\n...[context truncated]`
      : serialized;
  } catch {
    return String(value).slice(0, MAX_CONTEXT_CHARS);
  }
}

function summarizeReferences(input: BuildVisualPromptInput) {
  const assets = input.referenceAssets?.map((asset, index) => ({
    position: index + 1,
    fileName: asset.fileName,
    role: asset.isMain ? "main_product" : asset.type.toLowerCase(),
  })) ?? [];

  return {
    assets,
    attachedImageCount: input.referenceImages?.length ?? 0,
  };
}

function buildAgentPrompt(input: BuildVisualPromptInput) {
  return [
    "你是 MoTu 的系统级 Visual Prompt Agent，工作流核心参考 MxPage。",
    "你的任务不是重新策划商品，也不是删改已有硬约束，而是在图片模型执行前，把现有模块蓝图整理成更清晰、可直接执行的最终视觉提示词。",
    "只返回严格 JSON，不要 Markdown。",
    "",
    "优先级规则：",
    "1. basePrompt 是已通过业务规划、事实校验、广告法约束、包装保护、横切面证据和版式锁定的执行合同。不得删除、弱化、改写或与其冲突。",
    "2. 商品与包装参考图是身份、几何、文字、颜色、材质、数量、开口和结构的事实来源。不得重设计商品。",
    "3. 项目视觉风格负责全套色温、主光方向、对比度、阴影、字体层级和色彩连续性。",
    "4. 你只能补充更具体的构图、镜头、场景、动作、景深、材质表现、文字安全区和质检要求。",
    "",
    "finalPrompt 必须明确：商业目标与目标用户、画幅和裁切、前中后景、主体位置和比例、机位、道具、动作、光线、材质、阴影、反射、色彩职责、标题层级、文字安全区、事实边界、商品保真、物理合理性和最终商业质感。",
    "negativePrompt 必须列出当前商品和当前模块最需要避免的错误；不要只写通用的 low quality。",
    "qualityChecklist 应提供图片生成后可以逐项人工检查的短句。",
    "所有生成建议使用中文；画面文字语言服从 contentLanguage。",
    "",
    `工作模式：${input.mode}`,
    `平台：${input.platform ?? "general_ecommerce"}`,
    `模块标题：${input.title}`,
    `模块目标：${input.goal}`,
    `模块文案：${input.copy}`,
    `画幅：${input.aspectRatio}`,
    `画面文字语言：${input.contentLanguage}`,
    "",
    "参考图角色：",
    JSON.stringify(summarizeReferences(input), null, 2),
    "",
    "商品事实与规格上下文：",
    serializeContext(input.productContext) ?? "无额外结构化事实",
    "",
    "项目统一视觉规范：",
    serializeContext(input.visualStyleGuide) ?? "无额外视觉规范",
    "",
    "不可删改的 basePrompt：",
    input.basePrompt,
    "",
    "返回结构：",
    JSON.stringify({
      analysisSummary: "简短说明本图的视觉策略",
      finalPrompt: "只写在 basePrompt 之上新增的具体执行增强，不要重复或缩写 basePrompt",
      negativePrompt: "当前模块必须避免的具体错误",
      qualityChecklist: ["检查项 1", "检查项 2", "检查项 3"],
    }, null, 2),
  ].join("\n");
}

function buildFallback(input: BuildVisualPromptInput, reason?: string): VisualPromptBuildResult {
  if (reason) {
    console.warn(`[VisualPromptAgent] ${input.operation} fell back to the verified base prompt: ${reason}`);
  }

  return {
    prompt: input.basePrompt,
    source: "fallback",
    model: null,
    analysisSummary: "",
    qualityChecklist: [],
  };
}

function composeFinalPrompt(input: BuildVisualPromptInput, result: {
  finalPrompt: string;
  negativePrompt: string;
  qualityChecklist: string[];
}) {
  return [
    "【MoTu 已验证执行合同｜最高优先级】",
    input.basePrompt,
    "",
    "【Visual Prompt Agent 执行增强｜不得覆盖上方合同】",
    result.finalPrompt,
    result.negativePrompt ? `\n【定向负面约束】\n${result.negativePrompt}` : "",
    result.qualityChecklist.length > 0
      ? `\n【生成后质检清单】\n${result.qualityChecklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function buildVisualPromptWithAgent(input: BuildVisualPromptInput): Promise<VisualPromptBuildResult> {
  let context: Awaited<ReturnType<typeof getProviderAdapter>>;

  try {
    context = await getProviderAdapter("text");
  } catch (error) {
    return buildFallback(input, error instanceof Error ? error.message : "text provider unavailable");
  }

  const canUseVision = (input.referenceImages?.length ?? 0) > 0;
  const model = pickPromptModel(context.provider.models, canUseVision);
  if (!model) {
    return buildFallback(input, "no text-capable planning model is configured");
  }

  const selectedModel = context.provider.models.find((item) => item.modelId === model);
  const supportsVision = selectedModel ? readCapabilities(selectedModel).vision : false;

  try {
    const result = await context.adapter.generateStructured({
      model,
      systemPrompt: "只返回一个严格有效的 JSON 对象，不要 Markdown，不要解释。",
      userPrompt: buildAgentPrompt(input),
      schema: visualPromptAgentSchema,
      images: supportsVision ? input.referenceImages?.slice(0, 3) : undefined,
      maxOutputTokens: 3200,
      timeoutMs: VISUAL_PROMPT_AGENT_TIMEOUT_MS,
      monitor: {
        projectId: input.projectId,
        sectionId: input.sectionId,
        operation: input.operation,
      },
    });

    return {
      prompt: composeFinalPrompt(input, result.parsed),
      source: "agent",
      model,
      analysisSummary: result.parsed.analysisSummary,
      qualityChecklist: result.parsed.qualityChecklist,
    };
  } catch (error) {
    return buildFallback(input, error instanceof Error ? error.message : "visual prompt planning failed");
  }
}
