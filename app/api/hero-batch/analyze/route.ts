import { NextRequest } from "next/server";
import { z } from "zod";
import { isAnalysisModelCandidate } from "@/lib/ai/model-matcher";
import { getProviderAdapter } from "@/lib/services/provider-service";
import {
  PRODUCT_ANALYSIS_MAX_DATA_URL_CHARS,
  PRODUCT_ANALYSIS_MAX_IMAGES,
} from "@/lib/utils/product-analysis-image";
import { ApiRouteError, handleRouteError, ok } from "@/lib/utils/route";

const ANALYSIS_MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const analysisImageSchema = z.string()
  .max(PRODUCT_ANALYSIS_MAX_DATA_URL_CHARS)
  .refine(
    (value) => /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(value),
    "仅支持 JPG、PNG 或 WebP 图片",
  );

const analyzeSchema = z.object({
  productImage: analysisImageSchema.optional(),
  productImages: z.array(analysisImageSchema).max(PRODUCT_ANALYSIS_MAX_IMAGES).optional(),
});

const analysisOutputSchema = z.object({
  productName: z.string().catch(""),
  category: z.string().catch(""),
  material: z.string().catch(""),
  color: z.string().catch(""),
  sellingPoints: z.array(z.string()).catch([]),
  description: z.string().catch(""),
  targetAudience: z.string().catch(""),
  usageScenarios: z.array(z.string()).catch([]),
  numericClaims: z.array(z.string()).catch([]),
  factClaims: z.array(z.object({
    claim: z.string().catch(""),
    source: z.string().catch("analysis_inference"),
    evidence: z.string().catch(""),
    confidence: z.string().catch("low"),
    eligibleForMarketing: z.boolean().catch(false),
  }).passthrough()).catch([]),
  specs: z.array(z.object({
    name: z.string().catch(""),
    description: z.string().catch(""),
    highlights: z.array(z.string()).catch([]),
  })).catch([]),
  imageRoles: z.array(z.string()).catch([]),
}).passthrough();

async function parseAnalyzeRequest(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > ANALYSIS_MAX_REQUEST_BYTES) {
    throw new ApiRouteError(
      "ANALYSIS_PAYLOAD_TOO_LARGE",
      "商品图片总数据过大，请减少图片数量或重新选择图片后再试。",
      413,
      { maxBytes: ANALYSIS_MAX_REQUEST_BYTES, contentLength },
    );
  }

  try {
    return analyzeSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiRouteError(
        "INVALID_ANALYSIS_PAYLOAD",
        "图片数据传输不完整，请重新选择图片后再试。",
        400,
      );
    }
    throw error;
  }
}

