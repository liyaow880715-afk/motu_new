import { NextRequest } from "next/server";
import { z } from "zod";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { getTemplateById } from "@/lib/services/hero-template-service";
import { buildHeroTemplateInstruction } from "@/lib/ai/prompts/hero-template";
import {
  GLOBAL_HERO_IMAGE_CONSTRAINTS,
  HERO_ANGLE_DEFINITIONS,
  buildHeroAngleImageInstruction,
  buildHeroCopyPrompt,
  isDisclaimerHeroCopy,
  resolveHeroAngle,
  selectHeroCopyCandidate,
  type HeroCopyPromptInput,
  type HeroCopyResult,
} from "@/lib/ai/prompts/hero-angles";
import { env } from "@/lib/utils/env";
import { handleRouteError, ok } from "@/lib/utils/route";
import { prisma } from "@/lib/db/prisma";
import {
  resolveAccessKeyStoragePath,
  scopedStorageRelativePath,
} from "@/lib/storage/access-key-storage";
import { readStorageFile } from "@/lib/storage/asset-manager";
import {
  authorizeProjectRequest,
  requireAuthenticatedAccessKeyId,
} from "@/lib/utils/api-auth";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { HeroTemplateStructure } from "@/types/hero-template";

export const maxDuration = 1200;

const HERO_IMAGE_GENERATION_TIMEOUT_MS = 360_000;
const HERO_IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_IMAGE_REFERENCES = 6;

const heroBatchJobSchema = z.object({
  id: z.string().optional(),
  sceneName: z.string().optional(),
  style: z.string().min(1, "请选择风格"),
  aspectRatio: z.string().optional(),
  heroTemplateId: z.string().optional(),
  referenceHeroImage: z.string().optional(),
  angle: z.string().optional(),
  headline: z.string().optional(),
  subline: z.string().optional(),
});

const heroBatchSchema = z.object({
  productName: z.string().optional().default(""),
  productDescription: z.string().optional(),
  factClaims: z.array(z.string()).max(12).optional(),
  targetShopper: z.string().optional(),
  primaryObjection: z.string().optional(),
  singleClaim: z.string().optional(),
  proofDevice: z.string().optional(),
  desiredAction: z.string().optional(),
  platformProfile: z.string().optional(),
  textBudget: z.object({
    headlineMaxChars: z.number().int().min(0).max(40).optional(),
    sublineMaxChars: z.number().int().min(0).max(60).optional(),
  }).optional(),
  productImage: z.string().optional(), // single image fallback
  productImages: z.array(z.string()).optional(), // multiple product images
  style: z.string().optional(), // legacy single style
  aspectRatio: z.string().default("1:1"),
  referenceHeroImage: z.string().optional(), // legacy direct uploaded reference hero image
  heroTemplateId: z.string().optional(), // legacy choose an existing hero template
  jobs: z.array(heroBatchJobSchema).optional(), // new: scene job list
  sourceProjectId: z.string().optional(), // reuse a historical detail-page project
  sourceAssetIds: z.array(z.string()).max(MAX_IMAGE_REFERENCES).optional(), // manually selected historical references
  paletteTokens: z
    .object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
      accent: z.string().optional(),
      background: z.string().optional(),
      surface: z.string().optional(),
      text: z.string().optional(),
    })
    .optional(),
  scoreEnabled: z.boolean().optional().default(false),
});

interface SourceProjectContext {
  productName: string;
  productDescription: string;
  referenceImages: SourceProjectReference[];
  factClaims: string[];
  targetShopper?: string;
  singleClaim?: string;
}

interface SourceProjectReference {
  image: string;
  role: "history-main" | "history-packaging" | "history-supporting";
  instruction: string;
}

interface ProductReference {
  image: string;
  role: SourceProjectReference["role"] | "supplementary";
  instruction: string;
}

/**
 * 复用历史详情页项目：商品名称/描述（来自分析结果）+ 上传过的参考图。
 */
