import { NextRequest } from "next/server";
import { readdir, stat, unlink } from "fs/promises";
import { join } from "path";
import { env } from "@/lib/utils/env";
import { checkAdminOrDesktop } from "@/lib/utils/admin-check";
import { handleRouteError, ok, fail } from "@/lib/utils/route";

const HERO_BATCH_DIR = "hero-batch";
const TEMPLATES_DIR = "templates";

interface HeroBatchHistoryItem {
  id: string;
  fileName: string;
  url: string;
  createdAt: string;
  size: number;
}

async function listHistory(): Promise<HeroBatchHistoryItem[]> {
  const storageRoot = env.STORAGE_ROOT ?? "./storage";
  const dir = join(storageRoot, HERO_BATCH_DIR);

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const items: HeroBatchHistoryItem[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      // Exclude non-image files and manifest leftovers
      if (!/\.(png|jpg|jpeg|webp)$/i.test(entry.name)) continue;

      const filePath = join(dir, entry.name);
      const fileStat = await stat(filePath);
      items.push({
        id: entry.name,
        fileName: entry.name,
        url: `/api/files/hero-batch/${entry.name}`,
        createdAt: fileStat.mtime.toISOString(),
        size: fileStat.size,
      });
    }

    // Most recent first
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) return [];
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "100"), 1), 500);
    const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);

    const items = await listHistory();
    const total = items.length;
    const page = items.slice(offset, offset + limit);

    return ok({ items: page, total, limit, offset });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!checkAdminOrDesktop(request)) {
      return fail("UNAUTHORIZED", "需要管理员权限", null, 403);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || /[\\/]/g.test(id) || id === TEMPLATES_DIR) {
      return fail("BAD_REQUEST", "无效的文件 ID", null, 400);
    }

    const storageRoot = env.STORAGE_ROOT ?? "./storage";
    const filePath = join(storageRoot, HERO_BATCH_DIR, id);
    await unlink(filePath);
    return ok({ deleted: id });
  } catch (error) {
    return handleRouteError(error);
  }
}
