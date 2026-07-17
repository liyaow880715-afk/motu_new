import { spawn } from "child_process";
import crypto from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/utils/env";
import { generateWhiteBgImage, findExistingWhiteBg } from "./hero-white-bg-service";

export type ProductAssetType = "white-bg" | "spec" | "ingredient" | "nutrition";

export interface SpecEntry {
  label: string;
  value: string;
}

export interface NutritionEntry {
  label: string;
  value: string;
  unit: string;
}

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

async function composeAssetWithPython(payload: Record<string, unknown>): Promise<string> {
  const python = process.env.PYTHON_PATH || "python";
  const script = join(process.cwd(), "scripts", "hero-product-asset-compose.py");

  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (stderr) {
        console.warn("hero-product-asset-compose.py stderr:", stderr);
      }
      if (code !== 0) {
        reject(new Error(`素材合成脚本退出码 ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (!result.success) {
          reject(new Error(result.error || "素材合成失败"));
        } else {
          resolve(result.outputPath);
        }
      } catch (error) {
        reject(new Error(`解析脚本输出失败: ${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function resolveLocalImagePath(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("/api/files/")) {
    const { readStorageFile } = await import("@/lib/storage/asset-manager");
    const match = imageUrl.match(/\/api\/files\/(.*)$/);
    if (!match) throw new Error("无效的图片路径");
    const buffer = await readStorageFile(match[1]);
    const dir = ensureStorageDir();
    const tempName = `temp-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
    const tempPath = join(dir, tempName);
    writeFileSync(tempPath, buffer);
    return tempPath;
  }
  return imageUrl;
}

export async function findExistingAsset(productName: string, assetType: ProductAssetType) {
  return prisma.heroProductAsset.findFirst({
    where: { productName, type: assetType },
    orderBy: { createdAt: "desc" },
  });
}

async function saveAssetRecord(
  productName: string,
  assetType: ProductAssetType,
  imageUrl: string,
  contentJson?: Record<string, unknown>,
) {
  return prisma.heroProductAsset.create({
    data: {
      productName,
      type: assetType,
      imageUrl,
      contentJson: contentJson as any,
      status: "COMPLETED",
    },
  });
}

export async function generateProductAsset(input: GenerateAssetInput): Promise<string> {
  const { productName, sourceImageUrl, assetType, specs, ingredients, nutritionRows } = input;

  // For white-bg, reuse cached generation service
  if (assetType === "white-bg") {
    const existing = await findExistingAsset(productName, "white-bg");
    if (existing) return existing.imageUrl;

    const imageUrl = await generateWhiteBgImage(
      productName,
      undefined,
      sourceImageUrl,
    );

    await saveAssetRecord(productName, "white-bg", imageUrl);
    return imageUrl;
  }

  // For other asset types, check existing and reuse if available
  const existing = await findExistingAsset(productName, assetType);
  if (existing) return existing.imageUrl;

  // Ensure we have a white background image to composite
  const whiteBg = await findExistingWhiteBg(productName, sourceImageUrl);
  let whiteBgImageUrl = whiteBg?.imageUrl;
  if (!whiteBgImageUrl) {
    whiteBgImageUrl = await generateWhiteBgImage(productName, undefined, sourceImageUrl);
  }

  const dir = ensureStorageDir();
  const outputPath = join(dir, assetFileName(productName, assetType));

  const localImagePath = await resolveLocalImagePath(whiteBgImageUrl);

  const payload: Record<string, unknown> = {
    productName,
    assetType,
    imagePath: localImagePath,
    outputPath,
    width: 1024,
    height: 1024,
  };

  if (assetType === "spec") payload.specs = specs ?? [];
  if (assetType === "ingredient") payload.ingredients = ingredients ?? [];
  if (assetType === "nutrition") payload.nutritionRows = nutritionRows ?? [];

  await composeAssetWithPython(payload);

  const imageUrl = `/api/files/hero-scene/product-assets/${outputPath.split("/").pop()}`;

  await saveAssetRecord(productName, assetType, imageUrl, {
    specs,
    ingredients,
    nutritionRows,
    sourceWhiteBgUrl: whiteBgImageUrl,
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

  const results: Record<ProductAssetType, string> = {
    "white-bg": "",
    spec: "",
    ingredient: "",
    nutrition: "",
  };

  results["white-bg"] = await generateProductAsset({ productName, sourceImageUrl, assetType: "white-bg" });
  results.spec = await generateProductAsset({ productName, sourceImageUrl, assetType: "spec", specs });
  results.ingredient = await generateProductAsset({
    productName,
    sourceImageUrl,
    assetType: "ingredient",
    ingredients,
  });
  results.nutrition = await generateProductAsset({
    productName,
    sourceImageUrl,
    assetType: "nutrition",
    nutritionRows,
  });

  return results;
}

export async function listProductAssets(productName?: string) {
  return prisma.heroProductAsset.findMany({
    where: productName ? { productName } : undefined,
    orderBy: { createdAt: "desc" },
  });
}
