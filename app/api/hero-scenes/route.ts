import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createScene,
  deleteScene,
  ensureDefaultScenes,
  getAllScenes,
  updateScene,
} from "@/lib/services/hero-scene-service";
import { handleRouteError, ok } from "@/lib/utils/route";

const createSchema = z.object({
  name: z.string().min(1, "请输入场景名称"),
  category: z.string().optional(),
  scenePrompt: z.string().min(1, "请输入场景描述"),
  aspectRatio: z.string().default("1:1"),
  sortOrder: z.number().default(0),
  isDefault: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    await ensureDefaultScenes();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") ?? undefined;
    const scenes = await getAllScenes(category);
    return ok(scenes);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createSchema.parse(await request.json());
    const scene = await createScene(parsed);
    return ok(scene);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("缺少场景 ID");
    await deleteScene(id);
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("缺少场景 ID");
    const body = await request.json();
    const scene = await updateScene(id, body);
    return ok(scene);
  } catch (error) {
    return handleRouteError(error);
  }
}
