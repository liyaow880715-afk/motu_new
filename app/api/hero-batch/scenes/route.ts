import { NextRequest } from "next/server";
import { z } from "zod";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export const maxDuration = 120;

const sceneRequestSchema = z.object({
  productName: z.string().min(1, "缺少商品名称"),
  productDescription: z.string().optional().default(""),
  groupCount: z.number().int().min(4).max(10),
});

interface ScenePlan {
  sceneName: string;
  style: string;
  sellingPoint: string;
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

    const systemPrompt = [
      "你是电商视觉策划。根据商品名称和卖点信息，为主图拍摄设计场景方案，只输出纯 JSON 数组：",
      '[{ "sceneName": "场景名称", "sellingPoint": "绑定的主卖点", "style": "绘图风格描述" }]',
      "要求：",
      "1. 每组绑定一个不同的主卖点（从商品信息里挑，不要编造），sceneName 2-6 个字概括场景。",
      "2. style 是一段中文绘图风格描述：场景布置、光线、氛围、构图、色调，30-60 字，直接可用于 AI 绘图提示词；不要包含任何关于画面文字/文案的要求。",
      "3. 场景之间风格要明显区分开（如白底棚拍、生活场景、户外、暗黑高级、节日氛围等），不要雷同。",
      "4. 只输出 JSON 数组，不要输出其他内容。",
    ].join("\n");

    const userPrompt = [
      `商品：${parsed.productName}`,
      "商品信息：",
      parsed.productDescription || "（无）",
      `请生成 ${parsed.groupCount} 组主图场景方案。`,
    ].join("\n");

    const result = await adapter.generateText({
      model,
      systemPrompt,
      userPrompt,
      timeoutMs: 90000,
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
        return {
          sceneName: String(obj.sceneName ?? "").trim(),
          sellingPoint: String(obj.sellingPoint ?? "").trim(),
          style: String(obj.style ?? "").trim(),
        };
      })
      .filter((s) => s.sceneName && s.style)
      .slice(0, parsed.groupCount);

    if (scenes.length === 0) throw new Error("场景方案为空，请重试");

    return ok({ scenes });
  } catch (error) {
    return handleRouteError(error);
  }
}
