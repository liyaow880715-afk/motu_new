import sharp, { type OverlayOptions } from "sharp";

import { readStorageFile } from "@/lib/storage/asset-manager";

export interface PackagingAssetInput {
  filePath: string;
}

export interface CompositePackagingOptions {
  sectionType: string;
  aspectRatio: "1:1" | "3:4" | "9:16";
  padding?: number;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

async function loadBuffer(filePath: string): Promise<Buffer> {
  return readStorageFile(filePath);
}

function toHex(color: RgbColor): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/**
 * Sample the average color of the four corners. JPEG / screenshot packaging
 * images often have a white or near-white border with compression noise, so we
 * use the sampled color (instead of a fixed white) as the trim background.
 */
async function sampleCornerBackground(buffer: Buffer): Promise<RgbColor | null> {
  try {
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return null;

    const size = Math.max(2, Math.min(12, Math.floor(Math.min(width, height) * 0.02)));
    const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const corners: Array<[number, number]> = [
      [0, 0],
      [Math.max(0, width - size), 0],
      [0, Math.max(0, height - size)],
      [Math.max(0, width - size), Math.max(0, height - size)],
    ];

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (const [cx, cy] of corners) {
      for (let y = cy; y < Math.min(height, cy + size); y++) {
        for (let x = cx; x < Math.min(width, cx + size); x++) {
          const index = (y * width + x) * channels;
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          count++;
        }
      }
    }
    if (!count) return null;
    return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
  } catch {
    return null;
  }
}

/**
 * Remove residual background-colored pixels along the outer ring of the image.
 * This cleans up the thin white/gray frame that trim() leaves behind.
 */
async function defringeEdges(buffer: Buffer, background: RgbColor, ring = 2, tolerance = 46): Promise<Buffer> {
  try {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const out = Buffer.from(data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const inRing = x < ring || y < ring || x >= width - ring || y >= height - ring;
        if (!inRing) continue;
        const index = (y * width + x) * 4;
        const dr = data[index] - background.r;
        const dg = data[index + 1] - background.g;
        const db = data[index + 2] - background.b;
        const distance = Math.sqrt(dr * dr + dg * dg + db * db);
        if (distance <= tolerance) {
          out[index + 3] = 0;
        }
      }
    }

    return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
  } catch {
    return buffer;
  }
}

/** Slightly blur the alpha channel to soften hard cutout edges. */
async function featherAlpha(buffer: Buffer, sigma = 0.6): Promise<Buffer> {
  try {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const pixelCount = width * height;
    const rgb = Buffer.alloc(pixelCount * 3);
    const alpha = Buffer.alloc(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      rgb[i * 3] = data[i * 4];
      rgb[i * 3 + 1] = data[i * 4 + 1];
      rgb[i * 3 + 2] = data[i * 4 + 2];
      alpha[i] = data[i * 4 + 3];
    }
    const blurredAlpha = await sharp(alpha, { raw: { width, height, channels: 1 } }).blur(sigma).toBuffer();
    return sharp(rgb, { raw: { width, height, channels: 3 } }).joinChannel(blurredAlpha).png().toBuffer();
  } catch {
    return buffer;
  }
}

