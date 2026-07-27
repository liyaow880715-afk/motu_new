import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { planSections } from "@/lib/services/planner-service";
import { handleRouteError } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";
import { executeIdempotentTask } from "@/lib/services/idempotent-task-service";

export const maxDuration = 300;

const planRequestSchema = z.object({
  modelId: z.string().optional().nullable(),
  autoDecideCounts: z.boolean().optional(),
  paletteStyle: z.enum(["safe", "contrast", "bold"]).optional(),
  idempotencyKey: z.string().trim().min(12).max(200).optional(),
  previewConfig: z
    .object({
      heroImageCount: z.number().int().min(3).max(5),
      detailSectionCount: z.number().int().min(4).max(10),
      imageAspectRatio: z.enum(["3:4", "9:16"]),
      contentLanguage: z.enum(["zh-CN", "en-US", "ja-JP", "ko-KR"]),
      optionalSections: z.array(z.enum(["ingredients_table", "white_bg_product", "specs"])).default([]),
    })
    .optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const denied = await authorizeProjectRequest(request, id);
    if (denied) return denied;
    const input = planRequestSchema.parse(await request.json().catch(() => ({})));
    return executeIdempotentTask(request, id, input.idempotencyKey, {
      execute: (idempotencyKey) => planSections(id, {
        modelId: input.modelId,
        autoDecideCounts: input.autoDecideCounts,
        paletteStyle: input.paletteStyle,
        previewConfig: input.previewConfig,
        idempotencyKey,
      }),
      recover: async (task) => {
        const output = (task.outputPayload ?? {}) as Record<string, unknown>;
        const sections = await prisma.pageSection.findMany({
          where: { projectId: task.projectId },
          orderBy: { order: "asc" },
        });
        return sections.length > 0
          ? {
              sections,
              previewConfig: output.previewConfig,
              previewDecisionReason: output.previewDecisionReason ?? "",
              ...(output.fallbackMode ? { fallbackMode: output.fallbackMode } : {}),
            }
          : null;
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
