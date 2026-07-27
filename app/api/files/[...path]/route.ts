import { NextRequest } from "next/server";

import {
  isAccessKeyScopedStorageRoot,
  resolveAccessKeyStoragePath,
} from "@/lib/storage/access-key-storage";
import { readStorageFile } from "@/lib/storage/asset-manager";
import { checkAdminOrDesktop } from "@/lib/utils/admin-check";
import {
  authorizeProjectRequest,
  requireAuthenticatedAccessKeyId,
} from "@/lib/utils/api-auth";
import { fail, handleRouteError } from "@/lib/utils/route";

function getContentType(pathname: string) {
  const normalized = pathname.toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (normalized.endsWith(".json")) return "application/json; charset=utf-8";
  if (normalized.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const unsafeSegment = (await context.params).path.find(
      (segment) => segment === "." || segment === ".." || /[\\/\0]/.test(segment),
    );
    if (unsafeSegment) {
      return fail("INVALID_STORAGE_PATH", "Invalid storage path.", null, 400);
    }
    let relativePath = (await context.params).path.join("/");
    const [kind, projectId] = (await context.params).path;
    if (["uploads", "generated", "exports"].includes(kind)) {
      if (!projectId) return fail("INVALID_STORAGE_PATH", "Invalid storage path.", null, 400);
      const denied = await authorizeProjectRequest(request, projectId);
      if (denied) return denied;
    } else if (isAccessKeyScopedStorageRoot(kind)) {
      const auth = requireAuthenticatedAccessKeyId(request);
      if (auth.response) return auth.response;
      relativePath = resolveAccessKeyStoragePath(relativePath, auth.accessKeyId);
    } else if (!checkAdminOrDesktop(request)) {
      return fail("FORBIDDEN", "This storage area is not available to the current session.", null, 403);
    }
    const buffer = await readStorageFile(relativePath);
    const contentType = getContentType(relativePath);

    return new Response(buffer, {
      headers: {
        "Content-Type": String(contentType),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        ...(contentType.startsWith("image/svg+xml")
          ? { "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" }
          : {}),
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fail("NOT_FOUND", "Storage file not found.", null, 404);
    }
    return handleRouteError(error);
  }
}
