import path from "path";

import { prisma } from "@/lib/db/prisma";

const ACCESS_KEY_SCOPED_ROOTS = new Set(["hero-batch", "hero-scene"]);

export function scopedStorageRelativePath(
  root: string,
  accessKeyId: string | null,
  ...segments: string[]
) {
  return path.join(root, ...(accessKeyId ? [accessKeyId] : []), ...segments);
}

export function resolveAccessKeyStoragePath(relativePath: string, accessKeyId: string | null) {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\0"))) {
    throw new Error("Invalid access-key storage path.");
  }
  const [root, ...rest] = segments;
  if (!root || !ACCESS_KEY_SCOPED_ROOTS.has(root)) return relativePath;
  if (root === "hero-batch" && rest[0] === "templates") return relativePath;
  return scopedStorageRelativePath(root, accessKeyId, ...rest);
}

export function isAccessKeyScopedStorageRoot(root: string) {
  return ACCESS_KEY_SCOPED_ROOTS.has(root);
}

export async function resolveAuthorizedStoragePath(
  relativePath: string,
  accessKeyId: string | null,
) {
  if (!accessKeyId) return relativePath;

  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  const [root, projectId] = segments;
  if (isAccessKeyScopedStorageRoot(root)) {
    return resolveAccessKeyStoragePath(relativePath, accessKeyId);
  }
  if (["uploads", "generated", "exports"].includes(root) && projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, accessKeyId },
      select: { id: true },
    });
    if (project) return relativePath;
  }
  throw new Error("Storage path is not owned by the current access key.");
}
