import { NextRequest } from "next/server";

import { getModelTemplate } from "@/lib/services/model-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const model = await getModelTemplate((await context.params).id);
    return ok(model);
  } catch (error) {
    return handleRouteError(error);
  }
}
