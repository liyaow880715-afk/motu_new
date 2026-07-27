export const PRODUCT_ANALYSIS_MAX_IMAGES = 6;
export const PRODUCT_ANALYSIS_MAX_DATA_URL_CHARS = 1_200_000;

const PRODUCT_ANALYSIS_MAX_DIMENSION = 2048;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to decode ${file.name}.`));
    };
    image.src = objectUrl;
  });
}

function fitDimensions(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function renderJpeg(image: HTMLImageElement, width: number, height: number, quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");

  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function prepareProductAnalysisImage(file: File) {
  const mimeType = file.type.toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${file.type || "unknown"}`);
  }

  const image = await loadImage(file);
  const original = await readFileAsDataUrl(file);
  if (
    original.length <= PRODUCT_ANALYSIS_MAX_DATA_URL_CHARS &&
    Math.max(image.naturalWidth, image.naturalHeight) <= PRODUCT_ANALYSIS_MAX_DIMENSION
  ) {
    return original;
  }

  let smallest = original;
  for (const dimensionScale of [1, 0.85, 0.7, 0.55, 0.4]) {
    const dimensions = fitDimensions(
      image.naturalWidth,
      image.naturalHeight,
      Math.round(PRODUCT_ANALYSIS_MAX_DIMENSION * dimensionScale),
    );
    for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58]) {
      const candidate = renderJpeg(image, dimensions.width, dimensions.height, quality);
      if (candidate.length < smallest.length) smallest = candidate;
      if (candidate.length <= PRODUCT_ANALYSIS_MAX_DATA_URL_CHARS) return candidate;
    }
  }

  return smallest;
}
