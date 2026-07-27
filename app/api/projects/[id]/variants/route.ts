import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { fail, handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

const createVariantSchema = z.object({
  name: z.string().trim().min(1, "变体名称不能为空"),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;

    const variants = await prisma.productVariant.findMany({
      where: { projectId: (await context.params).id },
      orderBy: { sortOrder: "asc" },
      include: {
        assets: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    return ok(variants);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;

    const input = createVariantSchema.parse(await request.json());
    const existingCount = await prisma.productVariant.count({
      where: { projectId: (await context.params).id },
    });

    const variant = await prisma.productVariant.create({
      data: {
        projectId: (await context.params).id,
        name: input.name,
        sortOrder: existingCount,
      },
    });

    return ok(variant, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get("variantId");
    if (!variantId) {
      return fail("VALIDATION_ERROR", "缺少 variantId 参数", null, 400);
    }

    const existing = await prisma.productVariant.findFirst({
      where: { id: variantId, projectId: (await context.params).id },
    });
    if (!existing) {
      return fail("NOT_FOUND", "变体不存在", null, 404);
    }

    await prisma.productVariant.delete({
      where: { id: variantId },
    });

    return ok({ id: variantId });
  } catch (error) {
    return handleRouteError(error);
  }
}
