import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { readStorageFile } from "@/lib/storage/asset-manager";
import { env } from "@/lib/utils/env";
import type { LayoutStyle } from "@/types/hero-scene";

async function resolveImageDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/api/files/")) {
    const match = url.match(/\/api\/files\/(.*)$/);
    if (!match) throw new Error("无法解析图片路径");
    const buffer = await readStorageFile(match[1]);
    const mime = /\.jpe?g$/i.test(match[1]) ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }
  return url;
}

async function generateVariantImage(
  prompt: string,
  referenceImages: string[],
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9" | "9:16",
) {
  const { provider, adapter } = await getProviderAdapter("image");
  const model = provider.models.find((item) => (item as { isDefaultHeroImage?: boolean }).isDefaultHeroImage)?.modelId
    ?? provider.models.find((item) => Boolean((item.capabilities as Record<string, unknown>)?.image_gen))?.modelId
    ?? provider.models[0]?.modelId;
  if (!model) throw new Error("没有可用的图片生成模型");
  const result = await adapter.generateImage({
    model,
    prompt,
    aspectRatio,
    referenceImages,
    timeoutMs: 360000,
  });
  if (result.b64Json) return Buffer.from(result.b64Json, "base64");
  if (result.url) {
    const response = await fetch(result.url);
    if (!response.ok) throw new Error(`下载 AI 变体失败: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error("AI 变体生成返回为空");
}

export async function createVariant(input: {
  generationId: string;
  copyText: string;
  subCopyText?: string;
  layoutStyle: LayoutStyle;
  tags?: string[];
}) {
  return prisma.heroSceneVariant.create({
    data: {
      generationId: input.generationId,
      copyText: input.copyText,
      subCopyText: input.subCopyText ?? null,
      layoutStyle: input.layoutStyle,
      tags: input.tags ?? [],
      status: "PENDING",
    },
    include: { generation: true },
  });
}

export async function getVariantById(id: string) {
  return prisma.heroSceneVariant.findUnique({
    where: { id },
    include: { generation: { include: { sceneLibrary: true } } },
  });
}

export async function getVariantsByGeneration(generationId: string) {
  return prisma.heroSceneVariant.findMany({ where: { generationId }, orderBy: { createdAt: "asc" } });
}

export async function deleteVariant(id: string) {
  return prisma.heroSceneVariant.delete({ where: { id } });
}

export async function composeVariant(variantId: string) {
  const variant = await prisma.heroSceneVariant.findUnique({
    where: { id: variantId },
    include: { generation: true },
  });
  if (!variant || !variant.generation) throw new Error("变体不存在");
  if (!variant.generation.generatedImageUrl) throw new Error("场景底图尚未生成");

  await prisma.heroSceneVariant.update({
    where: { id: variantId },
    data: { status: "RUNNING", errorMessage: null },
  });

  try {
    const metadata = (variant.generation.metadata as Record<string, unknown> | null) ?? {};
    const aspectRatio = (metadata.aspectRatio as "1:1" | "3:4" | "4:3" | "16:9" | "9:16") ?? "1:1";
    const baseImage = await resolveImageDataUrl(variant.generation.generatedImageUrl);
    const prompt = [
      "Create the final AI-generated e-commerce hero-image variant from the supplied scene image.",
      `Layout direction: ${variant.layoutStyle}.`,
      `Headline copy: ${variant.copyText}`,
      variant.subCopyText ? `Supporting copy: ${variant.subCopyText}` : "",
      Array.isArray(variant.tags) && variant.tags.length ? `Visual tags: ${(variant.tags as string[]).join(", ")}` : "",
      "Keep the product, packaging, logo, material, colors, and scene identity unchanged.",
      "Use the provided copy only; do not invent promotions, reviews, certifications, prices, or fine print.",
      "Render a clean marketplace-ready composition with readable short text and safe margins.",
    ].filter(Boolean).join("\n");
    const imageBuffer = await generateVariantImage(prompt, [baseImage], aspectRatio);

    const storageDir = join(env.STORAGE_ROOT ?? "./storage", "hero-scene", "variants");
    if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });
    const fileName = `hero-variant-${Date.now()}-${variantId.slice(-6)}.png`;
    writeFileSync(join(storageDir, fileName), imageBuffer);
    const variantImageUrl = `/api/files/hero-scene/variants/${fileName}`;

    await prisma.heroSceneVariant.update({
      where: { id: variantId },
      data: {
        status: "COMPLETED",
        variantImageUrl,
        metadata: {
          generatedBy: "ai-image-api",
          generatedAt: new Date().toISOString(),
          model: metadata.model ?? null,
          aspectRatio,
          prompt,
        } as any,
      },
    });
    return variantImageUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    await prisma.heroSceneVariant.update({ where: { id: variantId }, data: { status: "FAILED", errorMessage: message } });
    throw error;
  }
}

export async function batchComposeVariants(variantIds: string[]) {
  const results: Array<{ id: string; url?: string; error?: string }> = [];
  for (const id of variantIds) {
    try {
      results.push({ id, url: await composeVariant(id) });
    } catch (error) {
      results.push({ id, error: error instanceof Error ? error.message : "失败" });
    }
  }
  return results;
}
