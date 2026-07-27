import { createHash } from "crypto";

import sharp from "sharp";

import { ApiRouteError } from "@/lib/utils/route";

export const IMAGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const IMAGE_UPLOAD_MAX_BODY_BYTES = 80 * 1024 * 1024;
export const IMAGE_UPLOAD_MAX_PIXELS = 80_000_000;

const FORMAT_TO_MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

type SupportedImageFormat = keyof typeof FORMAT_TO_MIME;

export type ValidatedImageUpload = {
  buffer: Buffer;
  mimeType: (typeof FORMAT_TO_MIME)[SupportedImageFormat];
  sha256: string;
  width: number;
  height: number;
  format: SupportedImageFormat;
  hasAlpha: boolean;
};

function uploadError(code: string, message: string, details?: unknown, status = 400): never {
  throw new ApiRouteError(code, message, status, details);
}

export function assertImageUploadContentLength(request: Request) {
  const raw = request.headers.get("content-length");
  if (!raw) return;
  const contentLength = Number(raw);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    uploadError("INVALID_CONTENT_LENGTH", "Content-Length 无效。", { contentLength: raw });
  }
  if (contentLength > IMAGE_UPLOAD_MAX_BODY_BYTES) {
    uploadError(
      "UPLOAD_BODY_TOO_LARGE",
      `上传请求不能超过 ${IMAGE_UPLOAD_MAX_BODY_BYTES / 1024 / 1024}MB。`,
      { maxBytes: IMAGE_UPLOAD_MAX_BODY_BYTES, contentLength },
      413,
    );
  }
}

export function decodeStrictBase64(value: string) {
  if (!value || /\s/.test(value) || value.startsWith("data:")) {
    uploadError("INVALID_BASE64", "base64Data 必须是不含 Data URL 前缀或空白字符的标准 Base64。", undefined, 400);
  }

  const unpadded = value.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]+$/.test(unpadded) || unpadded.length % 4 === 1 || !/^={0,2}$/.test(value.slice(unpadded.length))) {
    uploadError("INVALID_BASE64", "base64Data 不是有效的标准 Base64。", undefined, 400);
  }

  const buffer = Buffer.from(value, "base64");
  if (buffer.toString("base64").replace(/=+$/, "") !== unpadded) {
    uploadError("INVALID_BASE64", "base64Data 解码校验失败。", undefined, 400);
  }
  return buffer;
}

export async function validateImageUpload(buffer: Buffer, claimedMimeType?: string | null): Promise<ValidatedImageUpload> {
  if (buffer.byteLength === 0) {
    uploadError("EMPTY_UPLOAD", "上传图片不能为空。");
  }
  if (buffer.byteLength > IMAGE_UPLOAD_MAX_BYTES) {
    uploadError(
      "UPLOAD_TOO_LARGE",
      `单张图片不能超过 ${IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024}MB。`,
      { maxBytes: IMAGE_UPLOAD_MAX_BYTES, actualBytes: buffer.byteLength },
      413,
    );
  }

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(buffer, { animated: false, limitInputPixels: IMAGE_UPLOAD_MAX_PIXELS }).metadata();
  } catch (error) {
    uploadError("INVALID_IMAGE", "图片无法解析，或像素总量超过安全限制。", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  const format = metadata.format as SupportedImageFormat | undefined;
  if (!format || !(format in FORMAT_TO_MIME)) {
    uploadError("UNSUPPORTED_IMAGE_FORMAT", "仅支持 JPEG、PNG 和 WebP 图片。", { detectedFormat: metadata.format ?? null });
  }
  if ((metadata.pages ?? 1) > 1) {
    uploadError("ANIMATED_IMAGE_NOT_ALLOWED", "不支持动画或多页图片。", { pages: metadata.pages });
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 1 || height < 1 || width * height > IMAGE_UPLOAD_MAX_PIXELS) {
    uploadError("INVALID_IMAGE_DIMENSIONS", "图片尺寸无效或像素总量超过安全限制。", {
      width,
      height,
      maxPixels: IMAGE_UPLOAD_MAX_PIXELS,
    });
  }

  const detectedMimeType = FORMAT_TO_MIME[format];
  const normalizedClaim = claimedMimeType?.split(";")[0]?.trim().toLowerCase();
  if (normalizedClaim && normalizedClaim !== detectedMimeType && !(normalizedClaim === "image/jpg" && format === "jpeg")) {
    uploadError("IMAGE_MIME_MISMATCH", "声明的 MIME 类型与图片实际格式不一致。", {
      claimedMimeType: normalizedClaim,
      detectedMimeType,
    });
  }

  return {
    buffer,
    mimeType: detectedMimeType,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    width,
    height,
    format,
    hasAlpha: Boolean(metadata.hasAlpha),
  };
}

export async function decodeAndValidateBase64Image(base64Data: string, claimedMimeType?: string | null) {
  return validateImageUpload(decodeStrictBase64(base64Data), claimedMimeType);
}
