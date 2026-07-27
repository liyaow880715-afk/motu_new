export const MOTU_API_CONTRACT = "motu-api/v2";
export const COMMERCE_WORKFLOW_CONTRACT = "commerce-image-workflow/v2";

export const MOTU_CAPABILITIES = {
  signedSessions: true,
  projectOwnership: true,
  imageUploadValidation: true,
  imageUploadDeduplication: true,
  generationIdempotency: true,
  taskRecovery: true,
  chinesePrimaryPrompt: true,
  referenceInputAudit: true,
  humanApprovalGate: true,
} as const;
