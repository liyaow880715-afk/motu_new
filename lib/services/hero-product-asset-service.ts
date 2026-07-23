import crypto from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { generateWhiteBgImage, findExistingWhiteBg } from "./hero-white-bg-service";
import { readStorageFile } from "@/lib/storage/asset-manager";
import { env } from "@/lib/utils/env";

export type ProductAssetType = "white-bg" | "spec" | "ingredient" | "nutrition";
export interface SpecEntry { label: string; value: string }
export interface NutritionEntry { label: string; value: string; unit: string }
export interface GenerateAssetInput {
  productName: string;
  sourceImageUrl: string;
  assetType: ProductAssetType;
  specs?: SpecEntry[];
  ingredients?: string[];
  nutritionRows?: NutritionEntry[];
}

function storageDir(): string {
  return join(env.STORAGE_ROOT ?? "./storage", "hero-scene", "product-assets");
}

function ensureStorageDir(): string {
  const dir = storageDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function assetFileName(productName: string, assetType: ProductAssetType): string {
  const safe = productName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_").slice(0, 40);
  return `${safe}-${assetType}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
}

async function resolveImageDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:")) return imageUrl;
  if (imageUrl.startsWith("/api/files/")) {
    const match = imageUrl.match(/\/api\/files\/(.*)$/);
    if (!match) throw new Error("无效的图片路径");
    const buffer = await readStorageFile(match[1]);
    const mime = /\.jpe?g$/i.test(match[1]) ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }
  return imageUrl;
}

async function generateAiAsset(prompt: string, referenceImages: string[]): Promise<Buffer> {
  const { provider, adapter } = await getProviderAdapter("image");
  const model = provider.models.find((item) => (item as { isDefaultHeroImage?: boolean }).isDefaultHeroImage)?.modelId
    ?? provider.models.find((item) => Boolean((item.capabilities as Record<string, unknown>)?.image_gen))?.modelId
    ?? provider.models[0]?.modelId;
  if (!model) throw new Error("没有可用的图片生成模型");
  const result = await adapter.generateImage({ model, prompt, size: "1024x1024", aspectRatio: "1:1", referenceImages, timeoutMs: 360000 });
  if (result.b64Json) return Buffer.from(result.b64Json, "base64");
  if (result.url) {
    const response = await fetch(result.url);
    if (!response.ok) throw new Error(`下载 AI 素材失败: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error("AI 素材生成返回为空");
}

async function validateOcrText(imageBuffer: Buffer, expected: string[]): Promise<{ status: "passed" | "failed" | "unscored"; issues: string[] }> {
  try {
    const { provider, adapter } = await getProviderAdapter("text");
    const visionModel = provider.models.find((item) => {
      const capabilities = (item.capabilities ?? {}) as Record<string, unknown>;
      return Boolean(capabilities.vision || capabilities.image_vision);
    });
    if (!visionModel) return { status: "unscored", issues: ["没有可用的 OCR 视觉模型"] };
    const result = await adapter.generateText({
      model: visionModel.modelId,
      systemPrompt: "You are an OCR compliance checker. Return JSON only.",
      userPrompt: [
        "The first attachment is an AI-generated product information card.",
        "Compare the visible labels and values against this exact whitelist:",
        ...expected,
        "Return {\"pass\":true|false,\"issues\":[\"...\"]}. Do not infer missing text.",
      ].join("\n"),
      images: [`data:image/png;base64,${imageBuffer.toString("base64")}`],
      timeoutMs: 90000,
    });
    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return { status: "unscored", issues: ["OCR 模型未返回可解析结果"] };
    const parsed = JSON.parse(match[0]) as { pass?: boolean; issues?: unknown };
    const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String).filter(Boolean) : [];
    return { status: parsed.pass === true ? "passed" : "failed", issues };
  } catch (error) {
    console.error("[HeroProductAsset] OCR validation unavailable:", error);
    return { status: "unscored", issues: ["OCR 校验请求异常"] };
  }
}

export async function findExistingAsset(productName: string, assetType: ProductAssetType) {
  return prisma.heroProductAsset.findFirst({ where: { productName, type: assetType }, orderBy: { createdAt: "desc" } });
}

async function saveAssetRecord(productName: string, assetType: ProductAssetType, imageUrl: string, contentJson?: Record<string, unknown>) {
  return prisma.heroProductAsset.create({ data: { productName, type: assetType, imageUrl, contentJson: contentJson as any, status: "COMPLETED" } });
}

