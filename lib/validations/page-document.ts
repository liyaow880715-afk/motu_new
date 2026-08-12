import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());

const insertNodeSchema = z.object({
  stableId: z.string().min(6).max(120).optional(),
  parentStableId: z.string().min(1).nullable().default(null),
  nodeType: z.enum([
    "layout.container",
    "content.text",
    "content.image",
    "commerce.product_image",
    "commerce.generated_image",
    "layout.spacer",
    "layout.divider",
  ]),
  sortOrder: z.number().int().min(0),
  data: jsonRecordSchema.default({}),
});

export const pageDocumentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bootstrap") }),
  z.object({
    action: z.literal("sync_legacy"),
    expectedEditSequence: z.number().int().min(0),
    force: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("publish"),
    expectedEditSequence: z.number().int().min(0),
    expectedContentHash: z.string().length(64),
    summary: z.string().max(240).optional(),
  }),
  z.object({
    action: z.literal("rollback"),
    targetRevisionId: z.string().min(1),
    resetDraft: z.boolean().default(false),
    expectedEditSequence: z.number().int().min(0).optional(),
  }),
]);

export const pageDocumentPatchSchema = z.object({
  expectedEditSequence: z.number().int().min(0),
  pageData: jsonRecordSchema.optional(),
  operations: z
    .array(
      z.discriminatedUnion("op", [
        z.object({
          op: z.literal("update"),
          stableId: z.string().min(1),
          data: jsonRecordSchema,
        }),
        z.object({
          op: z.literal("move"),
          stableId: z.string().min(1),
          parentStableId: z.string().min(1).nullable(),
          sortOrder: z.number().int().min(0),
        }),
        z.object({
          op: z.literal("insert"),
          node: insertNodeSchema,
        }),
        z.object({
          op: z.literal("remove"),
          stableId: z.string().min(1),
        }),
      ]),
    )
    .max(100)
    .default([]),
});

export type PageDocumentPatchInput = z.infer<typeof pageDocumentPatchSchema>;
