import { spawn } from "child_process";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/utils/env";
import type { LayoutStyle } from "@/types/hero-scene";

function runPythonScript(scriptPath: string, payload: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const child = spawn(pythonCmd, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python script exited with code ${code}`));
      } else {
        resolve({ stdout, stderr });
      }
    });

    child.on("error", reject);
    child.stdin.write(payload);
    child.stdin.end();
  });
}

export async function createVariant(input: {
  generationId: string;
  copyText: string;
  subCopyText?: string;
  layoutStyle: LayoutStyle;
  tags?: string[];
}) {
  return prisma.heroSceneVariant.create({
    data: {
      generationId: input.generationId,
      copyText: input.copyText,
      subCopyText: input.subCopyText ?? null,
      layoutStyle: input.layoutStyle,
      tags: input.tags ?? [],
      status: "PENDING",
    },
    include: { generation: true },
  });
}

export async function getVariantById(id: string) {
  return prisma.heroSceneVariant.findUnique({
    where: { id },
    include: { generation: { include: { sceneLibrary: true } } },
  });
}

export async function getVariantsByGeneration(generationId: string) {
  return prisma.heroSceneVariant.findMany({
    where: { generationId },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteVariant(id: string) {
  return prisma.heroSceneVariant.delete({ where: { id } });
}

export async function composeVariant(variantId: string) {
  const variant = await prisma.heroSceneVariant.findUnique({
    where: { id: variantId },
    include: { generation: true },
  });

  if (!variant || !variant.generation) {
    throw new Error("变体不存在");
  }

  if (!variant.generation.generatedImageUrl) {
    throw new Error("场景底图尚未生成");
  }

  await prisma.heroSceneVariant.update({
    where: { id: variantId },
    data: { status: "RUNNING", errorMessage: null },
  });

  try {
    // Resolve base image path from URL
    const baseUrl = variant.generation.generatedImageUrl;
    let baseImagePath: string;
    if (baseUrl.startsWith("/api/files/")) {
      const match = baseUrl.match(/\/api\/files\/(.*)$/);
      if (!match) throw new Error("无法解析图片路径");
      baseImagePath = join(env.STORAGE_ROOT ?? "./storage", match[1]);
    } else if (baseUrl.startsWith("data:")) {
      const match = baseUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
      if (!match) throw new Error("无法解析 base64 图片");
      const storageDir = join(env.STORAGE_ROOT ?? "./storage", "hero-scene", "temp");
      if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });
      baseImagePath = join(storageDir, `base-${variant.generationId.slice(-6)}.png`);
      writeFileSync(baseImagePath, Buffer.from(match[2], "base64"));
    } else {
      throw new Error("不支持的图片 URL 格式");
    }

    const storageDir = join(env.STORAGE_ROOT ?? "./storage", "hero-scene", "variants");
    if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });
    const fileName = `hero-variant-${Date.now()}-${variantId.slice(-6)}.png`;
    const outputPath = join(storageDir, fileName);

    const scriptPath = join(process.cwd(), "scripts", "hero-variant-compose.py");

    const payload = {
      baseImagePath,
      outputPath,
      copyText: variant.copyText,
      subCopyText: variant.subCopyText ?? undefined,
      tags: variant.tags as string[],
      layoutStyle: variant.layoutStyle,
      aspectRatio: variant.generation.metadata && (variant.generation.metadata as Record<string, unknown>).aspectRatio
        ? String((variant.generation.metadata as Record<string, unknown>).aspectRatio)
        : "1:1",
    };

    const { stdout } = await runPythonScript(scriptPath, JSON.stringify(payload));

    const result = JSON.parse(stdout) as { outputPath: string; width: number; height: number };
    const variantImageUrl = `/api/files/hero-scene/variants/${fileName}`;

    await prisma.heroSceneVariant.update({
      where: { id: variantId },
      data: {
        status: "COMPLETED",
        variantImageUrl,
        metadata: {
          composedAt: new Date().toISOString(),
          outputPath: result.outputPath,
          width: result.width,
          height: result.height,
        } as any,
      },
    });

    return variantImageUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    await prisma.heroSceneVariant.update({
      where: { id: variantId },
      data: { status: "FAILED", errorMessage: message },
    });
    throw error;
  }
}

export async function batchComposeVariants(variantIds: string[]) {
  const results: Array<{ id: string; url?: string; error?: string }> = [];
  for (const id of variantIds) {
    try {
      const url = await composeVariant(id);
      results.push({ id, url });
    } catch (error) {
      results.push({ id, error: error instanceof Error ? error.message : "失败" });
    }
  }
  return results;
}
