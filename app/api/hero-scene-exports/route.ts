import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createExport,
  deleteExport,
  getAllExports,
  getExportById,
} from "@/lib/services/hero-scene-export-service";
import { handleRouteError, ok } from "@/lib/utils/route";

const createSchema = z.object({
  productName: z.string().min(1, "请输入商品名称"),
  variantIds: z.array(z.string()).min(1, "请至少选择一个变体"),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const exportRecord = await getExportById(id);
      return ok(exportRecord);
    }
    const exports = await getAllExports();
    return ok(exports);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createSchema.parse(await request.json());
    const result = await createExport(parsed);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("缺少导出 ID");
    await deleteExport(id);
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
