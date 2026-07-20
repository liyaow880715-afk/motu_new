import { readFileSync } from "fs";
import { join } from "path";
import { ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

/**
 * 返回应用版本号（读取 package.json）。
 * 桌面端 standalone 服务器的 cwd 是 .next/standalone，其中同样带有打包时的 package.json，
 * 因此 Web 与桌面端读到的都是当前发布版本。
 */
export async function GET() {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    return ok({ version: pkg.version ?? "" });
  } catch {
    return ok({ version: "" });
  }
}
