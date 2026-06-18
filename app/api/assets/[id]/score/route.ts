import { NextRequest } from "next/server";

import { getImageQualityScore, scoreGeneratedImage } from "@/lib/services/image-quality-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const score = await getImageQualityScore(context.params.id);
    return ok({ score });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const score = await scoreGeneratedImage(context.params.id);
    return ok({ score });
  } catch (error) {
    return handleRouteError(error);
  }
}