async function loadSourceProjectContext(projectId: string, selectedAssetIds?: string[]): Promise<SourceProjectContext> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assets: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      analysis: true,
    },
  });
  if (!project) {
    throw new Error("历史项目不存在");
  }

  const eligibleAssets = project.assets.filter((asset) => ["MAIN", "ANGLE", "DETAIL", "PACKAGING"].includes(asset.type));
  const manuallySelected = selectedAssetIds?.length
    ? selectedAssetIds
        .map((id) => eligibleAssets.find((asset) => asset.id === id))
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
    : [];
  const identityAssets = eligibleAssets.filter((asset) => ["MAIN", "ANGLE", "DETAIL"].includes(asset.type));
  const primaryAsset = identityAssets.find((asset) => asset.isMain)
    ?? identityAssets.find((asset) => asset.type === "MAIN")
    ?? identityAssets[0];
  const packagingAssets = project.assets.filter((asset) => asset.type === "PACKAGING");
  const supportingAssets = identityAssets.filter((asset) => asset.id !== primaryAsset?.id);
  const chosen = (manuallySelected.length > 0
    ? manuallySelected
    : [primaryAsset, ...packagingAssets.slice(0, 2), ...supportingAssets]
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)))
    .filter((asset, index, assets) => assets.findIndex((candidate) => candidate.id === asset.id) === index)
    .slice(0, MAX_IMAGE_REFERENCES);

  const referenceImages: SourceProjectReference[] = [];
  for (const asset of chosen) {
    try {
      const buffer = await readStorageFile(asset.filePath);
      const role = asset.id === primaryAsset?.id || (manuallySelected.length > 0 && asset.isMain)
        ? "history-main"
        : asset.type === "PACKAGING"
          ? "history-packaging"
          : "history-supporting";
      referenceImages.push({
        image: `data:${asset.mimeType ?? "image/png"};base64,${buffer.toString("base64")}`,
        role,
        instruction:
          role === "history-main"
            ? "历史项目主商品图：锁定商品身份、主体造型、颜色和材质，优先级最高。"
            : role === "history-packaging"
              ? "历史项目包装图：严格参考包装结构、主色、Logo、标签和可见文字位置。"
              : "历史项目角度/细节图：用于补充商品侧面、细节和真实结构。",
      });
    } catch (error) {
      console.error("[HeroBatch] Failed to load source project asset:", asset.filePath, error);
    }
  }

  let productDescription = "";
  let factClaims: string[] = [];
  let targetShopper: string | undefined;
  let singleClaim: string | undefined;
  const analysis = (project.analysis?.normalizedResult ?? null) as Record<string, unknown> | null;
  if (analysis) {
    targetShopper = typeof analysis.targetAudience === "string" ? analysis.targetAudience : undefined;
    factClaims = Array.isArray(analysis.factClaims)
      ? analysis.factClaims.map((claim) => {
          if (typeof claim === "string") return claim;
          if (claim && typeof claim === "object" && typeof (claim as Record<string, unknown>).claim === "string") {
            return String((claim as Record<string, unknown>).claim);
          }
          return "";
        }).filter(Boolean).slice(0, 12)
      : [];
    singleClaim = Array.isArray(analysis.sellingPoints) && typeof analysis.sellingPoints[0] === "string"
      ? analysis.sellingPoints[0]
      : undefined;
    const parts = [
      analysis.category ? `品类：${analysis.category}` : "",
      analysis.material ? `材质：${analysis.material}` : "",
      analysis.color ? `颜色：${analysis.color}` : "",
      analysis.targetAudience ? `目标人群：${analysis.targetAudience}` : "",
      Array.isArray(analysis.sellingPoints) && analysis.sellingPoints.length
        ? `卖点：${(analysis.sellingPoints as unknown[]).join("、")}`
        : "",
      Array.isArray(analysis.numericClaims) && analysis.numericClaims.length
        ? `数字信息：${(analysis.numericClaims as unknown[]).join("、")}`
        : "",
      typeof analysis.description === "string" ? analysis.description : "",
      Array.isArray(analysis.usageScenarios) && analysis.usageScenarios.length
        ? `适用场景：${(analysis.usageScenarios as unknown[]).join("、")}`
        : "",
    ].filter(Boolean);
    productDescription = parts.join("\n");
  }

  return { productName: project.name, productDescription, referenceImages, factClaims, targetShopper, singleClaim };
}

