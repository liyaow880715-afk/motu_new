import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";
import type { HeroTemplateStructure, HeroTemplateStyleProfile } from "@/types/hero-template";

const heroTemplateStructureSchema = z.object({
  overallStyle: z.string().min(1),
  colorPalette: z.object({
    background: z.string().min(1),
    primary: z.string().min(1),
    secondary: z.string().min(1),
    accent: z.string().min(1),
    text: z.string().min(1),
  }),
  typography: z.object({
    heading: z.string().min(1),
    subheading: z.string().min(1),
    body: z.string().min(1),
    tags: z.string().min(1),
  }),
  productPosition: z.string().min(1),
  productSizeRatio: z.string().min(1),
  textLayout: z.string().min(1),
  background: z.string().min(1),
  lighting: z.string().min(1),
  mood: z.string().min(1),
  compositionNotes: z.string().min(1),
  decorativeElements: z.string().min(1),
});

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

const ANALYSIS_PROMPT = `你是一个电商主图视觉分析专家。请根据用户提供的参考主图，输出结构化的视觉分析结果。

输出必须是以下 JSON 格式（不要包含 markdown 代码块标记，只输出纯 JSON）：
{
  "overallStyle": "整体风格描述，如：温暖日系，浅米色底，手写体文案，暖光摄影",
  "colorPalette": {
    "background": "背景主色，6位HEX",
    "primary": "画面主色，6位HEX",
    "secondary": "辅助色，6位HEX",
    "accent": "强调色/CTA色，6位HEX",
    "text": "文字色，6位HEX"
  },
  "typography": {
    "heading": "标题字体风格描述",
    "subheading": "副标题字体风格描述",
    "body": "正文字体风格描述",
    "tags": "标签/卖点字体风格描述"
  },
  "productPosition": "商品在画面中的位置，如：居中偏下1/3、左侧1/2",
  "productSizeRatio": "商品占画面比例，如：占画面60%、中等大小",
  "textLayout": "文字排版方式，如：顶部大标题，中部商品，底部标签",
  "background": "背景描述，如：纯白、浅灰渐变、实景虚化",
  "lighting": "光照描述，如：柔和影棚光、自然窗光、侧逆光",
  "mood": "氛围情绪，如：高端简约、温馨居家、科技冷峻",
  "compositionNotes": "构图备注，如：对称构图、三分法、大量留白",
  "decorativeElements": "装饰元素，如：几何色块、植物点缀、光斑、线条"
}

要求：
1. 颜色必须是6位HEX色值（如 #FFFFFF）。
2. 描述要具体、可执行，便于后续生成时直接套用。
3. 必须识别商品位置、大小、文字排版等版式信息。
4. 如果图片中包含文字，请描述其字体气质和排版层级。`;

export async function analyzeHeroTemplate(
  imageDataUrl: string,
  description?: string,
): Promise<{ structure: HeroTemplateStructure; rawText: string }> {
  const { adapter, provider } = await getProviderAdapter("text");
  let visionModel = pickVisionModel(provider.models);

  if (!visionModel && provider.models.length > 0) {
    // Fallback: use the provider's default analysis model or the first available model.
    // Many OpenAI-compatible text models can read images even if their capabilities don't declare vision.
    const fallbackModel = provider.models.find((m) => (m as { isDefaultAnalysis?: boolean }).isDefaultAnalysis)
      ?? provider.models[0];
    visionModel = fallbackModel?.modelId ?? null;
  }

  if (!visionModel) {
    throw new Error("当前没有可用的模型来分析主图。请配置文本模型。");
  }

  const userPrompt = [
    "请分析这张电商主图，提取它的视觉风格和版式规范。",
    description ? `\n用户补充描述：\n${description}` : "",
  ].filter(Boolean).join("\n");

  const result = await adapter.generateText({
    model: visionModel,
    systemPrompt: ANALYSIS_PROMPT,
    userPrompt,
    images: [imageDataUrl],
    timeoutMs: 120000,
  });

  let parsed: HeroTemplateStructure;
  try {
    const cleaned = result.text.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
    parsed = heroTemplateStructureSchema.parse(JSON.parse(cleaned));
  } catch {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = heroTemplateStructureSchema.parse(JSON.parse(jsonMatch[0]));
    } else {
      throw new Error("AI 分析结果格式不正确，无法解析为 JSON");
    }
  }

  return { structure: parsed, rawText: result.text };
}

export async function createTemplate(input: {
  name: string;
  referenceImageUrl: string;
  structureJson: HeroTemplateStructure;
  styleProfile: HeroTemplateStyleProfile;
  category?: string;
  description?: string;
  rawAnalysis?: string;
}) {
  const template = await prisma.heroTemplate.create({
    data: {
      name: input.name,
      referenceImageUrl: input.referenceImageUrl,
      structureJson: input.structureJson as any,
      styleProfile: input.styleProfile as any,
      category: input.category ?? "general",
      description: input.description ?? null,
      rawAnalysis: input.rawAnalysis ?? null,
    },
  });

  return template;
}

export async function getAllTemplates(category?: string) {
  const templates = await prisma.heroTemplate.findMany({
    where: category ? { category } : undefined,
    orderBy: { createdAt: "desc" },
  });

  return templates;
}

export async function getTemplateById(id: string) {
  const template = await prisma.heroTemplate.findUnique({
    where: { id },
  });

  return template;
}

export async function deleteTemplate(id: string) {
  await prisma.heroTemplate.delete({
    where: { id },
  });
}

export async function updateTemplate(
  id: string,
  input: {
    name?: string;
    structureJson?: HeroTemplateStructure;
    styleProfile?: HeroTemplateStyleProfile;
    category?: string;
    description?: string;
  },
) {
  const template = await prisma.heroTemplate.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.structureJson !== undefined && { structureJson: input.structureJson as any }),
      ...(input.styleProfile !== undefined && { styleProfile: input.styleProfile as any }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.description !== undefined && { description: input.description }),
    },
  });

  return template;
}
