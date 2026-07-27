import { readFileSync } from "fs";
import { join } from "path";
import { ok } from "@/lib/utils/route";
import { COMMERCE_WORKFLOW_CONTRACT, MOTU_API_CONTRACT, MOTU_CAPABILITIES } from "@/lib/system/capabilities";

export const dynamic = "force-dynamic";

/**
 * 返回应用版本号（读取 package.json）。
 * 桌面端 standalone 服务器的 cwd 是 .next/standalone，其中同样带有打包时的 package.json，
 * 因此 Web 与桌面端读到的都是当前发布版本。
 */
export async function GET() {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    return ok({
      version: pkg.version ?? "",
      apiContract: MOTU_API_CONTRACT,
      workflowContract: COMMERCE_WORKFLOW_CONTRACT,
      capabilities: MOTU_CAPABILITIES,
    });
  } catch {
    return ok({
      version: "",
      apiContract: MOTU_API_CONTRACT,
      workflowContract: COMMERCE_WORKFLOW_CONTRACT,
      capabilities: MOTU_CAPABILITIES,
    });
  }
}
