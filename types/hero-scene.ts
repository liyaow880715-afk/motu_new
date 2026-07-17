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

export interface HeroSceneExportRecord {
  id: string;
  productName: string;
  zipFilePath: string;
  variantCount: number;
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
