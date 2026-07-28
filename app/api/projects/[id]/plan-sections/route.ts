import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { planSections } from "@/lib/services/planner-service";
import { getActiveProviderConfig } from "@/lib/services/provider-service";
import { handleRouteError, ok } from "@/lib/utils/route";
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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const denied = await authorizeProjectRequest(request, id);
    if (denied) return denied;

    const provider = await getActiveProviderConfig("text");
    if (!provider) {
      return ok({ providerName: null, defaultModelId: null, models: [] });
    }

    const models = provider.models
      .filter((model) => {
        const capabilities = model.capabilities as Record<string, boolean>;
        const roles = model.roles as Record<string, boolean>;
        return model.isAvailable &&
          capabilities.text !== false &&
          roles.planning !== false &&
          !/(?:audio|realtime)/i.test(model.modelId);
      })
      .map((model) => ({
        modelId: model.modelId,
        label: model.label || model.modelId,
        isDefault: model.isDefaultPlanning,
        latency: model.latency ?? null,
      }));
    const defaultModelId =
      models.find((model) => model.isDefault)?.modelId ??
      models[0]?.modelId ??
      null;

    return ok({ providerName: provider.name, defaultModelId, models });
  } catch (error) {
    return handleRouteError(error);
  }
}

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
