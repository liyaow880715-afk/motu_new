import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createExport,
  deleteExport,
  getAllExports,
  getExportById,
} from "@/lib/services/hero-scene-export-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { requireAuthenticatedAccessKeyId } from "@/lib/utils/api-auth";

const storeSchema = z.object({
  name: z.string().min(1, "店铺名称不能为空"),
  links: z.array(z.string().min(1, "链接名称不能为空")),
});

const createSchema = z.object({
  productName: z.string().min(1, "请输入商品名称"),
  variantIds: z.array(z.string()).min(1, "请至少选择一个变体"),
  storeConfig: z.object({
    stores: z.array(storeSchema),
  }).optional(),
  assetIds: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const exportRecord = await getExportById(id, auth.accessKeyId);
      return ok(exportRecord);
    }
    const exports = await getAllExports(auth.accessKeyId);
    return ok(exports);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const parsed = createSchema.parse(await request.json());
    const result = await createExport({ ...parsed, accessKeyId: auth.accessKeyId });
    return ok(result);
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
    if (!id) throw new Error("缺少导出 ID");
    await deleteExport(id, auth.accessKeyId);
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
