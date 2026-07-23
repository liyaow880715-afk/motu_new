import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createGeneration,
  deleteGeneration,
  getGenerationById,
  listGenerations,
  runGeneration,
} from "@/lib/services/hero-scene-generation-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { IMAGE_GENERATION_CONCURRENCY, mapWithConcurrency } from "@/lib/utils/concurrency";

const createSchema = z.object({
  productName: z.string().min(1, "请输入商品名称"),
  productDescription: z.string().optional(),
  sourceImageUrl: z.string().min(1, "请上传商品原图"),
  sceneLibraryIds: z.array(z.string()).min(1, "请至少选择一个场景"),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const generations = await listGenerations(status ?? undefined);
    return ok(generations);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createSchema.parse(await request.json());

    const generations = await Promise.all(
      parsed.sceneLibraryIds.map((sceneLibraryId) =>
        createGeneration({
          productName: parsed.productName,
          productDescription: parsed.productDescription,
          sourceImageUrl: parsed.sourceImageUrl,
          sceneLibraryId,
        }),
      ),
    );

    // Run generations in the background with bounded provider concurrency.
    void mapWithConcurrency(generations, IMAGE_GENERATION_CONCURRENCY, async (gen) => {
      try {
        await runGeneration(gen.id);
      } catch (error) {
        console.error(`[HeroSceneGeneration] Failed for ${gen.id}:`, error);
      }
    });

    return ok(generations);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("缺少生成任务 ID");
    await deleteGeneration(id);
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("缺少生成任务 ID");

    const generation = await getGenerationById(id);
    if (!generation) throw new Error("生成任务不存在");

    const result = await runGeneration(id);
    return ok({ generatedImageUrl: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
