export type SectionImageAspectRatio = "1:1" | "3:4" | "9:16";

export type ModuleTemplateEntry = {
  imageUrl: string;
  imageAssetId: string;
  aspectRatio: SectionImageAspectRatio;
};

type TemplateAsset = {
  id: string;
  metadata?: unknown;
};

const OPTIONAL_MODULE_TEMPLATE_TYPES = new Set(["INGREDIENTS_TABLE", "WHITE_BG_PRODUCT", "SPECS"]);

function isSectionImageAspectRatio(value: unknown): value is SectionImageAspectRatio {
  return value === "1:1" || value === "3:4" || value === "9:16";
}

export function getSectionAspectRatio(
  section: { type: string; editableData?: unknown },
  detailAspectRatio: "3:4" | "9:16",
): SectionImageAspectRatio {
  if (section.type === "HERO") return "1:1";

  const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
  const controls = editableData.controls as Record<string, unknown> | undefined;
  const pinned = controls?.aspectRatio;
  return isSectionImageAspectRatio(pinned) ? pinned : detailAspectRatio;
}

export function moduleTemplateKey(sectionType: string, aspectRatio: SectionImageAspectRatio) {
  return `${sectionType}:${aspectRatio}`;
}

export function shouldUseModuleTemplate(sectionType: string, aspectRatio: SectionImageAspectRatio) {
  return aspectRatio === "1:1" && OPTIONAL_MODULE_TEMPLATE_TYPES.has(sectionType);
}

function parseTemplateEntry(value: unknown): Omit<ModuleTemplateEntry, "aspectRatio"> & { aspectRatio?: SectionImageAspectRatio } | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.imageUrl !== "string" || typeof entry.imageAssetId !== "string") return null;

  return {
    imageUrl: entry.imageUrl,
    imageAssetId: entry.imageAssetId,
    aspectRatio: isSectionImageAspectRatio(entry.aspectRatio) ? entry.aspectRatio : undefined,
  };
}

function readAssetAspectRatio(assets: TemplateAsset[], imageAssetId: string) {
  const asset = assets.find((candidate) => candidate.id === imageAssetId);
  const metadata = (asset?.metadata as Record<string, unknown> | null) ?? {};
  return isSectionImageAspectRatio(metadata.aspectRatio) ? metadata.aspectRatio : null;
}

export function readModuleTemplate(
  snapshot: unknown,
  sectionType: string,
  aspectRatio: SectionImageAspectRatio,
  assets: TemplateAsset[] = [],
): ModuleTemplateEntry | null {
  const data = (snapshot as Record<string, unknown> | null) ?? {};
  const templates = data.moduleTemplates as Record<string, unknown> | undefined;
  if (!templates) return null;

  const scoped = parseTemplateEntry(templates[moduleTemplateKey(sectionType, aspectRatio)]);
  if (scoped && (!scoped.aspectRatio || scoped.aspectRatio === aspectRatio)) {
    return { ...scoped, aspectRatio };
  }

  // Legacy snapshots used sectionType only. Accept them only when their saved
  // asset metadata proves that the canvas ratio matches the requested section.
  const legacy = parseTemplateEntry(templates[sectionType]);
  if (!legacy) return null;
  const legacyAspectRatio = legacy.aspectRatio ?? readAssetAspectRatio(assets, legacy.imageAssetId);
  return legacyAspectRatio === aspectRatio ? { ...legacy, aspectRatio } : null;
}