function buildPaletteInstruction(paletteTokens?: {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  surface?: string;
  text?: string;
} | null): string {
  if (!paletteTokens) return "";
  const parts = [
    paletteTokens.background ? `背景色 ${paletteTokens.background}` : "",
    paletteTokens.primary ? `主色 ${paletteTokens.primary}` : "",
    paletteTokens.secondary ? `辅助色 ${paletteTokens.secondary}` : "",
    paletteTokens.accent ? `强调色 ${paletteTokens.accent}` : "",
    paletteTokens.text ? `文字色 ${paletteTokens.text}` : "",
  ].filter(Boolean);
  if (!parts.length) return "";
  return `\n【配色约束】画面整体配色遵循项目色板：${parts.join("，")}。背景、装饰和文字颜色以这些色值为主，不要引入与色板冲突的大面积撞色。`;
}

const sizeMap: Record<string, string> = {
  "1:1": "1024x1024",
  "3:4": "768x1024",
  "4:3": "1024x768",
  "16:9": "1024x576",
};

function resolveAspectRatio(job: z.infer<typeof heroBatchJobSchema> | null, globalAspectRatio: string) {
  return job?.aspectRatio ?? globalAspectRatio ?? "1:1";
}

function buildReferenceInstruction(productReferences: ProductReference[], heroReferenceImage?: string | null) {
  const lines: string[] = [];
  lines.push("");
  lines.push("【参考图使用说明】");

  if (productReferences.length > 0) {
    lines.push(`本次共提供 ${productReferences.length} 张商品参考图，必须按以下用途使用：`);
    productReferences.forEach((reference, index) => {
      lines.push(`- 第${index + 1}张图：${reference.instruction}`);
    });
    lines.push("商品参考图的身份约束高于场景风格。不得用场景中的同类商品替换原商品，不得擅自更换包装、Logo、标签、颜色、材质或核心造型。");
  }

  if (productReferences.some((reference) => reference.role === "history-packaging")) {
    lines.push("PACKAGING LOCK (highest priority): treat the packaging reference as an immutable photographed object. Preserve its exact silhouette, front-panel geometry, dominant color blocks, logo placement, label hierarchy, and all clearly readable text. Do not redraw, rewrite, translate, autocomplete, date-stamp, beautify, duplicate, or warp the package. Never invent dates, ingredients, nutrition facts, barcodes, certifications, or claims. If the package text cannot be rendered reliably, keep the package front-facing and visually faithful instead of replacing it with new text.");
  }
  if (productReferences.length > 0) {
    lines.push("CROSS-SECTION LOCK: when a supplied reference shows an opened or cut dumpling, match that exact wrapper thickness, filling color, ingredient mix, moisture, and cut geometry. Do not add green vegetables, meat, sauce, or a different filling that is absent from the reference. If the cross-section cannot be preserved faithfully, show the dumpling whole rather than inventing a new cross-section.");
  }

  if (heroReferenceImage) {
    lines.push("");
    lines.push("最后还提供了一张「参考主图」，它代表你想要的版式、配色、排版、光照和整体视觉风格。请严格模仿其视觉规范，仅替换其中的商品和文案。");
  }

  return lines.join("\n");
}

