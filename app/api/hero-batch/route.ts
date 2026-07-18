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
  resolveHeroAngle,
  type HeroAngle,
  type HeroCopyResult,
} from "@/lib/ai/prompts/hero-angles";
import { env } from "@/lib/utils/env";
import { handleRouteError, ok } from "@/lib/utils/route";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { HeroTemplateStructure } from "@/types/hero-template";

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
  productName: z.string().min(1, "请输入商品名称"),
  productDescription: z.string().optional(),
  productImage: z.string().optional(), // single image fallback
  productImages: z.array(z.string()).optional(), // multiple product images
  style: z.string().optional(), // legacy single style
  aspectRatio: z.string().default("1:1"),
  referenceHeroImage: z.string().optional(), // legacy direct uploaded reference hero image
  heroTemplateId: z.string().optional(), // legacy choose an existing hero template
  jobs: z.array(heroBatchJobSchema).optional(), // new: scene job list
});

const sizeMap: Record<string, string> = {
  "1:1": "1024x1024",
  "3:4": "768x1024",
  "4:3": "1024x768",
  "16:9": "1024x576",
};

function resolveAspectRatio(job: z.infer<typeof heroBatchJobSchema> | null, globalAspectRatio: string) {
  return job?.aspectRatio ?? globalAspectRatio ?? "1:1";
}

function buildReferenceInstruction(productImages: string[], heroReferenceImage?: string | null) {
  const lines: string[] = [];
  lines.push("");
  lines.push("【参考图使用说明】");

  if (productImages.length === 1) {
    lines.push("提供的第1张图是商品主视角参考图，请基于该商品进行创作。");
  } else if (productImages.length > 1) {
    lines.push(`本次共提供 ${productImages.length} 张商品参考图，请综合理解商品外观：`);
    lines.push(`- 第1张图：商品主视角，作为生成时的主要商品形象参考。`);
    for (let i = 1; i < productImages.length; i++) {
      lines.push(`- 第${i + 1}张图：商品角度/细节/场景补充参考，用于更准确还原商品形态。`);
    }
    lines.push("生成时请保持商品主体与这些参考图一致，不要改变商品品类、颜色、材质和核心造型。");
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
    const refStorageDir = join(env.STORAGE_ROOT ?? "./storage", "hero-batch", "templates");
    if (!existsSync(refStorageDir)) mkdirSync(refStorageDir, { recursive: true });
    const match = heroReferenceImage.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (match) {
      const ext = match[1] === "jpeg" ? "jpg" : match[1];
      const refFileName = `hero-ref-${Date.now()}.${ext}`;
      writeFileSync(join(refStorageDir, refFileName), Buffer.from(match[2], "base64"));
      heroReferenceImage = `/api/files/hero-batch/templates/${refFileName}`;
    }
  }

  const styleInstruction = job?.style ?? parsed.style ?? "电商主图风格";
  let fullStyleInstruction = styleInstruction;
  if (heroTemplateStructure) {
    fullStyleInstruction = `${styleInstruction}。\n\n${buildHeroTemplateInstruction(heroTemplateStructure)}`;
  }

  const productImages = parsed.productImages?.filter((img) => img.startsWith("data:"))
    ?? (parsed.productImage?.startsWith("data:") ? [parsed.productImage] : []);

  const referenceInstruction = buildReferenceInstruction(productImages, heroReferenceImage);

  // Resolve selling-point angle + copy for this job.
  const angle = resolveHeroAngle(job?.angle, 0);
  let copy: HeroCopyResult | null = null;
  try {
    copy = await generateHeroCopy(parsed.productName, parsed.productDescription ?? "", angle);
  } catch (error) {
    console.error("[HeroBatch] copy generation failed, fallback to angle instruction only:", error);
  }
  if (copy && (job?.headline || job?.subline)) {
    copy = { ...copy, headline: job?.headline ?? copy.headline, subline: job?.subline ?? copy.subline };
  }

  const angleInstruction = copy
    ? buildHeroAngleImageInstruction(copy)
    : `【卖点策略】${HERO_ANGLE_DEFINITIONS[angle].label}：${HERO_ANGLE_DEFINITIONS[angle].copyInstruction}\n${GLOBAL_HERO_IMAGE_CONSTRAINTS}`;

  const prompt = `电商主图，商品：${parsed.productName}。${parsed.productDescription ?? ""}。${fullStyleInstruction}。${aspectInstruction}高质量商品摄影，适合电商平台头图展示。\n${angleInstruction}\n${referenceInstruction}`;

  return { prompt, size, aspectRatio, heroReferenceImage, productImages, angle, copy };
}

