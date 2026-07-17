import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createWorkflow,
  listWorkflows,
  startWorkflow,
} from "@/lib/services/hero-workflow-engine";
import { handleRouteError, ok } from "@/lib/utils/route";

const createSchema = z.object({
  productName: z.string().optional(),
  sourceImageUrl: z.string().min(1, "请上传商品原图"),
  initialConfig: z.record(z.string(), z.unknown()).optional(),
  autoStart: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const workflows = await listWorkflows(status as any);
    return ok(workflows);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createSchema.parse(await request.json());
    const workflow = await createWorkflow({
      productName: parsed.productName,
      sourceImageUrl: parsed.sourceImageUrl,
      initialConfig: parsed.initialConfig,
    });

    if (parsed.autoStart) {
      await startWorkflow(workflow.id);
    }

    return ok(workflow);
  } catch (error) {
    return handleRouteError(error);
  }
}
