import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { generateSectionImage } from "@/lib/services/generation-service";
import { handleRouteError } from "@/lib/utils/route";
import { IMAGE_GENERATION_CONCURRENCY, mapWithConcurrency } from "@/lib/utils/concurrency";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";
import { findTaskByIdempotencyKey, IdempotencyConflictError } from "@/lib/services/task-service";

export const maxDuration = 1200;

const heroBatchSchema = z.object({
  count: z.number().min(2).max(8).default(4),
  styles: z.array(z.string()).min(1).optional(),
  idempotencyKey: z.string().trim().min(12).max(160).optional(),
});

type HeroBatchResult =
  | {
      index: number;
      style: string;
      success: true;
      assetId: string;
      promptSnapshot: string;
      copySnapshot: string;
    }
  | {
      index: number;
      style: string;
      success: false;
      error: string;
    };

type PublicHeroBatchResult =
  | Omit<Extract<HeroBatchResult, { success: true }>, "promptSnapshot" | "copySnapshot">
  | Extract<HeroBatchResult, { success: false }>;

function toPublicResult(result: HeroBatchResult): PublicHeroBatchResult {
  if (!result.success) return result;
  const { promptSnapshot, copySnapshot, ...publicResult } = result;
  void promptSnapshot;
  void copySnapshot;
  return publicResult;
}

