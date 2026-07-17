import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { buildHeroScenePrompt, buildWhiteBackgroundPrompt } from "@/lib/ai/prompts/hero-scene";
import { env } from "@/lib/utils/env";

export async function createGeneration(input: {
  productName: string;
  productDescription?: string;
  sourceImageUrl: string;
  sceneLibraryId: string;
}) {
  return prisma.heroSceneGeneration.create({
    data: {
      productName: input.productName,
      productDescription: input.productDescription ?? null,
      sourceImageUrl: input.sourceImageUrl,
      sceneLibraryId: input.sceneLibraryId,
      status: "PENDING",
    },
    include: { sceneLibrary: true },
  });
}

export async function getGenerationById(id: string) {
  return prisma.heroSceneGeneration.findUnique({
    where: { id },
    include: { sceneLibrary: true, variants: true },
  });
}

export async function getGenerationsByProduct(productName: string) {
  return prisma.heroSceneGeneration.findMany({
    where: { productName },
    include: { sceneLibrary: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listGenerations(status?: string) {
  return prisma.heroSceneGeneration.findMany({
    where: status ? { status } : undefined,
    include: { sceneLibrary: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteGeneration(id: string) {
  return prisma.heroSceneGeneration.delete({ where: { id } });
}

async function resolveReferenceImage(url: string): Promise<string[]> {
  if (url.startsWith("data:")) return [url];

  if (url.startsWith("/api/files/")) {
    const { readStorageFile } = await import("@/lib/storage/asset-manager");
    const match = url.match(/\/api\/files\/(.*)$/);
    if (match) {
      const buffer = await readStorageFile(match[1]);
      const mimeType = match[1].endsWith(".jpg") || match[1].endsWith(".jpeg") ? "image/jpeg" : "image/png";
      return [`data:${mimeType};base64,${buffer.toString("base64")}`];
    }
  }

  return [];
}

async function saveGeneratedImage(buffer: Buffer, subDir: string, prefix: string): Promise<string> {
  const storageDir = join(env.STORAGE_ROOT ?? "./storage", "hero-scene", subDir);
  if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });
  const fileName = `${prefix}-${Date.now()}.png`;
  const filePath = join(storageDir, fileName);
  writeFileSync(filePath, buffer);
  return `/api/files/hero-scene/${subDir}/${fileName}`;
}

async function generateImageWithAdapter(
  prompt: string,
  referenceImages: string[],
  size: string,
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9" | "9:16",
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
    size,
    aspectRatio,
    referenceImages,
    timeoutMs: 180000,
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

export async function generateWhiteBackground(id: string) {
  const generation = await prisma.heroSceneGeneration.findUnique({
    where: { id },
  });

  if (!generation) throw new Error("生成任务不存在");
  if (generation.whiteBgImageUrl) return generation.whiteBgImageUrl;

  await prisma.heroSceneGeneration.update({
    where: { id },
    data: { status: "RUNNING", errorMessage: null },
  });

  try {
    const referenceImages = await resolveReferenceImage(generation.sourceImageUrl);
    if (referenceImages.length === 0) throw new Error("无法读取参考图");

    const prompt = buildWhiteBackgroundPrompt(
      generation.productName,
      generation.productDescription ?? undefined,
    );

    const buffer = await generateImageWithAdapter(prompt, referenceImages, "1024x1024", "1:1");
    const whiteBgImageUrl = await saveGeneratedImage(buffer, "white-bg", `white-bg-${id.slice(-6)}`);

    await prisma.heroSceneGeneration.update({
      where: { id },
      data: { whiteBgImageUrl },
    });

    return whiteBgImageUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : "白底图生成失败";
    await prisma.heroSceneGeneration.update({
      where: { id },
      data: { status: "FAILED", errorMessage: message },
    });
    throw error;
  }
}

export async function runGeneration(id: string) {
  const generation = await prisma.heroSceneGeneration.findUnique({
    where: { id },
    include: { sceneLibrary: true },
  });

  if (!generation || !generation.sceneLibrary) {
    throw new Error("生成任务不存在");
  }

  await prisma.heroSceneGeneration.update({
    where: { id },
    data: { status: "RUNNING", errorMessage: null },
  });

  try {
    // Step 1: ensure white background image exists
    let whiteBgImageUrl = generation.whiteBgImageUrl;
    if (!whiteBgImageUrl) {
      whiteBgImageUrl = await generateWhiteBackground(id);
    }

    // Step 2: generate scene image from white background
    const sizeMap: Record<string, string> = {
      "1:1": "1024x1024",
      "3:4": "768x1024",
      "4:3": "1024x768",
      "16:9": "1024x576",
    };
    const aspectRatio = generation.sceneLibrary.aspectRatio as "1:1" | "3:4" | "4:3" | "16:9" | "9:16";
    const size = sizeMap[aspectRatio] ?? "1024x1024";

    const prompt = buildHeroScenePrompt(
      generation.productName,
      generation.productDescription ?? undefined,
      generation.sceneLibrary.scenePrompt,
      aspectRatio,
    );

    const referenceImages = await resolveReferenceImage(whiteBgImageUrl);
    if (referenceImages.length === 0) throw new Error("无法读取白底图");

    const buffer = await generateImageWithAdapter(prompt, referenceImages, size, aspectRatio);
    const generatedImageUrl = await saveGeneratedImage(buffer, "generations", `hero-scene-${id.slice(-6)}`);

    await prisma.heroSceneGeneration.update({
      where: { id },
      data: {
        status: "COMPLETED",
        generatedImageUrl,
        metadata: {
          model: (await getProviderAdapter("image")).provider.models[0]?.modelId ?? "",
          prompt,
          size,
          aspectRatio,
          whiteBgImageUrl,
          completedAt: new Date().toISOString(),
        } as any,
      },
    });

    return generatedImageUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : "场景生成失败";
    await prisma.heroSceneGeneration.update({
      where: { id },
      data: { status: "FAILED", errorMessage: message },
    });
    throw error;
  }
}
