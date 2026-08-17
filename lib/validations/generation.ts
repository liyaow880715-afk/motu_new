import { z } from "zod";

export const generationRequestSchema = z.object({
  modelId: z.string().optional().nullable(),
  referenceAssetIds: z.array(z.string()).optional().default([]),
  editMode: z.enum(["repaint", "enhance"]).optional().default("repaint"),
  idempotencyKey: z.string().trim().min(12).max(200).optional(),
  continueAfterQualityWarning: z.boolean().optional().default(false),
  deferQualityReview: z.boolean().optional().default(false),
});