export async function generateProductAsset(input: GenerateAssetInput): Promise<string> {
  const { productName, sourceImageUrl, assetType, specs, ingredients, nutritionRows } = input;
  if (assetType === "white-bg") {
    const existing = await findExistingAsset(productName, "white-bg");
    if (existing) return existing.imageUrl;
    const imageUrl = await generateWhiteBgImage(productName, undefined, sourceImageUrl);
    await saveAssetRecord(productName, "white-bg", imageUrl);
    return imageUrl;
  }

  const existing = await findExistingAsset(productName, assetType);
  const existingMetadata = (existing?.contentJson as Record<string, unknown> | null) ?? {};
  if (existing && existingMetadata.generatedBy === "ai-image-api") return existing.imageUrl;

  const whiteBg = await findExistingWhiteBg(productName, sourceImageUrl);
  const whiteBgImageUrl = whiteBg?.imageUrl ?? await generateWhiteBgImage(productName, undefined, sourceImageUrl);
  const [whiteBgImage, sourceImage] = await Promise.all([
    resolveImageDataUrl(whiteBgImageUrl),
    resolveImageDataUrl(sourceImageUrl),
  ]);

  const dataLines = assetType === "spec"
    ? [`Exact specifications (do not alter): ${JSON.stringify(specs ?? [])}`]
    : assetType === "ingredient"
      ? [`Exact ingredient list (do not alter): ${JSON.stringify(ingredients ?? [])}`]
      : [`Exact nutrition rows (do not alter): ${JSON.stringify(nutritionRows ?? [])}`];
  const typeInstruction = assetType === "spec"
    ? "Create a clean specification card"
    : assetType === "ingredient"
      ? "Create an ingredient / composition card"
      : "Create a nutrition facts card";
  const prompt = [
    `Create the final AI-generated ${typeInstruction} for the product ${productName}.`,
    "Use the supplied product and white-background references to preserve the exact product identity and packaging.",
    ...dataLines,
    "Use only the exact supplied labels and values. Never invent, round, translate, or complete a missing value.",
    "Use large, high-contrast, OCR-readable typography and a restrained e-commerce layout. If exact text cannot be rendered, leave that row blank rather than hallucinating.",
    "Do not add badges, certifications, barcodes, prices, reviews, promotional claims, or logos that are not present in the references.",
  ].join("\n");
  const buffer = await generateAiAsset(prompt, [whiteBgImage, sourceImage]);
  const expectedText = assetType === "spec"
    ? (specs ?? []).map((item) => `${item.label}: ${item.value}`)
    : assetType === "ingredient"
      ? (ingredients ?? [])
      : (nutritionRows ?? []).map((item) => `${item.label}: ${item.value} ${item.unit}`);
  const ocrValidation = await validateOcrText(buffer, expectedText);
  if (ocrValidation.status === "failed") {
    console.warn("[HeroProductAsset] OCR validation failed; asset remains available for review:", ocrValidation.issues);
  }

  const fileName = assetFileName(productName, assetType);
  writeFileSync(join(ensureStorageDir(), fileName), buffer);
  const imageUrl = `/api/files/hero-scene/product-assets/${fileName}`;
  await saveAssetRecord(productName, assetType, imageUrl, {
    specs,
    ingredients,
    nutritionRows,
    sourceWhiteBgUrl: whiteBgImageUrl,
    generatedBy: "ai-image-api",
    requiresOcrValidation: true,
    ocrValidation,
  });
  return imageUrl;
}

export async function generateAllProductAssets(input: {
  productName: string;
  sourceImageUrl: string;
  specs?: SpecEntry[];
  ingredients?: string[];
  nutritionRows?: NutritionEntry[];
}) {
  const { productName, sourceImageUrl, specs, ingredients, nutritionRows } = input;
  const results: Record<ProductAssetType, string> = { "white-bg": "", spec: "", ingredient: "", nutrition: "" };
  results["white-bg"] = await generateProductAsset({ productName, sourceImageUrl, assetType: "white-bg" });
  [results.spec, results.ingredient, results.nutrition] = await Promise.all([
    generateProductAsset({ productName, sourceImageUrl, assetType: "spec", specs }),
    generateProductAsset({ productName, sourceImageUrl, assetType: "ingredient", ingredients }),
    generateProductAsset({ productName, sourceImageUrl, assetType: "nutrition", nutritionRows }),
  ]);
  return results;
}

export async function listProductAssets(productName?: string) {
  return prisma.heroProductAsset.findMany({ where: productName ? { productName } : undefined, orderBy: { createdAt: "desc" } });
}
