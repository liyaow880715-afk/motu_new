import { NextRequest } from "next/server";
import { z } from "zod";

import {
  batchComposeVariants,
  createVariant,
  deleteVariant,
  getVariantsByGeneration,
} from "@/lib/services/hero-scene-variant-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import type { LayoutStyle } from "@/types/hero-scene";
import { requireAuthenticatedAccessKeyId } from "@/lib/utils/api-auth";

const createSchema = z.object({
  generationId: z.string().min(1),
  copies: z.array(z.object({
    copyText: z.string().min(1),
    subCopyText: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })).min(1),
  layoutStyles: z.array(z.string()).min(1),
});

const composeSchema = z.object({
  variantIds: z.array(z.string()).min(1),
});

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const generationId = searchParams.get("generationId");
    if (!generationId) throw new Error("缺少生成任务 ID");
    const variants = await getVariantsByGeneration(generationId, auth.accessKeyId);
    return ok(variants);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const parsed = createSchema.parse(await request.json());

    const variants = [];
    for (const copy of parsed.copies) {
      for (const layoutStyle of parsed.layoutStyles) {
        const variant = await createVariant({
          generationId: parsed.generationId,
          copyText: copy.copyText,
          subCopyText: copy.subCopyText,
          layoutStyle: layoutStyle as LayoutStyle,
          tags: copy.tags,
          accessKeyId: auth.accessKeyId,
        });
        variants.push(variant);
      }
    }

    // Compose variants in background
    batchComposeVariants(variants.map((v) => v.id), auth.accessKeyId).catch((error) => {
      console.error("[HeroSceneVariant] Batch compose failed:", error);
    });

    return ok(variants);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("缺少变体 ID");
    await deleteVariant(id, auth.accessKeyId);
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const parsed = composeSchema.parse(await request.json());
    const results = await batchComposeVariants(parsed.variantIds, auth.accessKeyId);
    return ok(results);
  } catch (error) {
    return handleRouteError(error);
  }
}
