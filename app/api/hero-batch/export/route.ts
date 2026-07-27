import { NextRequest } from "next/server";
import { z } from "zod";
import { ZipArchive } from "archiver";

import { resolveAccessKeyStoragePath } from "@/lib/storage/access-key-storage";
import { readStorageFile } from "@/lib/storage/asset-manager";
import { requireAuthenticatedAccessKeyId } from "@/lib/utils/api-auth";
import { sanitizeFileName } from "@/lib/utils/files";
import { handleRouteError, ok } from "@/lib/utils/route";

const exportSchema = z.object({
  imageUrls: z.array(z.string()).min(1, "没有可导出的图片"),
  productName: z.string().optional(),
  aspectRatio: z.string().optional(),
});

function parseHeroBatchFilePath(imageUrl: string): string | null {
  const match = imageUrl.match(/\/api\/files\/hero-batch\/([^/\\]+\.(?:png|jpe?g|webp))$/i);
  return match ? `hero-batch/${match[1]}` : null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const parsed = exportSchema.parse(await request.json());

    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));

    const safeProductName = sanitizeFileName(parsed.productName || "商品");
    const exportedAt = new Date().toISOString();

    const manifest = {
      productName: parsed.productName || "商品",
      aspectRatio: parsed.aspectRatio || "1:1",
      exportedAt,
      imageCount: parsed.imageUrls.length,
      images: [] as Array<{ order: number; fileName: string; originalUrl: string }>,
    };

    for (let i = 0; i < parsed.imageUrls.length; i++) {
      const imageUrl = parsed.imageUrls[i];
      const filePath = parseHeroBatchFilePath(imageUrl);
      if (!filePath) {
        throw new Error(`无法解析图片路径: ${imageUrl}`);
      }

      const buffer = await readStorageFile(resolveAccessKeyStoragePath(filePath, auth.accessKeyId));
      const order = i + 1;
      const fileName = `${String(order).padStart(2, "0")}-主图.png`;

      archive.append(buffer, { name: `主图/${fileName}` });
      manifest.images.push({ order, fileName, originalUrl: imageUrl });
    }

    archive.append(JSON.stringify(manifest, null, 2), { name: "export-manifest.json" });

    await archive.finalize();

    const zipBuffer = Buffer.concat(chunks);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const downloadName = `主图-${safeProductName}-${timestamp}.zip`;

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        // Use ASCII-only filename in the header; the frontend sets the actual
        // localized download name via the <a download="..."> attribute.
        "Content-Disposition": `attachment; filename="hero-batch.zip"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
