import type { PageSection, ProductAsset } from "@prisma/client";

export const MAX_MODEL_REFERENCE_IMAGES = 6;
const OPTIONAL_SQUARE_MODULE_TYPES = new Set(["INGREDIENTS_TABLE", "WHITE_BG_PRODUCT", "SPECS"]);

export type ReferenceAssetRecord = Pick<
  ProductAsset,
  | "id"
  | "filePath"
  | "fileName"
  | "mimeType"
  | "type"
  | "isMain"
  | "variantId"
  | "sortOrder"
  | "createdAt"
>;

export type ModelReferenceRole = "product" | "style_anchor" | "template" | "neighbor";

export interface ModelReferenceInputCandidate {
  key: string;
  role: ModelReferenceRole;
  assetId: string | null;
  fileName: string;
  type: string | null;
  url: string | null;
  pending?: boolean;
}

type ReferenceSection = Pick<PageSection, "type" | "editableData">;

export interface SectionReferenceResolution<TAsset extends ReferenceAssetRecord = ReferenceAssetRecord> {
  variantScope: "base" | "variant" | "group";
  effectiveAssetPool: TAsset[];
  effectiveReferenceAssets: TAsset[];
  modelProductAssets: TAsset[];
  packagingAssets: TAsset[];
  includePackaging: boolean;
  usesLocalPackagingComposite: boolean;
}

function uniqueAssets<TAsset extends Pick<ProductAsset, "id">>(assets: TAsset[]): TAsset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    if (seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });
}

export function orderAssetsByIds<TAsset extends Pick<ProductAsset, "id">>(
  assets: TAsset[],
  assetIds: string[],
): TAsset[] {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  return uniqueAssets(assetIds.map((id) => assetById.get(id)).filter((asset): asset is TAsset => Boolean(asset)));
}

function pickPrimaryProductAsset<TAsset extends ReferenceAssetRecord>(projectAssets: TAsset[]) {
  return (
    projectAssets.find((asset) => asset.isMain && ["MAIN", "ANGLE", "DETAIL"].includes(asset.type)) ??
    projectAssets.find((asset) => asset.type === "MAIN") ??
    projectAssets.find((asset) => ["ANGLE", "DETAIL"].includes(asset.type)) ??
    null
  );
}

function mergeReferenceAssets<TAsset extends ReferenceAssetRecord>(
  projectAssets: TAsset[],
  explicitReferenceAssets: TAsset[],
) {
  const primaryAsset = pickPrimaryProductAsset(projectAssets);
  return uniqueAssets([primaryAsset, ...explicitReferenceAssets].filter((asset): asset is TAsset => Boolean(asset)));
}

function reorderAssetsForSection<TAsset extends ReferenceAssetRecord>(sectionType: string, assets: TAsset[]): TAsset[] {
  if (sectionType !== "PACKAGING") return assets;
  const physicalProduct = assets.filter((asset) => ["MAIN", "ANGLE", "DETAIL"].includes(asset.type));
  const packaging = assets.filter((asset) => asset.type === "PACKAGING");
  const supporting = assets.filter(
    (asset) => !["MAIN", "ANGLE", "DETAIL", "PACKAGING"].includes(asset.type),
  );
  return packaging.length > 0 ? [...physicalProduct, ...packaging, ...supporting] : assets;
}

export function resolveIncludePackaging(section: ReferenceSection): boolean {
  const controls = ((section.editableData as Record<string, unknown> | null) ?? {}).controls as
    | Record<string, unknown>
    | undefined;
  if (typeof controls?.includePackaging === "boolean") return controls.includePackaging;
  return section.type === "PACKAGING";
}

function prepareReferenceAssetsForSection<TAsset extends ReferenceAssetRecord>(
  sectionType: string,
  projectAssets: TAsset[],
  mergedAssets: TAsset[],
  includePackaging: boolean,
): TAsset[] {
  if (sectionType !== "PACKAGING" && !includePackaging) {
    return mergedAssets.filter((asset) => asset.type !== "PACKAGING");
  }

  const reordered = reorderAssetsForSection(sectionType, mergedAssets);
  const existingIds = new Set(reordered.map((asset) => asset.id));
  const missingPackaging = projectAssets.filter(
    (asset) => asset.type === "PACKAGING" && !existingIds.has(asset.id),
  );
  return [...reordered, ...missingPackaging];
}

function pickGroupAsset<TAsset extends ReferenceAssetRecord>(assets: TAsset[]): TAsset | null {
  return (
    assets.find((asset) => asset.type === "PACKAGING") ??
    assets.find((asset) => asset.type === "MAIN") ??
    assets.find((asset) => ["ANGLE", "DETAIL"].includes(asset.type)) ??
    null
  );
}

