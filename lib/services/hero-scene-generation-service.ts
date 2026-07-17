import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { buildHeroScenePrompt } from "@/lib/ai/prompts/hero-scene";
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
    const { provider, adapter } = await getProviderAdapter("image");
    const runtimeModel = provider.models.find((m) => (m as { isDefaultHeroImage?: boolean }).isDefaultHeroImage)
      ?? provider.models.find((m) => {
        const caps = m.capabilities as Record<string, unknown>;
        return caps?.image_gen && caps?.real_image_gen !== false;
      })
      ?? provider.models[0];
    const model = runtimeModel?.modelId ?? "";

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

    const referenceImages: string[] = [];
    if (generation.sourceImageUrl.startsWith("data:")) {
      referenceImages.push(generation.sourceImageUrl);
    } else if (generation.sourceImageUrl.startsWith("/api/files/")) {
      const { readStorageFile } = await import("@/lib/storage/asset-manager");
      const match = generation.sourceImageUrl.match(/\/api\/files\/(.*)$/);
      if (match) {
        const buffer = await readStorageFile(match[1]);
        const mimeType = match[1].endsWith(".jpg") || match[1].endsWith(".jpeg") ? "image/jpeg" : "image/png";
        referenceImages.push(`data:${mimeType};base64,${buffer.toString("base64")}`);
      }
    }

    const result = await adapter.generateImage({
      model,
      prompt,
      size,
      aspectRatio,
      referenceImages,
      timeoutMs: 180000,
    });

    let buffer: Buffer;
    if (result.url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(result.url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`下载图片失败: ${res.status}`);
      buffer = Buffer.from(await res.arrayBuffer());
    } else if (result.b64Json) {
      buffer = Buffer.from(result.b64Json, "base64");
    } else {
      throw new Error("图片生成返回为空");
    }

    const storageDir = join(env.STORAGE_ROOT ?? "./storage", "hero-scene", "generations");
    if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });
    const fileName = `hero-scene-${Date.now()}-${id.slice(-6)}.png`;
    const filePath = join(storageDir, fileName);
    writeFileSync(filePath, buffer);

    const generatedImageUrl = `/api/files/hero-scene/generations/${fileName}`;

    await prisma.heroSceneGeneration.update({
      where: { id },
      data: {
        status: "COMPLETED",
        generatedImageUrl,
        metadata: {
          model,
          prompt,
          size,
          aspectRatio,
          completedAt: new Date().toISOString(),
        } as any,
      },
    });

    return generatedImageUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    await prisma.heroSceneGeneration.update({
      where: { id },
      data: { status: "FAILED", errorMessage: message },
    });
    throw error;
  }
}
