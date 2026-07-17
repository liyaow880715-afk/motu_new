import { existsSync, mkdirSync, createWriteStream } from "fs";
import { join } from "path";
import archiver from "archiver";

import { prisma } from "@/lib/db/prisma";
import { readStorageFile } from "@/lib/storage/asset-manager";
import { env } from "@/lib/utils/env";
import { sanitizeFileName } from "@/lib/utils/files";

export async function createExport(input: {
  productName: string;
  variantIds: string[];
}) {
  const variants = await prisma.heroSceneVariant.findMany({
    where: { id: { in: input.variantIds }, status: "COMPLETED" },
    include: { generation: { include: { sceneLibrary: true } } },
  });

  if (variants.length === 0) {
    throw new Error("没有可导出的变体");
  }

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
    images: [] as Array<{ order: number; fileName: string; scene: string; copyText: string; layoutStyle: string }>,
  };

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (!variant.variantImageUrl) continue;

    const match = variant.variantImageUrl.match(/\/api\/files\/(.*)$/);
    if (!match) continue;

    const buffer = await readStorageFile(match[1]);
    const order = i + 1;
    const fileName = `${String(order).padStart(3, "0")}-${sanitizeFileName(variant.copyText || "主图")}.png`;

    archive.append(buffer, { name: fileName });
    manifest.images.push({
      order,
      fileName,
      scene: variant.generation.sceneLibrary?.name || "默认场景",
      copyText: variant.copyText,
      layoutStyle: variant.layoutStyle,
    });
  }

  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

  await archive.finalize();

  const exportRecord = await prisma.heroSceneExport.create({
    data: {
      productName: input.productName,
      zipFilePath: `/api/files/hero-scene/exports/${zipFileName}`,
      variantCount: variants.length,
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
