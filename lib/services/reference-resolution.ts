import type { PageSection, ProductAsset } from "@prisma/client";

export const MAX_MODEL_REFERENCE_IMAGES = 6;
const OPTIONAL_SQUARE_MODULE_TYPES = new Set(["INGREDIENTS_TABLE", "WHITE_BG_PRODUCT", "SPECS"]);
const AUTOMATIC_PRODUCT_REFERENCE_TYPES = new Set([
  "MAIN",
  "ANGLE",
  "DETAIL",
  "PACKAGING",
  "NUTRITION",
  "INGREDIENT",
]);

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
  | "metadata"
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

type ReferenceSection = Pick<PageSection, "type" | "editableData"> &
  Partial<Pick<PageSection, "title" | "goal" | "copy" | "visualPrompt">>;

const CROSS_SECTION_CUES =
  /横切面|剖面|切面|露馅|馅料(?:特写|截面|剖面)|(?:商品|产品|食品|饺子|包子|馅饼|糕点|面包).{0,8}(?:切开|剖开)|(?:切开|剖开).{0,8}(?:商品|产品|食品|饺子|包子|馅饼|糕点|面包)|cross[- ]?section|cutaway|cut[- ]?open\s+(?:product|food|dumpling)|opened\s+(?:product|dumpling)|exposed\s+filling/i;
const NUTRITION_EVIDENCE_CUES = /营养|营养成分|成分表|nutrition/i;
const INGREDIENT_EVIDENCE_CUES = /配料|成分|食材|原料|配方|过敏原|ingredient|formula|allergen/i;

