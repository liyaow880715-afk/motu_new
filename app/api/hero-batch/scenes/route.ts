import { NextRequest } from "next/server";
import { z } from "zod";
import { getProviderAdapter } from "@/lib/services/provider-service";
import {
  HERO_ANGLE_DEFINITIONS,
  HERO_ANGLE_IDS,
  type HeroAngle,
} from "@/lib/ai/prompts/hero-angles";
import { handleRouteError, ok } from "@/lib/utils/route";

export const maxDuration = 120;

const sceneRequestSchema = z.object({
  productName: z.string().min(1, "缺少商品名称"),
  productDescription: z.string().optional().default(""),
  factClaims: z.array(z.string()).max(12).optional().default([]),
  groupCount: z.number().int().min(4).max(10),
});

interface SceneCopy {
  headline: string;
  subline: string;
}

interface ScenePlan {
  sceneName: string;
  style: string;
  sellingPoint: string;
  angleCopies: Partial<Record<HeroAngle, SceneCopy>>;
}

/**
 * 用文字模型按商品卖点生成 N 组主图场景方案。
 * 每组绑定一个主卖点，style 为可直接用于绘图 prompt 的中文风格描述。
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = sceneRequestSchema.parse(await request.json());
    const { provider, adapter } = await getProviderAdapter("text");
    const model =
      provider.models.find((m) => (m as { isDefaultAnalysis?: boolean }).isDefaultAnalysis)?.modelId
      ?? provider.models[0]?.modelId
      ?? "";

    const angleRequirements = HERO_ANGLE_IDS.map((angle) => (
      `${angle}（${HERO_ANGLE_DEFINITIONS[angle].label}）：${HERO_ANGLE_DEFINITIONS[angle].copyInstruction}`
    )).join("\n");
    const systemPrompt = [
      "你是中国电商主图视觉策划与文案总监。根据商品名称、已确认卖点和事实白名单，一次完成场景及主副标题规划，只输出纯 JSON 数组。",
      '[{ "sceneName": "场景名称", "sellingPoint": "绑定的主卖点", "style": "绘图风格描述", "angleCopies": { "PRODUCT_MEMORY": { "headline": "主标题", "subline": "副标题" }, "CORE_BENEFIT": { "headline": "主标题", "subline": "副标题" }, "SCENE_PAYOFF": { "headline": "主标题", "subline": "副标题" }, "QUALITY_PROOF": { "headline": "主标题", "subline": "副标题" }, "DIFFERENTIATION": { "headline": "主标题", "subline": "副标题" } } }]',
      "要求：",
      "1. 每组绑定一个不同的主卖点（从商品信息里挑，不要编造），sceneName 2-6 个字概括场景。",
      "2. style 是一段中文绘图风格描述：场景布置、光线、氛围、构图、色调，30-60 字，直接可用于 AI 绘图提示词；不要包含任何关于画面文字/文案的要求。",
      "3. 每组必须为下列 5 个角度分别生成主标题和副标题，主标题 4-12 个中文字符，副标题不超过 16 个中文字符；要有具体商品钩子、消费者利益和点击理由，禁止空泛口号。",
      angleRequirements,
      "4. 所有文案只能使用商品信息和事实白名单中的内容。禁止虚构销量、好评、功效、认证、限时限量、赠品、包邮和未经证实的数字。",
      "5. 同一组的 5 张图共享场景色调，但构图和文案角度必须有明确差异；不同组可以更换场景，仍需保持商品品牌气质一致。",
      "6. 主标题和副标题必须是简体中文，不得包含免责声明。只输出 JSON 数组，不要输出其他内容。",
    ].join("\n");

    const userPrompt = [
      `商品：${parsed.productName}`,
      "商品信息：",
      parsed.productDescription || "（无）",
      `事实白名单：${parsed.factClaims.length ? parsed.factClaims.join("；") : "仅使用商品信息中可确认的事实"}`,
      `请生成 ${parsed.groupCount} 组主图场景方案。`,
    ].join("\n");

    const result = await adapter.generateText({
      model,
      systemPrompt,
      userPrompt,
      reasoningEffort: "low",
      maxOutputTokens: 9000,
      timeoutMs: 90000,
      monitor: {
        operation: "hero_batch_scene_planning",
      },
    });

    let rawScenes: unknown;
    try {
      const cleaned = result.text.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
      rawScenes = JSON.parse(cleaned);
    } catch {
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("场景方案解析失败，请重试");
      rawScenes = JSON.parse(jsonMatch[0]);
    }

    if (!Array.isArray(rawScenes)) throw new Error("场景方案解析失败，请重试");

    const scenes: ScenePlan[] = rawScenes
      .map((item) => {
        const obj = (item ?? {}) as Record<string, unknown>;
        const rawAngleCopies = obj.angleCopies && typeof obj.angleCopies === "object" && !Array.isArray(obj.angleCopies)
          ? obj.angleCopies as Record<string, unknown>
          : {};
        const angleCopies: Partial<Record<HeroAngle, SceneCopy>> = {};
        for (const angle of HERO_ANGLE_IDS) {
          const rawCopy = rawAngleCopies[angle];
          if (!rawCopy || typeof rawCopy !== "object" || Array.isArray(rawCopy)) continue;
          const copy = rawCopy as Record<string, unknown>;
          const headline = String(copy.headline ?? "").trim();
          const subline = String(copy.subline ?? "").trim();
          if (headline) angleCopies[angle] = { headline, subline };
        }
        return {
          sceneName: String(obj.sceneName ?? "").trim(),
          sellingPoint: String(obj.sellingPoint ?? "").trim(),
          style: String(obj.style ?? "").trim(),
          angleCopies,
        };
      })
      .filter((s) => (
        s.sceneName
        && s.style
        && HERO_ANGLE_IDS.every((angle) => Boolean(s.angleCopies[angle]?.headline))
      ))
      .slice(0, parsed.groupCount);

    if (scenes.length !== parsed.groupCount) {
      throw new Error(`场景与文案规划不完整（需要 ${parsed.groupCount} 组，每组 5 套主副标题），请重试`);
    }

    return ok({ scenes });
  } catch (error) {
    return handleRouteError(error);
  }
}
