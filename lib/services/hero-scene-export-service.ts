import { existsSync, mkdirSync, createWriteStream } from "fs";
import { join } from "path";
import archiver from "archiver";

import { prisma } from "@/lib/db/prisma";
import { readStorageFile } from "@/lib/storage/asset-manager";
import { env } from "@/lib/utils/env";
import { sanitizeFileName } from "@/lib/utils/files";

interface StoreConfig {
  stores: Array<{
    name: string;
    links: string[];
  }>;
}

interface ExportInput {
  productName: string;
  variantIds: string[];
  storeConfig?: StoreConfig;
  assetIds?: string[];
}

async function appendVariantImages(
  archive: archiver.Archiver,
  variants: Awaited<ReturnType<typeof fetchVariants>>,
  basePath: string,
  manifestImages: Array<{ order: number; fileName: string; scene: string; copyText: string; layoutStyle: string }>,
) {
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (!variant.variantImageUrl) continue;

    const match = variant.variantImageUrl.match(/\/api\/files\/(.*)$/);
    if (!match) continue;

    const buffer = await readStorageFile(match[1]);
    const order = i + 1;
    const fileName = `${String(order).padStart(3, "0")}-${sanitizeFileName(variant.copyText || "主图")}.png`;
    const entryName = basePath ? `${basePath}/${fileName}` : fileName;

    archive.append(buffer, { name: entryName });
    manifestImages.push({
      order,
      fileName: entryName,
      scene: variant.generation.sceneLibrary?.name || "默认场景",
      copyText: variant.copyText,
      layoutStyle: variant.layoutStyle,
    });
  }
}

async function appendAssetImages(
  archive: archiver.Archiver,
  assets: Awaited<ReturnType<typeof fetchAssets>>,
  basePath: string,
  manifestAssets: Array<{ type: string; fileName: string }>,
) {
  const typeNames: Record<string, string> = {
    "white-bg": "白底图",
    spec: "规格图",
    ingredient: "成分图",
    nutrition: "营养成分表",
  };

  for (const asset of assets) {
    if (!asset.imageUrl) continue;
    const match = asset.imageUrl.match(/\/api\/files\/(.*)$/);
    if (!match) continue;

    const buffer = await readStorageFile(match[1]);
    const fileName = `${typeNames[asset.type] || asset.type}.png`;
    const entryName = `${basePath}/素材图/${fileName}`;

    archive.append(buffer, { name: entryName });
    manifestAssets.push({ type: asset.type, fileName: entryName });
  }
}

async function fetchVariants(variantIds: string[]) {
  return prisma.heroSceneVariant.findMany({
    where: { id: { in: variantIds }, status: "COMPLETED" },
    include: { generation: { include: { sceneLibrary: true } } },
  });
}

async function fetchAssets(assetIds?: string[]) {
  if (!assetIds || assetIds.length === 0) return [];
  return prisma.heroProductAsset.findMany({
    where: { id: { in: assetIds } },
  });
}

export async function createExport(input: ExportInput) {
  const variants = await fetchVariants(input.variantIds);

  if (variants.length === 0) {
    throw new Error("没有可导出的变体");
  }

  const assets = await fetchAssets(input.assetIds);

  const storageDir = join(env.STORAGE_ROOT ?? "./storage", "hero-scene", "exports");
  if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });

  const safeProductName = sanitizeFileName(input.productName || "商品");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipFileName = `${safeProductName}-${timestamp}.zip`;
  const zipFilePath = join(storageDir, zipFileName);

  const archive = archiver("zip", { zlib: { level: 9 } });
  const outputStream = createWriteStream(zipFilePath);
  archive.pipe(outputStream);

  const manifest = {
    productName: input.productName,
    exportedAt: new Date().toISOString(),
    variantCount: variants.length,
    storeConfig: input.storeConfig,
    images: [] as Array<{ order: number; fileName: string; scene: string; copyText: string; layoutStyle: string }>,
    assets: [] as Array<{ type: string; fileName: string }>,
  };

  if (input.storeConfig && Array.isArray(input.storeConfig.stores) && input.storeConfig.stores.length > 0) {
    for (const store of input.storeConfig.stores) {
      const safeStoreName = sanitizeFileName(store.name || "未命名店铺");
      for (let linkIndex = 0; linkIndex < store.links.length; linkIndex++) {
        const linkName = sanitizeFileName(store.links[linkIndex] || `链接${linkIndex + 1}`);
        const basePath = `${safeStoreName}/${linkName}`;
        await appendVariantImages(archive, variants, basePath, manifest.images);
        if (assets.length > 0) {
          await appendAssetImages(archive, assets, basePath, manifest.assets);
        }
      }
    }
  } else {
    await appendVariantImages(archive, variants, "", manifest.images);
    if (assets.length > 0) {
      await appendAssetImages(archive, assets, "素材图", manifest.assets);
    }
  }

  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

  await archive.finalize();

  const exportRecord = await prisma.heroSceneExport.create({
    data: {
      productName: input.productName,
      zipFilePath: `/api/files/hero-scene/exports/${zipFileName}`,
      variantCount: variants.length,
      storeConfig: input.storeConfig as any,
      assetIds: (input.assetIds ?? []) as any,
      items: {
        create: variants.map((variant) => ({ variantId: variant.id })),
      },
    },
  });

  return { exportRecord, zipFilePath: `/api/files/hero-scene/exports/${zipFileName}` };
}

export async function getAllExports() {
  return prisma.heroSceneExport.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: { include: { variant: true } } },
  });
}

export async function getExportById(id: string) {
  return prisma.heroSceneExport.findUnique({
    where: { id },
    include: { items: { include: { variant: true } } },
  });
}

export async function deleteExport(id: string) {
  return prisma.heroSceneExport.delete({ where: { id } });
}