async function generateHeroCopy(productName: string, productDescription: string, angle: HeroAngle): Promise<HeroCopyResult | null> {
  const { provider, adapter } = await getProviderAdapter("text");
  const model = provider.models.find((m) => (m as { isDefaultAnalysis?: boolean }).isDefaultAnalysis)?.modelId
    ?? provider.models[0]?.modelId
    ?? "";
  const { systemPrompt, userPrompt } = buildHeroCopyPrompt({ productName, productDescription, angle });
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

  return {
    angle,
    headline: String(parsedResult.headline ?? "").trim(),
    subline: String(parsedResult.subline ?? "").trim(),
    sceneDirective: String(parsedResult.sceneDirective ?? "").trim(),
  };
}

export async function POST(request: NextRequest) {
  try {
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

    // For now, the API generates one image per request. The caller (frontend) can call multiple times for each job.
    const job = jobs[0];
    const { prompt, size, aspectRatio, heroReferenceImage, productImages, angle, copy } = await buildPrompt(parsed, job);

    // Reference images (support both single and multiple)
    const referenceImages: string[] = [...productImages];

    // Append hero reference image as layout/style anchor (must be data URL or public URL that provider can fetch)
    if (heroReferenceImage) {
      if (heroReferenceImage.startsWith("data:")) {
        referenceImages.push(heroReferenceImage);
      } else if (heroReferenceImage.startsWith("/api/files/")) {
        // Convert local file URL to data URL for provider compatibility
        const filePathMatch = heroReferenceImage.match(/\/api\/files\/(.*)$/);
        if (filePathMatch) {
          try {
            const { readStorageFile } = await import("@/lib/storage/asset-manager");
            const buffer = await readStorageFile(filePathMatch[1]);
            const mimeType = filePathMatch[1].endsWith(".jpg") || filePathMatch[1].endsWith(".jpeg") ? "image/jpeg" : "image/png";
            referenceImages.push(`data:${mimeType};base64,${buffer.toString("base64")}`);
          } catch (error) {
            console.error("[HeroBatch] Failed to load reference hero image:", error);
          }
        }
      }
    }

    const result = await adapter.generateImage({
      model,
      prompt,
      size,
      aspectRatio: aspectRatio as "1:1" | "3:4" | "4:3" | "16:9" | "9:16",
      referenceImages,
      timeoutMs: 120000,
    });

    // Save image
    let imageUrl: string;
    const storageDir = join(env.STORAGE_ROOT ?? "./storage", "hero-batch");
    if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });

    if (result.url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch(result.url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
          throw new Error(`下载图片失败: ${res.status}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const fileName = `hero-batch-${Date.now()}.png`;
        const filePath = join(storageDir, fileName);
        writeFileSync(filePath, buffer);
        imageUrl = `/api/files/hero-batch/${fileName}`;
      } catch (error) {
        clearTimeout(timeout);
        throw error;
      }
    } else if (result.b64Json) {
      const buffer = Buffer.from(result.b64Json, "base64");
      const fileName = `hero-batch-${Date.now()}.png`;
      const filePath = join(storageDir, fileName);
      writeFileSync(filePath, buffer);
      imageUrl = `/api/files/hero-batch/${fileName}`;
    } else {
      throw new Error("图片生成返回为空");
    }

    return ok({ imageUrl, model, sceneName: job.sceneName, style: job.style, angle, headline: copy?.headline ?? "", subline: copy?.subline ?? "" });
  } catch (error) {
    return handleRouteError(error);
  }
}
