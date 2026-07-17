export interface HeroSceneLibraryRecord {
  id: string;
  name: string;
  category: string;
  scenePrompt: string;
  aspectRatio: string;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HeroCopyLibraryRecord {
  id: string;
  name: string;
  category: string;
  copies: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HeroWhiteBgImageRecord {
  id: string;
  productName: string;
  sourceImageUrl: string;
  sourceHash: string | null;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

export type ProductAssetType = "white-bg" | "spec" | "ingredient" | "nutrition";

export interface HeroProductAssetRecord {
  id: string;
  productName: string;
  type: ProductAssetType;
  imageUrl: string;
  contentJson: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface HeroSceneGenerationRecord {
  id: string;
  productName: string;
  productDescription: string | null;
  sourceImageUrl: string;
  whiteBgImageUrl: string | null;
  sceneLibraryId: string;
  sceneLibrary?: HeroSceneLibraryRecord;
  generatedImageUrl: string | null;
  status: string;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface HeroSceneVariantRecord {
  id: string;
  generationId: string;
  generation?: HeroSceneGenerationRecord;
  copyText: string;
  subCopyText: string | null;
  layoutStyle: string;
  tags: string[];
  variantImageUrl: string | null;
  status: string;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreExportConfig {
  name: string;
  linkCount: number;
  imagesPerLink: number;
}

export interface HeroSceneExportRecord {
  id: string;
  productName: string;
  zipFilePath: string;
  variantCount: number;
  storeConfig: StoreExportConfig[] | null;
  assetIds: string[];
  createdAt: string;
}

export type LayoutStyle =
  | "title-top"
  | "title-bottom"
  | "title-left"
  | "title-right"
  | "center-tag";

export const LAYOUT_STYLES: { value: LayoutStyle; label: string }[] = [
  { value: "title-top", label: "标题在上" },
  { value: "title-bottom", label: "标题在下" },
  { value: "title-left", label: "标题在左" },
  { value: "title-right", label: "标题在右" },
  { value: "center-tag", label: "居中标题+标签" },
];

export const PRODUCT_ASSET_TYPES: { value: ProductAssetType; label: string }[] = [
  { value: "white-bg", label: "白底商品图" },
  { value: "spec", label: "规格图" },
  { value: "ingredient", label: "配料表" },
  { value: "nutrition", label: "成分表" },
];
