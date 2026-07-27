import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createCopyLibrary,
  deleteCopyLibrary,
  generateCopiesWithAI,
  getAllCopyLibraries,
  updateCopyLibrary,
} from "@/lib/services/hero-copy-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { requireAuthenticatedAccessKeyId } from "@/lib/utils/api-auth";

const createSchema = z.object({
  name: z.string().min(1, "请输入文案组名称"),
  category: z.string().optional(),
  copies: z.array(z.string()).optional(),
});

const generateSchema = z.object({
  productName: z.string().min(1, "请输入商品名称"),
  productDescription: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") ?? undefined;
    const libraries = await getAllCopyLibraries(category, auth.accessKeyId);
    return ok(libraries);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const parsed = createSchema.parse(await request.json());
    const library = await createCopyLibrary({ ...parsed, accessKeyId: auth.accessKeyId });
    return ok(library);
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
    if (!id) throw new Error("缺少文案库 ID");
    await deleteCopyLibrary(id, auth.accessKeyId);
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("缺少文案库 ID");
    const body = await request.json();
    const library = await updateCopyLibrary(id, body, auth.accessKeyId);
    return ok(library);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const { action } = body;
    if (action === "generate") {
      const parsed = generateSchema.parse(body);
      const copies = await generateCopiesWithAI(parsed.productName, parsed.productDescription);
      return ok({ copies });
    }
    throw new Error("未知操作");
  } catch (error) {
    return handleRouteError(error);
  }
}
