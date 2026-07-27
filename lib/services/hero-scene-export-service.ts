import { existsSync, mkdirSync, createWriteStream } from "fs";
import { join } from "path";
import { type Archiver, ZipArchive } from "archiver";

import { prisma } from "@/lib/db/prisma";
import { readStorageFile } from "@/lib/storage/asset-manager";
import {
  resolveAuthorizedStoragePath,
  scopedStorageRelativePath,
} from "@/lib/storage/access-key-storage";
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
  accessKeyId?: string | null;
}

async function appendVariantImages(
  archive: Archiver,
  variants: Awaited<ReturnType<typeof fetchVariants>>,
  basePath: string,
  manifestImages: Array<{ order: number; fileName: string; scene: string; copyText: string; layoutStyle: string }>,
  accessKeyId: string | null,
) {
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (!variant.variantImageUrl) continue;

    const match = variant.variantImageUrl.match(/\/api\/files\/(.*)$/);
    if (!match) continue;

    const storagePath = await resolveAuthorizedStoragePath(match[1], accessKeyId);
    const buffer = await readStorageFile(storagePath);
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
  archive: Archiver,
  assets: Awaited<ReturnType<typeof fetchAssets>>,
  basePath: string,
  manifestAssets: Array<{ type: string; fileName: string }>,
  accessKeyId: string | null,
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

    const storagePath = await resolveAuthorizedStoragePath(match[1], accessKeyId);
    const buffer = await readStorageFile(storagePath);
    const fileName = `${typeNames[asset.type] || asset.type}.png`;
    const entryName = `${basePath}/素材图/${fileName}`;

    archive.append(buffer, { name: entryName });
    manifestAssets.push({ type: asset.type, fileName: entryName });
  }
}

async function fetchVariants(variantIds: string[], accessKeyId: string | null) {
  return prisma.heroSceneVariant.findMany({
    where: {
      id: { in: variantIds },
      status: "COMPLETED",
      ...(accessKeyId ? { generation: { accessKeyId } } : {}),
    },
    include: { generation: { include: { sceneLibrary: true } } },
  });
}

async function fetchAssets(assetIds: string[] | undefined, accessKeyId: string | null) {
  if (!assetIds || assetIds.length === 0) return [];
  return prisma.heroProductAsset.findMany({
    where: { id: { in: assetIds }, ...(accessKeyId ? { accessKeyId } : {}) },
  });
}

export async function createExport(input: ExportInput) {
  const accessKeyId = input.accessKeyId ?? null;
  const requestedVariantIds = [...new Set(input.variantIds)];
  const variants = await fetchVariants(requestedVariantIds, accessKeyId);

  if (variants.length !== requestedVariantIds.length) {
    throw new Error("没有可导出的变体");
  }

  const requestedAssetIds = [...new Set(input.assetIds ?? [])];
  const assets = await fetchAssets(requestedAssetIds, accessKeyId);
  if (assets.length !== requestedAssetIds.length) {
    throw new Error("One or more product assets are unavailable for export.");
  }

  const storageDir = join(
    env.STORAGE_ROOT ?? "./storage",
    scopedStorageRelativePath("hero-scene", accessKeyId, "exports"),
  );
  if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });

  const safeProductName = sanitizeFileName(input.productName || "商品");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipFileName = `${safeProductName}-${timestamp}.zip`;
  const zipFilePath = join(storageDir, zipFileName);

  const archive = new ZipArchive({ zlib: { level: 9 } });
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
        await appendVariantImages(archive, variants, basePath, manifest.images, accessKeyId);
        if (assets.length > 0) {
          await appendAssetImages(archive, assets, basePath, manifest.assets, accessKeyId);
        }
      }
    }
  } else {
    await appendVariantImages(archive, variants, "", manifest.images, accessKeyId);
    if (assets.length > 0) {
      await appendAssetImages(archive, assets, "素材图", manifest.assets, accessKeyId);
    }
  }

  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

  await archive.finalize();

  const exportRecord = await prisma.heroSceneExport.create({
    data: {
      productName: input.productName,
      accessKeyId,
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

export async function getAllExports(accessKeyId: string | null = null) {
  return prisma.heroSceneExport.findMany({
    where: accessKeyId ? { accessKeyId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { items: { include: { variant: true } } },
  });
}

export async function getExportById(id: string, accessKeyId: string | null = null) {
  return prisma.heroSceneExport.findFirst({
    where: { id, ...(accessKeyId ? { accessKeyId } : {}) },
    include: { items: { include: { variant: true } } },
  });
}

export async function deleteExport(id: string, accessKeyId: string | null = null) {
  const exportRecord = await getExportById(id, accessKeyId);
  if (!exportRecord) return null;
  return prisma.heroSceneExport.delete({ where: { id } });
}
