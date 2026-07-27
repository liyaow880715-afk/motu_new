import crypto from "crypto";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { buildWhiteBackgroundPrompt } from "@/lib/ai/prompts/hero-scene";
import {
  resolveAuthorizedStoragePath,
  scopedStorageRelativePath,
} from "@/lib/storage/access-key-storage";
import { env } from "@/lib/utils/env";

function computeSourceHash(sourceImageUrl: string): string {
  return crypto.createHash("md5").update(sourceImageUrl).digest("hex");
}

async function resolveReferenceImage(url: string, accessKeyId: string | null): Promise<string[]> {
  if (url.startsWith("data:")) return [url];

  if (url.startsWith("/api/files/")) {
    const { readStorageFile } = await import("@/lib/storage/asset-manager");
    const match = url.match(/\/api\/files\/(.*)$/);
    if (match) {
      const storagePath = await resolveAuthorizedStoragePath(match[1], accessKeyId);
      const buffer = await readStorageFile(storagePath);
      const mimeType = match[1].endsWith(".jpg") || match[1].endsWith(".jpeg") ? "image/jpeg" : "image/png";
      return [`data:${mimeType};base64,${buffer.toString("base64")}`];
    }
  }

  return [];
}

async function generateImageWithAdapter(
  prompt: string,
  referenceImages: string[],
): Promise<Buffer> {
  const { provider, adapter } = await getProviderAdapter("image");
  const runtimeModel = provider.models.find((m) => (m as { isDefaultHeroImage?: boolean }).isDefaultHeroImage)
    ?? provider.models.find((m) => {
      const caps = m.capabilities as Record<string, unknown>;
      return caps?.image_gen && caps?.real_image_gen !== false;
    })
    ?? provider.models[0];
  const model = runtimeModel?.modelId ?? "";

  const result = await adapter.generateImage({
    model,
    prompt,
    size: "1024x1024",
    aspectRatio: "1:1",
    referenceImages,
    timeoutMs: 360000,
  });

  if (result.url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(result.url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`下载图片失败: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  if (result.b64Json) {
    return Buffer.from(result.b64Json, "base64");
  }

  throw new Error("图片生成返回为空");
}

export async function findExistingWhiteBg(productName: string, sourceImageUrl: string, accessKeyId: string | null = null) {
  const sourceHash = computeSourceHash(sourceImageUrl);
  return prisma.heroWhiteBgImage.findFirst({
    where: {
      OR: [
        { sourceHash },
        { productName, sourceImageUrl },
      ],
      ...(accessKeyId ? { accessKeyId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function generateWhiteBgImage(
  productName: string,
  productDescription: string | undefined,
  sourceImageUrl: string,
  accessKeyId: string | null = null,
): Promise<string> {
  // Check cache first
  const existing = await findExistingWhiteBg(productName, sourceImageUrl, accessKeyId);
  if (existing) {
    return existing.imageUrl;
  }

  const referenceImages = await resolveReferenceImage(sourceImageUrl, accessKeyId);
  if (referenceImages.length === 0) {
    throw new Error("无法读取参考图");
  }

  const prompt = buildWhiteBackgroundPrompt(productName, productDescription);
  const buffer = await generateImageWithAdapter(prompt, referenceImages);

  const storageDir = join(
    env.STORAGE_ROOT ?? "./storage",
    scopedStorageRelativePath("hero-scene", accessKeyId, "white-bg"),
  );
  if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });
  const fileName = `white-bg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
  const filePath = join(storageDir, fileName);
  writeFileSync(filePath, buffer);

  const imageUrl = `/api/files/hero-scene/white-bg/${fileName}`;
  const sourceHash = computeSourceHash(sourceImageUrl);

  await prisma.heroWhiteBgImage.create({
    data: {
      productName,
      sourceImageUrl,
      sourceHash,
      imageUrl,
      accessKeyId,
    },
  });

  return imageUrl;
}

export async function getWhiteBgImagesByProduct(productName: string, accessKeyId: string | null = null) {
  return prisma.heroWhiteBgImage.findMany({
    where: { productName, ...(accessKeyId ? { accessKeyId } : {}) },
    orderBy: { createdAt: "desc" },
  });
}
