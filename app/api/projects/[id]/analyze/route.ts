import { NextRequest } from "next/server";
import { z } from "zod";

import { analyzeProject } from "@/lib/services/analysis-service";
import { handleRouteError } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";
import { executeIdempotentTask } from "@/lib/services/idempotent-task-service";
import { prisma } from "@/lib/db/prisma";

const analyzeRequestSchema = z.object({
  modelId: z.string().optional().nullable(),
  idempotencyKey: z.string().trim().min(12).max(200).optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const denied = await authorizeProjectRequest(request, id);
    if (denied) return denied;
    const input = analyzeRequestSchema.parse(await request.json().catch(() => ({})));
    return executeIdempotentTask(request, id, input.idempotencyKey, {
      execute: (idempotencyKey) => analyzeProject(id, input.modelId, idempotencyKey),
      recover: (task) => prisma.productAnalysis.findUnique({ where: { projectId: task.projectId } }),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
