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

const stageDataSchema = z.record(z.string(), z.unknown());
const configSchema = z.record(z.string(), z.unknown());

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const workflow = await getWorkflowById(context.params.id);
    if (!workflow) {
      return handleRouteError(new Error("工作流不存在"));
    }
    return ok(workflow);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: { id: string } }) {
  try {
    await deleteWorkflow(context.params.id);
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { action, stageData, config } = body;

    if (action === "continue") {
      const workflow = await submitStageReviewAndContinue(
        context.params.id,
        stageData ? stageDataSchema.parse(stageData) : undefined,
      );
      return ok(workflow);
    }

    if (action === "retry") {
      const workflow = await retryCurrentStage(context.params.id);
      return ok(workflow);
    }

    if (action === "skip") {
      const workflow = await skipCurrentStage(context.params.id);
      return ok(workflow);
    }

    if (action === "start") {
      await startWorkflow(context.params.id);
      const workflow = await getWorkflowById(context.params.id);
      return ok(workflow);
    }

    if (action === "updateStageData") {
      const workflow = await updateWorkflowStageData(
        context.params.id,
        body.stage as WorkflowStage,
        stageData ? stageDataSchema.parse(stageData) : {},
      );
      return ok(workflow);
    }

    if (action === "updateConfig") {
      const workflow = await updateWorkflowConfig(
        context.params.id,
        configSchema.parse(config ?? {}),
      );
      return ok(workflow);
    }

    return handleRouteError(new Error("未知操作"));
  } catch (error) {
    return handleRouteError(error);
  }
}
