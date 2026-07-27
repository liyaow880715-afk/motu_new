import { timingSafeEqual } from "crypto";

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/utils/env";
import { fail } from "@/lib/utils/route";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function getAuthenticatedAccessKeyId(request: Request) {
  if (env.APP_RUNTIME === "desktop") return null;
  return request.headers.get("x-auth-key-id");
}

export async function authorizeProjectRequest(request: Request, projectId: string) {
  if (env.APP_RUNTIME === "desktop") return null;

  const accessKeyId = getAuthenticatedAccessKeyId(request);
  if (!accessKeyId) {
    return fail("UNAUTHORIZED", "缺少有效会话，请重新登录。", null, 401);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, accessKeyId: true },
  });
  if (!project) return fail("NOT_FOUND", "Project not found.", null, 404);
  if (!project.accessKeyId || !safeEqual(project.accessKeyId, accessKeyId)) {
    return fail("FORBIDDEN", "无权访问该项目", null, 403);
  }
  return null;
}

export async function authorizeAssetRequest(request: Request, assetId: string) {
  const asset = await prisma.productAsset.findUnique({
    where: { id: assetId },
    select: { projectId: true },
  });
  if (!asset) return fail("NOT_FOUND", "Asset not found.", null, 404);
  return authorizeProjectRequest(request, asset.projectId);
}

export function requireAuthenticatedAccessKeyId(request: Request) {
  if (env.APP_RUNTIME === "desktop") return { accessKeyId: null, response: null };
  const accessKeyId = getAuthenticatedAccessKeyId(request);
  return accessKeyId
    ? { accessKeyId, response: null }
    : { accessKeyId: null, response: fail("UNAUTHORIZED", "缺少有效会话，请重新登录。", null, 401) };
}
