import sharp from "sharp";

import { readStorageFile } from "@/lib/storage/asset-manager";

export interface PackagingAssetInput {
  filePath: string;
}

export interface CompositePackagingOptions {
  sectionType: string;
  aspectRatio: "1:1" | "3:4" | "9:16";
  padding?: number;
}

async function loadBuffer(filePath: string): Promise<Buffer> {
  return readStorageFile(filePath);
}

async function trimPackagingBuffer(buffer: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  try {
    const trimmed = await sharp(buffer).trim({ threshold: 20 }).toBuffer();
    const meta = await sharp(trimmed).metadata();
    return { buffer: trimmed, width: meta.width ?? 0, height: meta.height ?? 0 };
  } catch {
    // trim may fail if image has no uniform border; fall back to original
    const meta = await sharp(buffer).metadata();
    return { buffer, width: meta.width ?? 0, height: meta.height ?? 0 };
  }
}

async function resizePreservingAspect(
  buffer: Buffer,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  return sharp(buffer)
    .resize(targetWidth, targetHeight, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

function computePlacement(
  baseWidth: number,
  baseHeight: number,
  overlayWidth: number,
  overlayHeight: number,
  sectionType: string,
  padding: number,
): { left: number; top: number } {
  const isPackagingSection = sectionType === "PACKAGING";

  if (isPackagingSection) {
    return {
      left: Math.round((baseWidth - overlayWidth) / 2),
      top: Math.round((baseHeight - overlayHeight) / 2),
    };
  }

  // Prop mode: place in lower-right corner by default, with safe padding
  const left = Math.max(padding, baseWidth - overlayWidth - padding);
  const top = Math.max(padding, baseHeight - overlayHeight - padding);
  return { left, top };
}

/**
 * Composite packaging assets onto a generated base image.
 *
 * For PACKAGING sections the first packaging asset is centered and sized to be
 * the hero of the image. For other sections it is placed as a small prop so it
 * does not distract from the main product.
 */
export async function compositePackagingOntoBase(
  baseBuffer: Buffer,
  packagingAssets: PackagingAssetInput[],
  options: CompositePackagingOptions,
): Promise<Buffer> {
  if (!packagingAssets.length) {
    return baseBuffer;
  }

  const baseMeta = await sharp(baseBuffer).metadata();
  const baseWidth = baseMeta.width ?? 1024;
  const baseHeight = baseMeta.height ?? 1024;
  const padding = options.padding ?? Math.round(Math.min(baseWidth, baseHeight) * 0.06);
  const isPackagingSection = options.sectionType === "PACKAGING";

  // Use only the first packaging asset for now to keep results predictable.
  const asset = packagingAssets[0];
  const rawBuffer = await loadBuffer(asset.filePath);
  const { buffer: trimmedBuffer, width: origWidth, height: origHeight } = await trimPackagingBuffer(rawBuffer);

  if (!origWidth || !origHeight) {
    return baseBuffer;
  }

  const maxRatio = isPackagingSection ? 0.75 : 0.32;
  const scale = Math.min(
    (baseWidth * maxRatio) / origWidth,
    (baseHeight * maxRatio) / origHeight,
    1,
  );
  const targetWidth = Math.max(1, Math.round(origWidth * scale));
  const targetHeight = Math.max(1, Math.round(origHeight * scale));

  const resized = await resizePreservingAspect(trimmedBuffer, targetWidth, targetHeight);
  const resizedMeta = await sharp(resized).metadata();
  const overlayWidth = resizedMeta.width ?? targetWidth;
  const overlayHeight = resizedMeta.height ?? targetHeight;

  const { left, top } = computePlacement(baseWidth, baseHeight, overlayWidth, overlayHeight, options.sectionType, padding);

  // Simple drop shadow: blur a black copy of the packaging and place it slightly offset.
  const shadowOffset = Math.round(Math.min(overlayWidth, overlayHeight) * 0.04);
  const shadowBlur = Math.round(Math.min(overlayWidth, overlayHeight) * 0.08);
  const shadowSigma = Math.max(1, shadowBlur / 2);

  let shadowBuffer: Buffer | undefined;
  try {
    shadowBuffer = await sharp(resized)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        const pixelCount = info.width * info.height;
        const shadowData = Buffer.alloc(pixelCount * 4);
        for (let i = 0; i < pixelCount; i++) {
          const alpha = data[i * 4 + 3];
          shadowData[i * 4] = 0;
          shadowData[i * 4 + 1] = 0;
          shadowData[i * 4 + 2] = 0;
          shadowData[i * 4 + 3] = Math.round(alpha * 0.35);
        }
        return sharp(shadowData, { raw: { width: info.width, height: info.height, channels: 4 } })
          .png()
          .blur(shadowSigma)
          .toBuffer();
      });
  } catch (error) {
    console.error("[compositePackagingOntoBase] Failed to create shadow:", error);
  }

  const composites: sharp.OverlayOptions[] = [];
  if (shadowBuffer) {
    composites.push({
      input: shadowBuffer,
      left: left + shadowOffset,
      top: top + shadowOffset,
      blend: "over",
    });
  }
  composites.push({
    input: resized,
    left,
    top,
    blend: "over",
  });

  return sharp(baseBuffer).composite(composites).png().toBuffer();
}

/**
 * Convert a generated image result to a PNG buffer for local processing.
 */
export async function generationResultToBuffer(result: {
  url?: string | null;
  b64Json?: string | null;
  svgText?: string | null;
  mimeType?: string | null;
}): Promise<Buffer> {
  if (result.b64Json) {
    return Buffer.from(result.b64Json, "base64");
  }

  if (result.svgText) {
    return sharp(Buffer.from(result.svgText, "utf-8")).png().toBuffer();
  }

  if (result.url) {
    const response = await fetch(result.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch generated image: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error("No image data available in generation result");
}