export interface SectionReferenceResolution<TAsset extends ReferenceAssetRecord = ReferenceAssetRecord> {
  variantScope: "base" | "variant" | "group";
  effectiveAssetPool: TAsset[];
  effectiveReferenceAssets: TAsset[];
  modelProductAssets: TAsset[];
  authoritativeCrossSectionAssetIds: string[];
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

function referenceContentKey(asset: ReferenceAssetRecord) {
  const metadata = (asset.metadata as Record<string, unknown> | null) ?? {};
  if (typeof metadata.sha256 === "string" && metadata.sha256.trim()) {
    return `sha256:${metadata.sha256.trim().toLowerCase()}`;
  }
  return typeof metadata.bytes === "number" && asset.fileName
    ? `legacy:${asset.fileName.toLowerCase()}:${metadata.bytes}`
    : `asset:${asset.id}`;
}

function uniqueReferenceContents<TAsset extends ReferenceAssetRecord>(assets: TAsset[]): TAsset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = referenceContentKey(asset);
    if (seen.has(key)) return false;
    seen.add(key);
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

function getSectionReferenceSearchText(section: ReferenceSection): string {
  const editableData = (section.editableData ?? {}) as Record<string, unknown>;
  const commerceBrief =
    editableData.commerceBrief && typeof editableData.commerceBrief === "object"
      ? (editableData.commerceBrief as Record<string, unknown>)
      : {};
  return [
    section.type,
    section.title,
    section.goal,
    section.copy,
    section.visualPrompt,
    editableData.visualDescription,
    editableData.mainTitle,
    editableData.subTitle,
    commerceBrief.proofDevice,
    commerceBrief.singleClaim,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export function sectionRequestsCrossSection(section: ReferenceSection): boolean {
  return CROSS_SECTION_CUES.test(getSectionReferenceSearchText(section));
}

function sectionRequestsNutritionEvidence(section: ReferenceSection): boolean {
  return ["INGREDIENTS_TABLE", "SPECS", "PACKAGING"].includes(section.type) ||
    NUTRITION_EVIDENCE_CUES.test(getSectionReferenceSearchText(section));
}

function sectionRequestsIngredientEvidence(section: ReferenceSection): boolean {
  return ["INGREDIENTS_TABLE", "SPECS", "PACKAGING"].includes(section.type) ||
    INGREDIENT_EVIDENCE_CUES.test(getSectionReferenceSearchText(section));
}

function sectionRequestsStructuredEvidence(section: ReferenceSection): boolean {
  return sectionRequestsNutritionEvidence(section) || sectionRequestsIngredientEvidence(section);
}

function isNamedCrossSectionAsset(asset: ReferenceAssetRecord): boolean {
  return CROSS_SECTION_CUES.test(asset.fileName);
}

function isPhysicalReferenceAsset(asset: ReferenceAssetRecord): boolean {
  return ["MAIN", "ANGLE", "DETAIL"].includes(asset.type);
}

function selectAuthoritativeCrossSectionAsset<TAsset extends ReferenceAssetRecord>(assets: TAsset[]): TAsset | null {
  const physicalAssets = assets.filter(isPhysicalReferenceAsset);
  return physicalAssets.find(isNamedCrossSectionAsset) ?? physicalAssets[0] ?? null;
}

function orderPhysicalEvidenceAssets<TAsset extends ReferenceAssetRecord>(assets: TAsset[]): TAsset[] {
  return [...assets].sort((a, b) => {
    const cueDifference = Number(isNamedCrossSectionAsset(b)) - Number(isNamedCrossSectionAsset(a));
    if (cueDifference !== 0) return cueDifference;
    if (a.isMain !== b.isMain) return Number(b.isMain) - Number(a.isMain);
    return a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime();
  });
}

function mergeReferenceAssets<TAsset extends ReferenceAssetRecord>(
  section: ReferenceSection,
  projectAssets: TAsset[],
  explicitReferenceAssets: TAsset[],
  options?: { allowAutomaticCrossSectionEvidence?: boolean },
) {
  const authoritativeCrossSectionAsset = sectionRequestsCrossSection(section)
    ? selectAuthoritativeCrossSectionAsset(explicitReferenceAssets)
    : null;
  const explicitVariantIds = Array.from(
    new Set(
      (authoritativeCrossSectionAsset ? [authoritativeCrossSectionAsset] : explicitReferenceAssets)
        .map((asset) => asset.variantId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const preferredPrimaryPool =
    explicitVariantIds.length === 1
      ? projectAssets.filter((asset) => asset.variantId === explicitVariantIds[0])
      : projectAssets;
  const primaryPool = preferredPrimaryPool.length > 0 ? preferredPrimaryPool : projectAssets;
  const identityPool = authoritativeCrossSectionAsset
    ? primaryPool.filter(
        (asset) => asset.id !== authoritativeCrossSectionAsset.id && !isNamedCrossSectionAsset(asset),
      )
    : primaryPool;
  const primaryAsset = pickPrimaryProductAsset(identityPool);
  const physicalEvidenceAssets = orderPhysicalEvidenceAssets(
    projectAssets.filter((asset) => ["MAIN", "ANGLE", "DETAIL"].includes(asset.type)),
  );
  const automaticEvidenceAssets =
    sectionRequestsCrossSection(section) && options?.allowAutomaticCrossSectionEvidence !== false
      ? physicalEvidenceAssets
      : [];
  const structuredEvidenceAssets = projectAssets.filter(
    (asset) =>
      (asset.type === "NUTRITION" && sectionRequestsNutritionEvidence(section)) ||
      (asset.type === "INGREDIENT" && sectionRequestsIngredientEvidence(section)),
  );

  if (authoritativeCrossSectionAsset) {
    const explicitSupportingAssets = explicitReferenceAssets.filter((asset) => !isPhysicalReferenceAsset(asset));
    return uniqueAssets(
      [
        authoritativeCrossSectionAsset,
        primaryAsset,
        ...explicitSupportingAssets,
      ].filter((asset): asset is TAsset => Boolean(asset)),
    );
  }

  return uniqueAssets(
    [...explicitReferenceAssets, primaryAsset, ...automaticEvidenceAssets, ...structuredEvidenceAssets].filter(
      (asset): asset is TAsset => Boolean(asset),
    ),
  );
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
  const primaryVariantId = reordered.find((asset) => ["MAIN", "ANGLE", "DETAIL"].includes(asset.type))?.variantId ?? null;
  const missingPackagingCandidates = projectAssets.filter(
    (asset) =>
      asset.type === "PACKAGING" &&
      !existingIds.has(asset.id) &&
      (!primaryVariantId || asset.variantId == null || asset.variantId === primaryVariantId),
  );
  // A base section needs one representative real package, while PACKAGING and
  // group sections may intentionally carry every matching package. Keeping one
  // package here prevents unrelated multi-spec wrappers from crowding out the
  // product evidence slots before provider reference selection.
  const missingPackaging = sectionType === "PACKAGING"
    ? missingPackagingCandidates
    : missingPackagingCandidates.slice(0, 1);
  const withPackaging = [...reordered, ...missingPackaging];
  const packaging = withPackaging.filter((asset) => asset.type === "PACKAGING");
  const productEvidence = withPackaging.filter((asset) => asset.type !== "PACKAGING");

  // A visible package becomes the immutable edit base downstream, so keep it first.
  // This also makes the preview order match the actual model input order.
  return [...packaging, ...productEvidence];
}

function pickGroupAsset<TAsset extends ReferenceAssetRecord>(assets: TAsset[], includePackaging: boolean): TAsset | null {
  return (
    (includePackaging ? assets.find((asset) => asset.type === "PACKAGING") : null) ??
    assets.find((asset) => asset.type === "MAIN") ??
    assets.find((asset) => ["ANGLE", "DETAIL"].includes(asset.type)) ??
    (includePackaging ? null : assets.find((asset) => asset.type === "NUTRITION" || asset.type === "INGREDIENT")) ??
    null
  );
}

export function selectGroupReferenceAssets<TAsset extends ReferenceAssetRecord>(
  variantIds: string[],
  assetPool: TAsset[],
  fallbackPool: TAsset[] = [],
  explicitReferenceAssets: TAsset[] = [],
  options?: { includePackaging?: boolean; includeCrossSectionEvidence?: boolean },
): TAsset[] {
  const selected: TAsset[] = [];
  const includePackaging = options?.includePackaging ?? true;
  for (const variantId of variantIds) {
    const explicitForVariant = explicitReferenceAssets.filter((asset) => asset.variantId === variantId);
    const variantAssets = assetPool.filter((asset) => asset.variantId === variantId);
    const baseExplicit = explicitReferenceAssets.filter((asset) => asset.variantId == null);
    const baseFallback = fallbackPool.filter((asset) => asset.variantId == null);
    if (options?.includeCrossSectionEvidence) {
      const packagingAsset = includePackaging
        ? [...explicitForVariant, ...variantAssets, ...baseExplicit, ...baseFallback].find(
            (asset) => asset.type === "PACKAGING",
          ) ?? null
        : null;
      if (packagingAsset) selected.push(packagingAsset);

      const authoritativeAsset = selectAuthoritativeCrossSectionAsset(explicitForVariant);
      const physicalEvidence = orderPhysicalEvidenceAssets(
        uniqueAssets([...explicitForVariant, ...variantAssets]).filter((asset) =>
          isPhysicalReferenceAsset(asset),
        ),
      );
      const namedEvidence = physicalEvidence.find(isNamedCrossSectionAsset);
      const supportingEvidence = authoritativeAsset ?? namedEvidence ?? physicalEvidence[1] ?? physicalEvidence[0] ?? null;
      if (supportingEvidence) selected.push(supportingEvidence);

      if (!packagingAsset) {
        const identityAsset = pickPrimaryProductAsset(
          physicalEvidence.filter(
            (asset) => asset.id !== supportingEvidence?.id && !isNamedCrossSectionAsset(asset),
          ),
        );
        if (identityAsset) selected.push(identityAsset);
      }
      continue;
    }

    const pick =
      pickGroupAsset(explicitForVariant, includePackaging) ??
      pickGroupAsset(variantAssets, includePackaging) ??
      pickGroupAsset(baseExplicit, includePackaging) ??
      pickGroupAsset(baseFallback, includePackaging);
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
  const automaticProductAssets = params.projectAssets.filter((asset) =>
    AUTOMATIC_PRODUCT_REFERENCE_TYPES.has(asset.type),
  );

  const candidateAssets =
    variantScope === "variant" && variantId
      ? automaticProductAssets.filter((asset) => asset.variantId === variantId)
      : variantScope === "group" && variantIds.length > 0
        ? automaticProductAssets.filter((asset) => Boolean(asset.variantId && variantIds.includes(asset.variantId)))
        : automaticProductAssets.filter((asset) => asset.variantId == null);

  const effectiveAssetPool =
    variantScope === "base" && candidateAssets.length === 0 ? automaticProductAssets : candidateAssets;
  const explicitReferenceAssets = uniqueAssets(params.explicitReferenceAssets ?? []);
  const includePackaging = resolveIncludePackaging(params.section);
  const crossSectionRequested = sectionRequestsCrossSection(params.section);
  const authoritativeCrossSectionAssets = crossSectionRequested
    ? variantScope === "group"
      ? variantIds
          .map((id) =>
            selectAuthoritativeCrossSectionAsset(
              explicitReferenceAssets.filter((asset) => asset.variantId === id),
            ),
          )
          .filter((asset): asset is TAsset => Boolean(asset))
      : [selectAuthoritativeCrossSectionAsset(explicitReferenceAssets)].filter(
          (asset): asset is TAsset => Boolean(asset),
        )
    : [];
  const fallbackVariantIds = new Set(
    effectiveAssetPool
      .filter((asset) => ["MAIN", "ANGLE", "DETAIL", "PACKAGING"].includes(asset.type))
      .map((asset) => asset.variantId)
      .filter((id): id is string => Boolean(id)),
  );
  const ambiguousBaseVariantFallback =
    variantScope === "base" && candidateAssets.length === 0 && fallbackVariantIds.size > 1;

  if (variantScope === "group") {
    const resolvedGroupReferences = selectGroupReferenceAssets(
      variantIds,
      effectiveAssetPool,
      params.projectAssets,
      explicitReferenceAssets,
      {
        includePackaging,
        includeCrossSectionEvidence: crossSectionRequested,
      },
    );
    const groupReferences = crossSectionRequested
      ? resolvedGroupReferences
      : uniqueReferenceContents(resolvedGroupReferences);
    return {
      variantScope,
      effectiveAssetPool,
      effectiveReferenceAssets: groupReferences,
      modelProductAssets: groupReferences,
      authoritativeCrossSectionAssetIds: authoritativeCrossSectionAssets.map((asset) => asset.id),
      packagingAssets: groupReferences.filter((asset) => asset.type === "PACKAGING"),
      includePackaging,
      usesLocalPackagingComposite: false,
    };
  }

  let effectiveReferenceAssets = prepareReferenceAssetsForSection(
    params.section.type,
    params.projectAssets,
    mergeReferenceAssets(params.section, effectiveAssetPool, explicitReferenceAssets, {
      allowAutomaticCrossSectionEvidence:
        !ambiguousBaseVariantFallback && authoritativeCrossSectionAssets.length === 0,
    }),
    includePackaging,
  );
  if (!crossSectionRequested) {
    effectiveReferenceAssets = uniqueReferenceContents(effectiveReferenceAssets);
  }

  if (
    isOptionalSquareModule(params.section.type) &&
    explicitReferenceAssets.length === 0 &&
    !includePackaging &&
    !sectionRequestsStructuredEvidence(params.section)
  ) {
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
    authoritativeCrossSectionAssetIds: authoritativeCrossSectionAssets.map((asset) => asset.id),
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