export function selectGroupReferenceAssets<TAsset extends ReferenceAssetRecord>(
  variantIds: string[],
  assetPool: TAsset[],
  fallbackPool: TAsset[] = [],
  explicitReferenceAssets: TAsset[] = [],
): TAsset[] {
  const selected: TAsset[] = [];
  for (const variantId of variantIds) {
    const explicitForVariant = explicitReferenceAssets.filter((asset) => asset.variantId === variantId);
    const variantAssets = assetPool.filter((asset) => asset.variantId === variantId);
    const baseExplicit = explicitReferenceAssets.filter((asset) => asset.variantId == null);
    const baseFallback = fallbackPool.filter((asset) => asset.variantId == null);
    const pick =
      pickGroupAsset(explicitForVariant) ??
      pickGroupAsset(variantAssets) ??
      pickGroupAsset(baseExplicit) ??
      pickGroupAsset(baseFallback);
    if (pick) selected.push(pick);
  }
  return uniqueAssets(selected).slice(0, MAX_MODEL_REFERENCE_IMAGES);
}

export function resolveSectionReferenceAssets<TAsset extends ReferenceAssetRecord>(params: {
  section: ReferenceSection;
  projectAssets: TAsset[];
  explicitReferenceAssets?: TAsset[];
}): SectionReferenceResolution<TAsset> {
  const editableData = (params.section.editableData ?? {}) as Record<string, unknown>;
  const rawScope = editableData.variantScope;
  const variantScope = rawScope === "variant" || rawScope === "group" ? rawScope : "base";
  const variantId = typeof editableData.variantId === "string" ? editableData.variantId : null;
  const variantIds = Array.isArray(editableData.variantIds)
    ? editableData.variantIds.filter((id): id is string => typeof id === "string")
    : [];

  const candidateAssets =
    variantScope === "variant" && variantId
      ? params.projectAssets.filter((asset) => asset.variantId === variantId)
      : variantScope === "group" && variantIds.length > 0
        ? params.projectAssets.filter((asset) => Boolean(asset.variantId && variantIds.includes(asset.variantId)))
        : params.projectAssets.filter((asset) => asset.variantId == null);

  const effectiveAssetPool =
    variantScope === "base" && candidateAssets.length === 0 ? params.projectAssets : candidateAssets;
  const explicitReferenceAssets = uniqueAssets(params.explicitReferenceAssets ?? []);
  const includePackaging = resolveIncludePackaging(params.section);

  if (variantScope === "group") {
    const groupReferences = selectGroupReferenceAssets(
      variantIds,
      effectiveAssetPool,
      params.projectAssets,
      explicitReferenceAssets,
    );
    return {
      variantScope,
      effectiveAssetPool,
      effectiveReferenceAssets: groupReferences,
      modelProductAssets: groupReferences,
      packagingAssets: [],
      includePackaging,
      usesLocalPackagingComposite: false,
    };
  }

  let effectiveReferenceAssets = prepareReferenceAssetsForSection(
    params.section.type,
    effectiveAssetPool,
    mergeReferenceAssets(effectiveAssetPool, explicitReferenceAssets),
    includePackaging,
  );

  if (isOptionalSquareModule(params.section.type) && explicitReferenceAssets.length === 0) {
    const firstAsset = [...effectiveAssetPool].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    )[0];
    if (firstAsset) effectiveReferenceAssets = [firstAsset];
  }

  const packagingAssets = effectiveReferenceAssets.filter((asset) => asset.type === "PACKAGING");

  return {
    variantScope,
    effectiveAssetPool,
    effectiveReferenceAssets,
    modelProductAssets: effectiveReferenceAssets,
    packagingAssets,
    includePackaging,
    usesLocalPackagingComposite: false,
  };
}

export function isOptionalSquareModule(sectionType: string) {
  return OPTIONAL_SQUARE_MODULE_TYPES.has(sectionType);
}

export function selectModelReferenceInputs<TInput extends ModelReferenceInputCandidate>(params: {
  productInputs: TInput[];
  styleAnchorInput?: TInput | null;
  templateInput?: TInput | null;
  neighborInputs?: TInput[];
  maxImages?: number;
}): TInput[] {
  const maxImages = params.maxImages ?? MAX_MODEL_REFERENCE_IMAGES;
  const reservedSlots = (params.styleAnchorInput ? 1 : 0) + (params.templateInput ? 1 : 0);
  const selectedProducts = params.productInputs.slice(0, Math.max(0, maxImages - reservedSlots));
  const fixedInputs = [params.styleAnchorInput, params.templateInput].filter(
    (input): input is TInput => Boolean(input),
  );
  const remainingSlots = Math.max(0, maxImages - selectedProducts.length - fixedInputs.length);
  return [
    ...selectedProducts,
    ...fixedInputs,
    ...(params.neighborInputs ?? []).slice(0, remainingSlots),
  ];
}

export function referenceInputSignature(inputs: ModelReferenceInputCandidate[]): string {
  return inputs.map((input) => `${input.role}:${input.assetId ?? input.url ?? input.key}`).join("|");
}

export function productReferenceInputSignature(inputs: ModelReferenceInputCandidate[]): string {
  return referenceInputSignature(inputs.filter((input) => input.role === "product"));
}

export function areProductReferenceInputsConfirmed(
  plannedProductInputs: ModelReferenceInputCandidate[],
  actualInputs: ModelReferenceInputCandidate[],
): boolean {
  const actualProductInputs = actualInputs.filter((input) => input.role === "product");
  return (
    actualProductInputs.length > 0 &&
    referenceInputSignature(plannedProductInputs.slice(0, actualProductInputs.length)) ===
      referenceInputSignature(actualProductInputs)
  );
}