const ANALYSIS_PROMPT = `你是一个电商商品分析专家。请分析用户提供的商品图片（可能包含多张不同角度、细节、规格或口味图），输出以下信息（JSON格式）：

{
  "productName": "商品名称（简短吸引人，适合做主图文案）",
  "category": "商品品类",
  "material": "材质",
  "color": "颜色",
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "factClaims": [{"claim":"事实描述","source":"visible_image|structured_data|analysis_inference","evidence":"图片中可见位置","confidence":"high|medium|low","eligibleForMarketing":true}],
  "description": "一段适合电商详情页的商品描述文案（50-100字）",
  "targetAudience": "目标人群",
  "usageScenarios": ["使用场景1", "使用场景2"],
  "numericClaims": ["商品信息中出现的具体数字承诺，如：3天见效、500g大容量、24小时发货，没有则为空数组"],
  "specs": [
    { "name": "规格/口味/变体名称", "description": "该规格的一句话描述", "highlights": ["亮点1", "亮点2"] }
  ],
  "imageRoles": ["图1角色", "图2角色", "..."]
}

要求：
1. 只输出纯 JSON，不要 markdown 代码块
2. sellingPoints 至少 3 个，最多 5 个
3. 文案要适合中国消费者，用词有吸引力
4. 如果图片展示了多个规格、口味、SKU 变体（如三种口味、多种规格组合），请在 specs 中逐一列出每个规格的名称、描述和亮点，不要只写第一个
5. 如果提供了多张图，请综合分析所有图片，imageRoles 按顺序描述每张图最突出的角色（如：主视角、侧面展示、细节特写、包装展示、使用场景、口味标签等）
6. numericClaims 只提取图片或商品上真实可见的数字信息，禁止编造
7. factClaims 只把图片中明确可见的事实标记为 eligibleForMarketing=true；无法确认的内容使用 analysis_inference 且必须为 false
8. 不要输出绝对化、虚假功效、销量、好评、从众、限时限量或未经证实的认证表达`;

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseAnalyzeRequest(request);
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

    const defaultAnalysisModel = provider.models.find((m) => (m as any).isDefaultAnalysis);
    const hasVision = (m: typeof provider.models[0]) => {
      const caps = m.capabilities as Record<string, unknown>;
      return Boolean(caps?.vision && (caps?.text || caps?.structured_output));
    };

    let selectedModel: typeof provider.models[0] | undefined;
    const hasText = (model: typeof provider.models[0]) => {
      const caps = model.capabilities as Record<string, unknown>;
      return Boolean(caps?.text || caps?.structured_output);
    };

    if (
      defaultAnalysisModel &&
      hasText(defaultAnalysisModel) &&
      isAnalysisModelCandidate(defaultAnalysisModel.modelId)
    ) {
      selectedModel = defaultAnalysisModel;
    } else {
      selectedModel = provider.models.find(
        (model) => hasVision(model) && isAnalysisModelCandidate(model.modelId),
      );
    }

    if (!selectedModel) {
      throw new Error("当前文本 Provider 没有可用的商品视觉分析模型，请在服务配置中选择支持 Vision 的文本模型。");
    }

    const modelId = selectedModel.modelId;
    console.log("[HeroBatchAnalyze] Selected model:", modelId, "| Was default:", selectedModel === defaultAnalysisModel);

    const result = await adapter.generateStructured({
      model: modelId,
      systemPrompt: ANALYSIS_PROMPT,
      userPrompt: `请分析这 ${images.length} 张商品图片，输出 JSON 格式的商品信息。第一张是主要参考，其他图片作为补充信息。`,
      schema: analysisOutputSchema,
      images,
      reasoningEffort: "low",
      maxOutputTokens: 4000,
      timeoutMs: 300000,
      monitor: {
        operation: "standalone_product_analysis",
      },
    });
    const parsedResult = result.parsed;

    const factClaims = Array.isArray(parsedResult.factClaims)
      ? parsedResult.factClaims
          .filter((claim) => claim.eligibleForMarketing && claim.claim.trim())
          .map((claim) => claim.claim.trim())
          .slice(0, 12)
      : [];

    const rawSpecs = Array.isArray(parsedResult.specs)
      ? parsedResult.specs.map((item) => {
          const s = (item ?? {}) as Record<string, unknown>;
          return {
            name: String(s.name ?? ""),
            description: String(s.description ?? ""),
            highlights: Array.isArray(s.highlights) ? s.highlights.map(String).filter(Boolean) : [],
          };
        }).filter((s) => s.name)
      : [];

    return ok({
      productName: String(parsedResult.productName ?? ""),
      category: String(parsedResult.category ?? ""),
      material: String(parsedResult.material ?? ""),
      color: String(parsedResult.color ?? ""),
      sellingPoints: Array.isArray(parsedResult.sellingPoints) ? parsedResult.sellingPoints.map(String) : [],
      description: String(parsedResult.description ?? ""),
      targetAudience: String(parsedResult.targetAudience ?? ""),
      usageScenarios: Array.isArray(parsedResult.usageScenarios) ? parsedResult.usageScenarios.map(String) : [],
      numericClaims: Array.isArray(parsedResult.numericClaims) ? parsedResult.numericClaims.map(String) : [],
      factClaims,
      specs: rawSpecs,
      imageRoles: Array.isArray(parsedResult.imageRoles) ? parsedResult.imageRoles.map(String) : [],
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
