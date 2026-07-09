import { NextRequest } from "next/server";
import { z } from "zod";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { getTemplateById } from "@/lib/services/hero-template-service";
import { buildHeroTemplateInstruction } from "@/lib/ai/prompts/hero-template";
import { env } from "@/lib/utils/env";
import { handleRouteError, ok } from "@/lib/utils/route";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const heroBatchSchema = z.object({
  productName: z.string().min(1, "请输入商品名称"),
  productDescription: z.string().optional(),
  productImage: z.string().optional(), // single image fallback
  productImages: z.array(z.string()).optional(), // multiple product images
  style: z.string().min(1, "请选择风格"),
  aspectRatio: z.string().default("1:1"),
  referenceHeroImage: z.string().optional(), // direct uploaded reference hero image
  heroTemplateId: z.string().optional(), // or choose an existing hero template
});

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

    // Parse size from aspect ratio
    const sizeMap: Record<string, string> = {
      "1:1": "1024x1024",
      "3:4": "768x1024",
      "4:3": "1024x768",
      "16:9": "1024x576",
    };
    const size = sizeMap[parsed.aspectRatio] ?? "1024x1024";

    // Resolve hero template / reference hero image
    let heroTemplateStructure = null;
    let heroReferenceImage: string | null = null;

    if (parsed.heroTemplateId) {
      const template = await getTemplateById(parsed.heroTemplateId);
      if (!template) {
        throw new Error("主图模板不存在");
      }
      heroTemplateStructure = template.structureJson as Record<string, unknown>;
      heroReferenceImage = template.referenceImageUrl;
    } else if (parsed.referenceHeroImage?.startsWith("data:")) {
      heroReferenceImage = parsed.referenceHeroImage;
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

    // Build prompt with explicit size/aspect instruction
    const aspectInstruction = parsed.aspectRatio
      ? `图片必须严格保持 ${parsed.aspectRatio} 的宽高比例。`
      : `图片尺寸必须严格为 ${size} 像素。`;

    let styleInstruction = parsed.style;
    if (heroTemplateStructure) {
      styleInstruction = `${parsed.style}。\n\n${buildHeroTemplateInstruction(heroTemplateStructure as any)}`;
    }

    const prompt = `电商主图，商品：${parsed.productName}。${parsed.productDescription ?? ""}。${styleInstruction}。${aspectInstruction}高质量商品摄影，适合电商平台头图展示。`;

    // Reference images (support both single and multiple)
    const referenceImages: string[] = [];
    if (parsed.productImages && parsed.productImages.length > 0) {
      for (const img of parsed.productImages) {
        if (img.startsWith("data:")) referenceImages.push(img);
      }
    } else if (parsed.productImage?.startsWith("data:")) {
      referenceImages.push(parsed.productImage);
    }

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
      aspectRatio: parsed.aspectRatio as "1:1" | "3:4" | "4:3" | "16:9" | "9:16",
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

    return ok({ imageUrl, model });
  } catch (error) {
    return handleRouteError(error);
  }
}
