export type WorkflowStatus = "PENDING" | "RUNNING" | "REVIEW_REQUIRED" | "COMPLETED" | "FAILED";

export type WorkflowStage =
  | "EXTRACT"
  | "STRATEGY"
  | "WHITE_BG"
  | "SCENES"
  | "COPIES"
  | "VARIANTS"
  | "ASSETS"
  | "REVIEW"
  | "EXPORT";

export interface WorkflowExtractData {
  productName: string;
  productDescription?: string;
  category?: string;
  specs: Array<{ label: string; value: string }>;
  ingredients: string[];
  nutritionRows: Array<{ label: string; value: string; unit: string }>;
}

export interface WorkflowStoreLink {
  name: string;
  links: string[];
}

export interface WorkflowStrategyData {
  sceneIds: string[];
  layouts: string[];
  copyStyles: string[];
  copyCount: number;
  assetTypes: string[];
  stores: WorkflowStoreLink[];
}

export interface WorkflowSceneItem {
  generationId: string;
  sceneId: string;
  sceneName: string;
  imageUrl?: string;
  status: string;
  errorMessage?: string;
}

export interface WorkflowCopyItem {
  copyText: string;
  subCopyText?: string;
  tags: string[];
}

export interface WorkflowVariantItem {
  variantId: string;
  generationId: string;
  copyText: string;
  layoutStyle: string;
  imageUrl?: string;
  status: string;
  errorMessage?: string;
}

export interface WorkflowAssetItem {
  assetId: string;
  type: string;
  imageUrl: string;
}

export interface WorkflowReviewIssue {
  type: "compliance" | "quality" | "consistency" | "text";
  target: string;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface WorkflowReviewData {
  score: number;
  passed: boolean;
  issues: WorkflowReviewIssue[];
}

export interface WorkflowExportData {
  exportRecordId: string;
  zipFilePath: string;
  variantCount: number;
}

export interface WorkflowStageData {
  extract?: WorkflowExtractData;
  strategy?: WorkflowStrategyData;
  whiteBg?: { imageUrl: string };
  scenes?: WorkflowSceneItem[];
  copies?: WorkflowCopyItem[];
  variants?: WorkflowVariantItem[];
  assets?: WorkflowAssetItem[];
  review?: WorkflowReviewData;
  export?: WorkflowExportData;
}

export interface HeroWorkflowRecord {
  id: string;
  productName: string;
  sourceImageUrl: string;
  status: WorkflowStatus;
  currentStage: WorkflowStage;
  stageData: WorkflowStageData;
  config?: Record<string, unknown>;
  reviewResult?: WorkflowReviewData;
  exportRecordId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
