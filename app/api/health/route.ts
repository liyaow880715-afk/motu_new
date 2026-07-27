export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import fs from "fs/promises";
import path from "path";

import { prisma } from "@/lib/db/prisma";
import { isSecureAppSecret } from "@/lib/auth/session";
import { ensureStorageScaffold } from "@/lib/storage/asset-manager";
import { COMMERCE_WORKFLOW_CONTRACT, MOTU_API_CONTRACT, MOTU_CAPABILITIES } from "@/lib/system/capabilities";
import { env } from "@/lib/utils/env";

async function appVersion() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "package.json"), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function databaseReadiness() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ready: true };
  } catch (error) {
    return { ready: false, reason: error instanceof Error ? error.message : "database unavailable" };
  }
}

async function storageReadiness() {
  try {
    await ensureStorageScaffold();
    await fs.access(path.resolve(process.cwd(), env.STORAGE_ROOT), fs.constants.R_OK | fs.constants.W_OK);
    return { ready: true };
  } catch (error) {
    return { ready: false, reason: error instanceof Error ? error.message : "storage unavailable" };
  }
}

async function providerReadiness() {
  try {
    const providers = await prisma.providerConfig.findMany({
      where: { isActive: true },
      select: {
        purpose: true,
        models: {
          where: { isAvailable: true },
          select: {
            isDefaultAnalysis: true,
            isDefaultPlanning: true,
            isDefaultHeroImage: true,
            isDefaultDetailImage: true,
            isDefaultImageEdit: true,
          },
        },
      },
    });
    const models = providers.flatMap((provider) => provider.models);
    const roles = {
      analysis: models.some((model) => model.isDefaultAnalysis),
      planning: models.some((model) => model.isDefaultPlanning),
      heroImage: models.some((model) => model.isDefaultHeroImage),
      detailImage: models.some((model) => model.isDefaultDetailImage),
      imageEdit: models.some((model) => model.isDefaultImageEdit),
    };
    return {
      ready: roles.analysis && roles.planning && roles.heroImage && roles.detailImage,
      roles,
      activeProviderCount: providers.length,
    };
  } catch (error) {
    return {
      ready: false,
      roles: { analysis: false, planning: false, heroImage: false, detailImage: false, imageEdit: false },
      activeProviderCount: 0,
      reason: error instanceof Error ? error.message : "provider configuration unavailable",
    };
  }
}

export async function GET() {
  const [version, database, storage, providers] = await Promise.all([
    appVersion(),
    databaseReadiness(),
    storageReadiness(),
    providerReadiness(),
  ]);
  const security = {
    ready:
      env.APP_RUNTIME === "desktop" ||
      (isSecureAppSecret(process.env.APP_SECRET) && process.env.ADMIN_SECRET !== "banana-admin"),
    runtime: env.APP_RUNTIME,
    signedSessionsRequired: env.APP_RUNTIME === "web",
  };
  const coreReady = database.ready && storage.ready && security.ready;

  return Response.json(
    {
      status: coreReady && providers.ready ? "ok" : "degraded",
      service: "motu",
      version,
      apiContract: MOTU_API_CONTRACT,
      workflowContract: COMMERCE_WORKFLOW_CONTRACT,
      capabilities: MOTU_CAPABILITIES,
      readiness: {
        core: coreReady,
        database,
        storage,
        security,
        providers,
      },
    },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
