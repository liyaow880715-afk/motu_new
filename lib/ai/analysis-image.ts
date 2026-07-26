import sharp from "sharp";

import { readStorageFile } from "@/lib/storage/asset-manager";

type AnalysisImageAsset = {
  filePath: string;
  mimeType?: string | null;
};

export async function assetToAnalysisDataUrl(
  asset: AnalysisImageAsset,
  options?: { maxDimension?: number; quality?: number },
) {
  const source = await readStorageFile(asset.filePath);
  const maxDimension = options?.maxDimension ?? 1280;
  const quality = options?.quality ?? 84;

  try {
    const optimized = await sharp(source, { failOn: "none" })
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#FFFFFF" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    return `data:image/jpeg;base64,${optimized.toString("base64")}`;
  } catch {
    const mimeType = asset.mimeType ?? "image/png";
    return `data:${mimeType};base64,${source.toString("base64")}`;
  }
}
