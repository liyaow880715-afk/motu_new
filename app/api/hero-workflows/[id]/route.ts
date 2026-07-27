import { NextRequest } from "next/server";
import { z } from "zod";

import {
  deleteWorkflow,
  getWorkflowById,
  retryCurrentStage,
  skipCurrentStage,
  startWorkflow,
  submitStageReviewAndContinue,
  updateWorkflowConfig,
  updateWorkflowStageData,
} from "@/lib/services/hero-workflow-engine";
import type { WorkflowStage } from "@/types/hero-workflow";
import { handleRouteError, ok } from "@/lib/utils/route";
import { requireAuthenticatedAccessKeyId } from "@/lib/utils/api-auth";

const stageDataSchema = z.record(z.string(), z.unknown());
const configSchema = z.record(z.string(), z.unknown());

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const workflow = await getWorkflowById((await context.params).id, auth.accessKeyId);
    if (!workflow) {
      return handleRouteError(new Error("Workflow not found."));
    }
    return ok(workflow);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    await deleteWorkflow((await context.params).id, auth.accessKeyId);
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const { action, stageData, config } = body;

    if (action === "continue") {
      const workflow = await submitStageReviewAndContinue(
        (await context.params).id,
        stageData ? stageDataSchema.parse(stageData) : undefined,
        auth.accessKeyId,
      );
      return ok(workflow);
    }

    if (action === "retry") {
      const workflow = await retryCurrentStage((await context.params).id, auth.accessKeyId);
      return ok(workflow);
    }

    if (action === "skip") {
      const workflow = await skipCurrentStage((await context.params).id, auth.accessKeyId);
      return ok(workflow);
    }

    if (action === "start") {
      await startWorkflow((await context.params).id, auth.accessKeyId);
      const workflow = await getWorkflowById((await context.params).id, auth.accessKeyId);
      return ok(workflow);
    }

    if (action === "updateStageData") {
      const workflow = await updateWorkflowStageData(
        (await context.params).id,
        body.stage as WorkflowStage,
        stageData ? stageDataSchema.parse(stageData) : {},
        auth.accessKeyId,
      );
      return ok(workflow);
    }

    if (action === "updateConfig") {
      const workflow = await updateWorkflowConfig(
        (await context.params).id,
        configSchema.parse(config ?? {}),
        auth.accessKeyId,
      );
      return ok(workflow);
    }

    return handleRouteError(new Error("未知操作"));
  } catch (error) {
    return handleRouteError(error);
  }
}
