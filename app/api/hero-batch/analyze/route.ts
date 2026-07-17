import { NextRequest } from "next/server";
import { z } from "zod";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { handleRouteError, ok } from "@/lib/utils/route";

const analyzeSchema = z.object({
  productImage: z.string().optional(),
  productImages: z.array(z.string()).optional(),
});

const ANALYSIS_PROMPT = `你是一个电商商品分析专家。请分析用户提供的商品图片（可能包含多张不同角度或细节图），输出以下信息（JSON格式）：

{
  "productName": "商品名称（简短吸引人，适合做主图文案）",
  "category": "商品品类",
  "material": "材质",
  "color": "颜色",
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "description": "一段适合电商详情页的商品描述文案（50-100字）",
  "targetAudience": "目标人群",
  "usageScenarios": ["使用场景1", "使用场景2"],
  "imageRoles": ["图1角色", "图2角色", "..."]
}

要求：
1. 只输出纯 JSON，不要 markdown 代码块
2. sellingPoints 至少 3 个，最多 5 个
3. 文案要适合中国消费者，用词有吸引力
4. 如果提供了多张图，请综合分析所有图片，imageRoles 按顺序描述每张图最突出的角色（如：主视角、侧面展示、细节特写、包装展示、使用场景等）`;

export async function POST(request: NextRequest) {
  try {
    const parsed = analyzeSchema.parse(await request.json());
    const images: string[] = [];
    if (parsed.productImages && parsed.productImages.length > 0) {
      for (const img of parsed.productImages) {
        if (img.startsWith("data:")) images.push(img);
      }
    }
    if (images.length === 0 && parsed.productImage?.startsWith("data:")) {
      images.push(parsed.productImage);
    }
    if (images.length === 0) {
      throw new Error("请上传商品图片");
    }

    const { provider, adapter } = await getProviderAdapter("text");

    // Priority: default analysis model if it supports vision, else first vision-capable model
    const defaultAnalysisModel = provider.models.find((m) => (m as any).isDefaultAnalysis);
    const hasVision = (m: typeof provider.models[0]) => {
      const caps = m.capabilities as Record<string, unknown>;
      return Boolean(caps?.vision && (caps?.text || caps?.structured_output));
    };

    let selectedModel: typeof provider.models[0] | undefined;
    if (defaultAnalysisModel && hasVision(defaultAnalysisModel)) {
      selectedModel = defaultAnalysisModel;
    } else {
      selectedModel = provider.models.find(hasVision);
    }

    const modelId = selectedModel?.modelId ?? provider.models[0]?.modelId ?? "";
    console.log("[HeroBatchAnalyze] Selected model:", modelId, "| Was default:", selectedModel === defaultAnalysisModel);

    const result = await adapter.generateText({
      model: modelId,
      systemPrompt: ANALYSIS_PROMPT,
      userPrompt: `请分析这 ${images.length} 张商品图片，输出 JSON 格式的商品信息。第一张是主要参考，其他图片作为补充信息。`,
      images,
      timeoutMs: 120000,
    });

    let parsedResult: Record<string, unknown>;
    try {
      const cleaned = result.text.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
      parsedResult = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      } else {
        throw new Error("AI 分析结果格式不正确");
      }
    }

    return ok({
      productName: String(parsedResult.productName ?? ""),
      category: String(parsedResult.category ?? ""),
      material: String(parsedResult.material ?? ""),
      color: String(parsedResult.color ?? ""),
      sellingPoints: Array.isArray(parsedResult.sellingPoints) ? parsedResult.sellingPoints.map(String) : [],
      description: String(parsedResult.description ?? ""),
      targetAudience: String(parsedResult.targetAudience ?? ""),
      usageScenarios: Array.isArray(parsedResult.usageScenarios) ? parsedResult.usageScenarios.map(String) : [],
      imageRoles: Array.isArray(parsedResult.imageRoles) ? parsedResult.imageRoles.map(String) : [],
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