async function waitForBatchItem(projectId: string, idempotencyKey: string) {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const task = await findTaskByIdempotencyKey(projectId, idempotencyKey);
    if (!task) return null;
    if (task.status === "FAILED") {
      throw new Error(task.errorMessage ?? `Batch generation task ${task.id} failed.`);
    }
    if (task.status === "SUCCESS") {
      const output = (task.outputPayload ?? {}) as Record<string, unknown>;
      const assetId = typeof output.imageAssetId === "string" ? output.imageAssetId : null;
      if (!assetId) throw new Error(`Batch generation task ${task.id} has no result asset.`);
      const imageAsset = await prisma.productAsset.findUnique({ where: { id: assetId } });
      if (!imageAsset) throw new Error(`Result asset for batch generation task ${task.id} no longer exists.`);
      return {
        imageAsset,
        usedModel: typeof output.usedModel === "string" ? output.usedModel : "unknown",
        generationMode: typeof output.generationMode === "string" ? output.generationMode : "image_api",
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Batch task is still running; reuse idempotency key ${idempotencyKey} to recover it.`);
}

const DEFAULT_HERO_STYLES = [
  "高端简约白底图，产品居中，柔和影棚光，干净背景，突出材质质感",
  "生活场景图，产品摆放在木质桌面上，自然窗光，温暖氛围，有绿植点缀",
  "户外街拍风格，模特手持产品，城市背景虚化，阳光照射，时尚杂志感",
  "极简艺术风，纯色渐变背景，产品悬浮，柔和阴影，高级感",
  "礼盒开箱场景，产品放置在精美包装中，丝带装饰，节日氛围",
  "俯拍平铺图，产品与配件整齐排列在浅色布面上，ins 风",
  "暗黑高级感，黑色背景，聚光灯打在产品上，金属光泽，科技风",
  "温馨居家风，产品放在沙发/床头，暖黄灯光，生活气息",
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const denied = await authorizeProjectRequest(request, projectId);
    if (denied) return denied;
    const parsed = heroBatchSchema.parse(await request.json());
    const batchIdempotencyKey = parsed.idempotencyKey ?? `hero-batch:${randomUUID()}`;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        sections: { orderBy: { order: "asc" } },
        assets: true,
      },
    });

    if (!project) {
      return handleRouteError(new Error("项目不存在"));
    }

    const heroSection = project.sections.find((s) => s.type === "HERO");
    if (!heroSection) {
      return handleRouteError(new Error("项目中没有头图模块"));
    }

    const styles = parsed.styles?.slice(0, parsed.count) ?? DEFAULT_HERO_STYLES.slice(0, parsed.count);
    const encoder = new TextEncoder();
    let streamClosed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: Record<string, unknown>) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            streamClosed = true;
          }
        };

        void (async () => {
          let completed = 0;
          let generatedCount = 0;
          send({ type: "started", total: styles.length });

          const results = await mapWithConcurrency<string, HeroBatchResult>(
            styles,
            IMAGE_GENERATION_CONCURRENCY,
            async (style, index) => {
              let result: HeroBatchResult;
              const itemIdempotencyKey = `${batchIdempotencyKey}:${index}`;
              try {
                let generation = await waitForBatchItem(projectId, itemIdempotencyKey);
                if (!generation) {
                  try {
                    generation = await generateSectionImage(
                      projectId,
                      heroSection.id,
                      undefined,
                      undefined,
                      {
                        isolatedBatch: true,
                        idempotencyKey: itemIdempotencyKey,
                    sectionOverrides: {
                      visualPrompt: `生成电商头图。${style}`,
                      copy: `批量头图生成 #${index + 1}：${style}`,
                        },
                      },
                    );
                  } catch (error) {
                    if (!(error instanceof IdempotencyConflictError)) throw error;
                    generation = await waitForBatchItem(projectId, itemIdempotencyKey);
                    if (!generation) throw error;
                  }
                }
                result = {
                  index,
                  style,
                  success: true,
                  assetId: generation.imageAsset.id,
                  promptSnapshot:
                    typeof (generation.imageAsset.metadata as Record<string, unknown> | null)?.prompt === "string"
                      ? String((generation.imageAsset.metadata as Record<string, unknown>).prompt)
                      : `生成电商头图。${style}`,
                  copySnapshot: `批量头图生成 #${index + 1}：${style}`,
                };
                generatedCount += 1;
              } catch (error) {
                result = {
                  index,
                  style,
                  success: false,
                  error: error instanceof Error ? error.message : "生成失败",
                };
              }

              completed += 1;
              send({
                type: "progress",
                completed,
                total: styles.length,
                generatedCount,
                failedCount: completed - generatedCount,
                result: toPublicResult(result),
              });
              return result;
            },
          );

          const successfulResults = results.filter(
            (result): result is Extract<(typeof results)[number], { success: true }> => result.success,
          );

          if (successfulResults.length > 0) {
            await prisma.$transaction(async (tx) => {
              const latestVersion = await tx.sectionVersion.findFirst({
                where: { sectionId: heroSection.id },
                orderBy: { versionNumber: "desc" },
              });
              const firstVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

              await tx.sectionVersion.updateMany({
                where: { sectionId: heroSection.id },
                data: { isActive: false },
              });

              for (let index = 0; index < successfulResults.length; index++) {
                const result = successfulResults[index];
                await tx.sectionVersion.create({
                  data: {
                    sectionId: heroSection.id,
                    versionNumber: firstVersionNumber + index,
                    promptSnapshot: { prompt: result.promptSnapshot },
                    copySnapshot: { copy: result.copySnapshot },
                    imageAssetId: result.assetId,
                    isActive: index === successfulResults.length - 1,
                  },
                });
              }

              const lastResult = successfulResults[successfulResults.length - 1];
              await tx.pageSection.update({
                where: { id: heroSection.id },
                data: {
                  status: "SUCCESS",
                  currentImageAssetId: lastResult.assetId,
                },
              });
              await tx.project.update({
                where: { id: projectId },
                data: { status: "EDITING" },
              });
            });
          }

          send({
            type: "complete",
            results: results.map(toPublicResult),
            generatedCount: successfulResults.length,
            total: styles.length,
            idempotencyKey: batchIdempotencyKey,
          });
        })()
          .catch((error) => {
            send({
              type: "error",
              message: error instanceof Error ? error.message : "批量生成失败",
            });
          })
          .finally(() => {
            if (!streamClosed) {
              streamClosed = true;
              controller.close();
            }
          });
      },
      cancel() {
        streamClosed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
