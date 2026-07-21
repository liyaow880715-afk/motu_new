import { z } from "zod";

import { platformOptions, styleOptions } from "@/types/domain";

export const projectCreateSchema = z.object({
  name: z.string().trim().min(2, "项目名称至少 2 个字符"),
  platform: z.enum(platformOptions),
  style: z.enum(styleOptions),
  mode: z.enum(["single", "multi"]).default("single"),
  description: z.string().trim().optional().nullable(),
  productInfo: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  sellingPoints: z.string().trim().optional().nullable(),
  targetAudience: z.string().trim().optional().nullable(),
});

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(2, "项目名称至少 2 个字符").optional(),
  platform: z.enum(platformOptions).optional(),
  style: z.enum(styleOptions).optional(),
  description: z.string().trim().optional().nullable(),
  status: z
    .enum(["DRAFT", "ANALYZED", "PLANNED", "EDITING", "COMPLETED"])
    .optional(),
  modelSnapshot: z.record(z.string(), z.any()).optional(),
});