async function buildPrompt(
  parsed: z.infer<typeof heroBatchSchema>,
  job: z.infer<typeof heroBatchJobSchema> | null,
  projectReferences: SourceProjectReference[] = [],
  accessKeyId: string | null = null,
) {
  const aspectRatio = resolveAspectRatio(job, parsed.aspectRatio);
  const size = sizeMap[aspectRatio] ?? "1024x1024";
  const aspectInstruction = aspectRatio
    ? `图片必须严格保持 ${aspectRatio} 的宽高比例。`
    : `图片尺寸必须严格为 ${size} 像素。`;

  // Resolve hero template / reference hero image for this job
  let heroTemplateStructure: HeroTemplateStructure | null = null;
  let heroReferenceImage: string | null = null;

  const effectiveHeroTemplateId = job?.heroTemplateId ?? parsed.heroTemplateId;
  const effectiveReferenceHeroImage = job?.referenceHeroImage ?? parsed.referenceHeroImage;

  if (effectiveHeroTemplateId) {
    const template = await getTemplateById(effectiveHeroTemplateId);
    if (!template) {
      throw new Error("主图模板不存在");
    }
    heroTemplateStructure = template.structureJson as unknown as HeroTemplateStructure;
    heroReferenceImage = template.referenceImageUrl;

    // Apply job-level layout overrides if provided
    if (job?.referenceHeroImage) {
      heroReferenceImage = job.referenceHeroImage;
    }
  } else if (effectiveReferenceHeroImage?.startsWith("data:")) {
    heroReferenceImage = effectiveReferenceHeroImage;
  }

  // Save uploaded reference hero image to storage so it can be reused across requests
  if (heroReferenceImage?.startsWith("data:")) {
    const refStorageDir = join(
      env.STORAGE_ROOT ?? "./storage",
      scopedStorageRelativePath("hero-batch", accessKeyId, "references"),
    );
    if (!existsSync(refStorageDir)) mkdirSync(refStorageDir, { recursive: true });
    const match = heroReferenceImage.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (match) {
      const ext = match[1] === "jpeg" ? "jpg" : match[1];
      const refFileName = `hero-ref-${Date.now()}.${ext}`;
      writeFileSync(join(refStorageDir, refFileName), Buffer.from(match[2], "base64"));
      heroReferenceImage = `/api/files/hero-batch/references/${refFileName}`;
    }
  }

  const styleInstruction = job?.style ?? parsed.style ?? "电商主图风格";
  let fullStyleInstruction = styleInstruction;
  if (heroTemplateStructure) {
    fullStyleInstruction = `${styleInstruction}。\n\n${buildHeroTemplateInstruction(heroTemplateStructure)}`;
  }

  const clientProductImages = parsed.productImages?.filter((img) => img.startsWith("data:"))
    ?? (parsed.productImage?.startsWith("data:") ? [parsed.productImage] : []);
  const supplementaryReferences: ProductReference[] = clientProductImages.map((image) => ({
    image,
    role: "supplementary",
    instruction: "用户补充的商品/包装参考图：用于锁定包装外观、Logo、标签、配色和商品细节。",
  }));
  const primaryReference = projectReferences.find((reference) => reference.role === "history-main");
  const packagingReferences = projectReferences.filter((reference) => reference.role === "history-packaging");
  const supportingReferences = projectReferences.filter((reference) => reference.role === "history-supporting");
  const maxProductReferences = Math.max(1, MAX_IMAGE_REFERENCES - (heroReferenceImage ? 1 : 0));
  const orderedReferences: ProductReference[] = [
    ...(primaryReference ? [primaryReference] : []),
    ...supplementaryReferences.slice(0, 3),
    ...packagingReferences.slice(0, 1),
    ...supportingReferences,
    ...supplementaryReferences.slice(3),
    ...packagingReferences.slice(1),
  ];
  const productReferences = orderedReferences
    .filter((reference, index, references) => references.findIndex((candidate) => candidate.image === reference.image) === index)
    .slice(0, maxProductReferences);
  const referenceInstruction = buildReferenceInstruction(productReferences, heroReferenceImage);

  const commerceBriefInstruction = [
    "=== 商业简报（必须遵守）===",
    `商品身份：${parsed.productName}`,
    `商品事实：${parsed.productDescription ?? "仅使用参考图可确认的事实"}`,
    `事实白名单：${parsed.factClaims?.join("；") || "仅使用输入描述与参考图可确认内容"}`,
    `平台/场景：${parsed.platformProfile || "电商移动端主图"}`,
    `目标人群：${parsed.targetShopper || "以商品事实能确认的人群为准"}`,
    `单一购买阻力：${parsed.primaryObjection || "不确定商品是否适合自己"}`,
    `一个事实卖点：${parsed.singleClaim || "只突出一个可验证卖点"}`,
    `视觉证明：${parsed.proofDevice || "用商品本体、包装细节或真实使用场景证明"}`,
    `期望动作：${parsed.desiredAction || "点击查看详情"}`,
    `文案预算：主标题不超过 ${parsed.textBudget?.headlineMaxChars ?? 12} 字，副文案不超过 ${parsed.textBudget?.sublineMaxChars ?? 16} 字。`,
    "禁止：虚构销量、好评、限时限量、包邮、买赠、认证、功效或规格；不得生成不可验证的条码、营养表和许可证文字。",
    "参考图优先级：商品身份与包装结构 > 历史主图构图 > 历史辅助细节 > 场景风格。",
  ].join("\n");

  // Resolve selling-point angle + copy for this job.
  const angle = resolveHeroAngle(job?.angle, 0);
  let copy: HeroCopyResult | null = null;
  try {
    copy = await generateHeroCopy({
      productName: parsed.productName,
      productDescription: parsed.productDescription ?? "",
      angle,
      sceneName: job?.sceneName,
      sceneStyle: job?.style,
      factClaims: parsed.factClaims,
      singleClaim: parsed.singleClaim,
      headlineMaxChars: parsed.textBudget?.headlineMaxChars,
      sublineMaxChars: parsed.textBudget?.sublineMaxChars,
    });
  } catch (error) {
    console.error("[HeroBatch] copy generation failed, fallback to angle instruction only:", error);
  }
  const manualHeadline = job?.headline?.trim() ?? "";
  const manualSubline = job?.subline?.trim() ?? "";
  const manualComplianceNote = [manualHeadline, manualSubline]
    .find((value) => isDisclaimerHeroCopy(value)) ?? "";
  if (!copy && manualHeadline && !isDisclaimerHeroCopy(manualHeadline)) {
    copy = {
      angle,
      headline: manualHeadline,
      subline: manualSubline && !isDisclaimerHeroCopy(manualSubline) && manualSubline !== manualHeadline
        ? manualSubline
        : "",
      complianceNote: manualComplianceNote,
      sceneDirective: "",
      emphasis: "",
      lineBreakAfter: "",
      productSpecificityScore: 0,
      conversionScore: 0,
      factGroundingScore: 0,
      thumbnailReadabilityScore: 0,
      evidenceKey: "",
    };
  } else if (copy && (manualHeadline || manualSubline)) {
    const headline = manualHeadline && !isDisclaimerHeroCopy(manualHeadline) ? manualHeadline : copy.headline;
    const subline = manualSubline && !isDisclaimerHeroCopy(manualSubline) ? manualSubline : copy.subline;
    copy = {
      ...copy,
      headline,
      subline: subline === headline ? "" : subline,
      complianceNote: manualComplianceNote || copy.complianceNote,
      emphasis: headline.includes(copy.emphasis) ? copy.emphasis : "",
      lineBreakAfter: headline.includes(copy.lineBreakAfter) ? copy.lineBreakAfter : "",
    };
  }

  const angleInstruction = copy
    ? buildHeroAngleImageInstruction(copy)
    : `【卖点策略】${HERO_ANGLE_DEFINITIONS[angle].label}：${HERO_ANGLE_DEFINITIONS[angle].copyInstruction}\n${GLOBAL_HERO_IMAGE_CONSTRAINTS}`;

  const prompt = `电商主图，商品：${parsed.productName}。${parsed.productDescription ?? ""}。${fullStyleInstruction}。${aspectInstruction}高质量商品摄影，适合电商平台头图展示。${buildPaletteInstruction(parsed.paletteTokens)}\n${angleInstruction}\n${referenceInstruction}`;

  return { prompt: `${commerceBriefInstruction}\n${prompt}`, size, aspectRatio, heroReferenceImage, productReferences, angle, copy };
}