async function trimPackagingBuffer(buffer: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(buffer).metadata().catch(() => null);
  const hasAlpha = Boolean(meta?.hasAlpha);

  const measure = async (buf: Buffer) => {
    const m = await sharp(buf).metadata();
    return { width: m.width ?? 0, height: m.height ?? 0 };
  };

  // 1) Transparent PNG/WebP: trust the alpha channel, only trim transparent border.
  if (hasAlpha) {
    try {
      const trimmed = await sharp(buffer).trim({ threshold: 10 }).toBuffer();
      const { width, height } = await measure(trimmed);
      if (width > 4 && height > 4) {
        return { buffer: trimmed, width, height };
      }
    } catch {
      // fall through to generic handling
    }
  }

  // 2) Opaque images (JPG / screenshots): sample corner background and trim it.
  const background = (await sampleCornerBackground(buffer)) ?? { r: 255, g: 255, b: 255 };
  const backgroundHex = toHex(background);
  for (const threshold of [35, 55]) {
    try {
      const trimmed = await sharp(buffer).trim({ background: backgroundHex, threshold }).toBuffer();
      const { width, height } = await measure(trimmed);
      if (width > 4 && height > 4) {
        const defringed = await defringeEdges(trimmed, background);
        const feathered = await featherAlpha(defringed);
        const finalMeta = await measure(feathered);
        return { buffer: feathered, width: finalMeta.width || width, height: finalMeta.height || height };
      }
    } catch {
      // try next threshold
    }
  }

  // 3) Fallback: default trim, then original buffer.
  try {
    const trimmed = await sharp(buffer).trim({ threshold: 20 }).toBuffer();
    const { width, height } = await measure(trimmed);
    if (width > 4 && height > 4) {
      return { buffer: trimmed, width, height };
    }
  } catch {
    // ignore
  }

  const { width, height } = await measure(buffer);
  return { buffer, width, height };
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

/**
 * Soft elliptical contact shadow placed under the packaging so the asset feels
 * grounded instead of floating or stamped onto the background.
 */
async function createContactShadow(overlayWidth: number, overlayHeight: number): Promise<{ buffer: Buffer; width: number; height: number }> {
  const width = Math.max(8, Math.round(overlayWidth * 0.8));
  const height = Math.max(6, Math.round(overlayHeight * 0.07));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="black" fill-opacity="0.22"/></svg>`;
  const blurred = await sharp(Buffer.from(svg))
    .png()
    .blur(Math.max(4, Math.round(height / 2)))
    .toBuffer();
  return { buffer: blurred, width, height };
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
    // Keep the packaging inside a reserved central band so it does not overlap
    // the section title at the top or the info card at the bottom.
    const regionTop = baseHeight * 0.2;
    const regionBottom = baseHeight * 0.82;
    const regionHeight = Math.max(overlayHeight, regionBottom - regionTop);
    return {
      left: Math.round((baseWidth - overlayWidth) / 2),
      top: Math.round(regionTop + Math.max(0, (regionHeight - overlayHeight) / 2)),
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
interface PreparedOverlay {
  buffer: Buffer;
  width: number;
  height: number;
}

async function prepareOverlay(
  filePath: string,
  baseWidth: number,
  baseHeight: number,
  maxWidthRatio: number,
  maxHeightRatio: number,
): Promise<PreparedOverlay | null> {
  const rawBuffer = await loadBuffer(filePath);
  const { buffer: trimmedBuffer, width: origWidth, height: origHeight } = await trimPackagingBuffer(rawBuffer);
  if (!origWidth || !origHeight) return null;

  const scale = Math.min(
    (baseWidth * maxWidthRatio) / origWidth,
    (baseHeight * maxHeightRatio) / origHeight,
    1,
  );
  const targetWidth = Math.max(1, Math.round(origWidth * scale));
  const targetHeight = Math.max(1, Math.round(origHeight * scale));

  const resized = await resizePreservingAspect(trimmedBuffer, targetWidth, targetHeight);
  const resizedMeta = await sharp(resized).metadata();
  return {
    buffer: resized,
    width: resizedMeta.width ?? targetWidth,
    height: resizedMeta.height ?? targetHeight,
  };
}

async function appendWithContactShadow(
  composites: OverlayOptions[],
  overlay: PreparedOverlay,
  left: number,
  top: number,
): Promise<void> {
  try {
    const shadow = await createContactShadow(overlay.width, overlay.height);
    composites.push({
      input: shadow.buffer,
      left: Math.round(left + (overlay.width - shadow.width) / 2),
      top: Math.round(top + overlay.height - shadow.height * 0.55),
      blend: "over",
    });
  } catch (error) {
    console.error("[compositePackagingOntoBase] Failed to create contact shadow:", error);
  }
  composites.push({ input: overlay.buffer, left, top, blend: "over" });
}

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

  const composites: OverlayOptions[] = [];

  if (isPackagingSection && packagingAssets.length > 1) {
    // Dual packaging mode: front + back (or two variants) side by side,
    // bottom-aligned inside the reserved central band.
    const overlays = (
      await Promise.all(
        packagingAssets.slice(0, 2).map((asset) => prepareOverlay(asset.filePath, baseWidth, baseHeight, 0.4, 0.52)),
      )
    ).filter((item): item is PreparedOverlay => Boolean(item));

    if (overlays.length > 0) {
      const gap = Math.round(baseWidth * 0.04);
      const combinedWidth = overlays.reduce((sum, item) => sum + item.width, 0) + gap * (overlays.length - 1);
      const maxCombined = baseWidth * 0.84;
      const shrink = combinedWidth > maxCombined ? maxCombined / combinedWidth : 1;

      const regionBottom = baseHeight * 0.8;
      let cursorX = Math.round((baseWidth - combinedWidth * shrink) / 2);
      for (const overlay of overlays) {
        const width = Math.round(overlay.width * shrink);
        const height = Math.round(overlay.height * shrink);
        const buffer = shrink < 1 ? await resizePreservingAspect(overlay.buffer, width, height) : overlay.buffer;
        const top = Math.round(regionBottom - height);
        await appendWithContactShadow(composites, { buffer, width, height }, cursorX, top);
        cursorX += width + gap;
      }
      return sharp(baseBuffer).composite(composites).png().toBuffer();
    }
    // fall through to single mode if overlays failed to load
  }

  // Single packaging mode (hero packaging or corner prop).
  const overlay = await prepareOverlay(
    packagingAssets[0].filePath,
    baseWidth,
    baseHeight,
    isPackagingSection ? 0.66 : 0.32,
    isPackagingSection ? 0.58 : 0.32,
  );
  if (!overlay) {
    return baseBuffer;
  }

  const { left, top } = computePlacement(baseWidth, baseHeight, overlay.width, overlay.height, options.sectionType, padding);
  await appendWithContactShadow(composites, overlay, left, top);

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