async function generateHeroCopy(input: HeroCopyPromptInput): Promise<HeroCopyResult | null> {
  const { provider, adapter } = await getProviderAdapter("text");
  const model = provider.models.find((m) => (m as { isDefaultAnalysis?: boolean }).isDefaultAnalysis)?.modelId
    ?? provider.models[0]?.modelId
    ?? "";
  const { systemPrompt, userPrompt } = buildHeroCopyPrompt(input);
  const result = await adapter.generateText({
    model,
    systemPrompt,
    userPrompt,
    timeoutMs: 60000,
  });

  let parsedResult: Record<string, unknown>;
  try {
    const cleaned = result.text.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
    parsedResult = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    parsedResult = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  }

  return selectHeroCopyCandidate(parsedResult, input);
}

interface HeroQcResult {
  status: "passed" | "failed" | "unscored";
  score: number | null;
  issues: string[];
}

/**
 * 视觉质检打分（0-100）：商品/包装一致性、事实合规、OCR、缩略图识别和平台适配。
 * 视觉模型不可用或返回异常时明确标记为未评分，不伪造通过分数。
 */
async function qcHeroImage(
  imageBuffer: Buffer,
  productName: string,
  headline?: string,
  context?: { productDescription?: string; referenceRoles?: string[]; referenceImages?: string[] },
): Promise<HeroQcResult> {
  try {
    const { provider, adapter } = await getProviderAdapter("text");
    const hasVision = (m: (typeof provider.models)[number]) => {
      const caps = m.capabilities as Record<string, unknown>;
      return Boolean(caps?.vision && (caps?.text || caps?.structured_output));
    };
    const defaultAnalysisModel = provider.models.find((m) => (m as { isDefaultAnalysis?: boolean }).isDefaultAnalysis);
    const selectedModel = defaultAnalysisModel && hasVision(defaultAnalysisModel)
      ? defaultAnalysisModel
      : provider.models.find(hasVision);
    if (!selectedModel) return { status: "unscored", score: null, issues: ["未找到可用的视觉模型"] };

    const systemPrompt = [
      "Packaging and opened-product fidelity are hard gates. If a packaging reference is supplied, any obvious package deformation, rewritten logo/label/text, fabricated date, nutrition, certification, or claim is a failure even when the composition is attractive.",
      "If a reference shows a dumpling cross-section, compare filling color, ingredients, wrapper thickness, moisture, and cut geometry directly against it. A materially different filling or invented cross-section is a failure; if no cross-section reference exists, do not penalize a whole dumpling.",
      "你是电商主图质检员。请检查这张主图并打分，只输出纯 JSON：",
      '{ "score": 0-100的整数, "pass": true/false, "issues": ["问题1", "问题2"] }',
      "打分维度（总分100）：",
      "1. 产品主体占画面约70%-80%，居中突出，缩略图能一眼认出产品（30分）。",
      "2. 文字占比不超过20%，只出现在边角，不遮挡产品；中文文案无乱码、无错别字（20分）。",
      "3. 全图只表达1个核心卖点，没有牛皮癣式标签堆砌（20分）。",
      "4. 背景简洁（纯色或极简），不杂乱、不高饱和撞色、不抢镜（15分）。",
      "5. 产品与参考商品一致，没有明显货不对板的过度美化（15分）。",
      "score≥80且无严重问题判 pass=true；issues 里用简短中文列出扣分原因，没有则为空数组。",
    ].join("\n");

    const userPrompt = headline
      ? `商品：${productName}。主文案应为「${headline}」。请质检这张图。`
      : `商品：${productName}。请质检这张图。`;

    const enrichedUserPrompt = [
      userPrompt,
      `商品事实：${context?.productDescription ?? "未提供"}`,
      `参考图角色：${context?.referenceRoles?.join(", ") ?? "未提供"}`,
      "附件图片顺序：第1张是待评分生成图，后续图片是对应商品参考图。",
      "检查商品一致性、包装一致性、事实合规、OCR可读性、缩略图识别和平台适配。",
    ].join("\n");

    const result = await adapter.generateText({
      model: selectedModel.modelId,
      systemPrompt,
      userPrompt: enrichedUserPrompt,
      images: [`data:image/png;base64,${imageBuffer.toString("base64")}`, ...(context?.referenceImages ?? [])],
      timeoutMs: 60000,
    });

    let parsedResult: Record<string, unknown>;
    try {
      const cleaned = result.text.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
      parsedResult = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { status: "unscored", score: null, issues: ["视觉模型未返回可解析 JSON"] };
      parsedResult = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    }

    const issues = Array.isArray(parsedResult.issues) ? parsedResult.issues.map(String).filter(Boolean) : [];
    const rawScore = Number(parsedResult.score);
    if (!Number.isFinite(rawScore)) return { status: "unscored", score: null, issues: ["视觉模型未返回有效分数", ...issues] };
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    const pass = parsedResult.pass === true && score >= 80;
    return { status: pass ? "passed" : "failed", score, issues };
  } catch (error) {
    console.error("[HeroBatch] QC unavailable:", error);
    return { status: "unscored", score: null, issues: ["质检请求异常，未评分"] };
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const parsed = heroBatchSchema.parse(await request.json());
    const { provider, adapter } = await getProviderAdapter("image");

    // Prefer the model explicitly marked as default for hero images, then any image_gen model.
    const runtimeModel = provider.models.find((m) => (m as { isDefaultHeroImage?: boolean }).isDefaultHeroImage)
      ?? provider.models.find((m) => {
        const caps = m.capabilities as Record<string, unknown>;
        return caps?.image_gen && caps?.real_image_gen !== false;
      })
      ?? provider.models[0];
    const model = runtimeModel?.modelId ?? "";

    // Legacy mode: build a single job from top-level fields
    const jobs: Array<z.infer<typeof heroBatchJobSchema>> = parsed.jobs?.length
      ? parsed.jobs
      : parsed.style
        ? [{ style: parsed.style, aspectRatio: parsed.aspectRatio, heroTemplateId: parsed.heroTemplateId, referenceHeroImage: parsed.referenceHeroImage }]
        : [];

    if (jobs.length === 0) {
      throw new Error("请至少选择一个场景或风格");
    }

    // Reuse a historical detail-page project: assets + product info.
    const projectReferenceImages: SourceProjectReference[] = [];
    if (parsed.sourceProjectId) {
      const denied = await authorizeProjectRequest(request, parsed.sourceProjectId);
      if (denied) return denied;
      const source = await loadSourceProjectContext(parsed.sourceProjectId, parsed.sourceAssetIds);
      projectReferenceImages.push(...source.referenceImages);
      if (!parsed.productName.trim()) {
        parsed.productName = source.productName;
      }
      if (!(parsed.productDescription ?? "").trim()) {
        parsed.productDescription = source.productDescription;
      }
      if (!parsed.factClaims?.length && source.factClaims.length) parsed.factClaims = source.factClaims;
      if (!parsed.targetShopper && source.targetShopper) parsed.targetShopper = source.targetShopper;
      if (!parsed.singleClaim && source.singleClaim) parsed.singleClaim = source.singleClaim;
    }
    if (!parsed.productName.trim()) {
      throw new Error("请输入商品名称，或选择一个历史项目");
    }

    // For now, the API generates one image per request. The caller (frontend) can call multiple times for each job.
    const job = jobs[0];
    const { prompt, size, aspectRatio, heroReferenceImage, productReferences, angle, copy } = await buildPrompt(
      parsed,
      job,
      projectReferenceImages,
      auth.accessKeyId,
    );

    // Reference images (support both single and multiple)
    const referenceImages: string[] = productReferences.map((reference) => reference.image);
    const referenceRoles: Array<ProductReference["role"] | "hero-layout"> = productReferences.map(
      (reference) => reference.role,
    );

    // Append hero reference image as layout/style anchor (must be data URL or public URL that provider can fetch)
    if (heroReferenceImage) {
      if (heroReferenceImage.startsWith("data:")) {
        referenceImages.push(heroReferenceImage);
        referenceRoles.push("hero-layout");
      } else if (heroReferenceImage.startsWith("/api/files/")) {
        // Convert local file URL to data URL for provider compatibility
        const filePathMatch = heroReferenceImage.match(/\/api\/files\/(.*)$/);
        if (filePathMatch) {
          try {
            const { readStorageFile } = await import("@/lib/storage/asset-manager");
            const storagePath = resolveAccessKeyStoragePath(filePathMatch[1], auth.accessKeyId);
            const buffer = await readStorageFile(storagePath);
            const mimeType = filePathMatch[1].endsWith(".jpg") || filePathMatch[1].endsWith(".jpeg") ? "image/jpeg" : "image/png";
            referenceImages.push(`data:${mimeType};base64,${buffer.toString("base64")}`);
            referenceRoles.push("hero-layout");
          } catch (error) {
            console.error("[HeroBatch] Failed to load reference hero image:", error);
          }
        }
      }
    }

    const runImageGeneration = async (promptText: string): Promise<Buffer> => {
      const fidelityBase =
        productReferences.find((reference) => reference.role === "history-packaging")
        ?? productReferences.find((reference) => reference.role === "history-main");
      let result;
      if (fidelityBase) {
        const editReferences = referenceImages.filter((reference) => reference !== fidelityBase.image);
        try {
          // Use an AI edit with the most identity-sensitive reference as the base image.
          // This preserves packaging/cross-section structure better than treating every image as a loose hint.
          result = await adapter.editImage({
            model,
            prompt: promptText,
            image: fidelityBase.image,
            size,
            aspectRatio: aspectRatio as "1:1" | "3:4" | "4:3" | "16:9" | "9:16",
            referenceImages: editReferences,
            timeoutMs: HERO_IMAGE_GENERATION_TIMEOUT_MS,
          });
        } catch (error) {
          console.warn("[HeroBatch] Reference-preserving edit failed; falling back to reference-guided generation:", error);
          result = await adapter.generateImage({
            model,
            prompt: promptText,
            size,
            aspectRatio: aspectRatio as "1:1" | "3:4" | "4:3" | "16:9" | "9:16",
            referenceImages,
            timeoutMs: HERO_IMAGE_GENERATION_TIMEOUT_MS,
          });
        }
      } else {
        result = await adapter.generateImage({
          model,
          prompt: promptText,
          size,
          aspectRatio: aspectRatio as "1:1" | "3:4" | "4:3" | "16:9" | "9:16",
          referenceImages,
          timeoutMs: HERO_IMAGE_GENERATION_TIMEOUT_MS,
        });
      }

      if (result.url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HERO_IMAGE_DOWNLOAD_TIMEOUT_MS);
        try {
          const res = await fetch(result.url, { signal: controller.signal });
          if (!res.ok) {
            throw new Error(`下载图片失败: ${res.status}`);
          }
          return Buffer.from(await res.arrayBuffer());
        } finally {
          clearTimeout(timeout);
        }
      }
      if (result.b64Json) {
        return Buffer.from(result.b64Json, "base64");
      }
      throw new Error("图片生成返回为空");
    };

    let imageBuffer = await runImageGeneration(prompt);

    // 打分质检（可开关）：低分带修正意见重生一次，保留更高分版本
    let qcRetried = false;
    let score: number | null = null;
    let qcStatus: HeroQcResult["status"] = "unscored";
    if (parsed.scoreEnabled) {
      const first = await qcHeroImage(imageBuffer, parsed.productName, copy?.headline, {
        productDescription: parsed.productDescription,
        referenceRoles,
        referenceImages: productReferences.map((reference) => reference.image),
      });
      qcStatus = first.status;
      score = first.score;
      if (first.status === "failed") {
        qcRetried = true;
        const reason = first.issues.length > 0 ? first.issues.join("；") : `总分仅 ${first.score} 分`;
        const retryPrompt = `${prompt}\n【上一版质检未通过，必须修正以下问题】${reason}。修正时仍需满足全部硬性规则。`;
        const retryBuffer = await runImageGeneration(retryPrompt);
        const second = await qcHeroImage(retryBuffer, parsed.productName, copy?.headline, {
          productDescription: parsed.productDescription,
          referenceRoles,
          referenceImages: productReferences.map((reference) => reference.image),
        });
        if (second.status !== "unscored" && (first.score === null || (second.score ?? 0) >= first.score)) {
          imageBuffer = retryBuffer;
          score = second.score;
          qcStatus = second.status;
        }
      }
    }

    // Save image
    const storageDir = join(
      env.STORAGE_ROOT ?? "./storage",
      scopedStorageRelativePath("hero-batch", auth.accessKeyId),
    );
    if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });
    const fileName = `hero-batch-${Date.now()}.png`;
    writeFileSync(join(storageDir, fileName), imageBuffer);
    const imageUrl = `/api/files/hero-batch/${fileName}`;

    return ok({
      imageUrl,
      model,
      sceneName: job.sceneName,
      style: job.style,
      angle,
      headline: copy?.headline ?? "",
      subline: copy?.subline ?? "",
      complianceNote: copy?.complianceNote ?? "",
      qcRetried,
      qcStatus,
      score,
      referenceImageCount: referenceImages.length,
      referenceRoles,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
