"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fileToBase64Payload } from "@/lib/utils/base64-upload";
import { postIdempotentGeneration } from "@/lib/utils/generation-request";
import { useAuthStore } from "@/hooks/use-auth-store";
import {
  AssetKind,
  kindLabels,
  LabelSubType,
  PendingAsset,
  QuickStartAssetUploader,
} from "@/components/projects/quick-start-asset-uploader";
import { assetTypeLabels } from "@/types/domain";

const COMMON_KINDS: AssetKind[] = ["MAIN", "ANGLE", "DETAIL", "PACKAGING", "LABEL"];
const VARIANT_KINDS: AssetKind[] = ["MAIN", "PACKAGING", "LABEL"];

function buildDraftProjectName() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ];
  return `未命名商品项目-${parts.join("")}`;
}

function createEmptyAssetsRecord(kinds: AssetKind[]): Record<AssetKind, PendingAsset[]> {
  return kinds.reduce((record, kind) => {
    record[kind] = [];
    return record;
  }, {} as Record<AssetKind, PendingAsset[]>);
}

interface VariantDraft {
  localId: string;
  name: string;
  assets: Record<AssetKind, PendingAsset[]>;
}

function labelTypeToAssetTypes(labelType: LabelSubType | undefined): Array<"NUTRITION" | "INGREDIENT"> {
  switch (labelType) {
    case "nutrition":
      return ["NUTRITION"];
    case "ingredient":
      return ["INGREDIENT"];
    case "both":
    default:
      return ["NUTRITION", "INGREDIENT"];
  }
}

function kindToUploadType(
  kind: AssetKind,
  labelType: LabelSubType | undefined,
): Array<"MAIN" | "ANGLE" | "DETAIL" | "PACKAGING" | "NUTRITION" | "INGREDIENT"> {
  if (kind === "LABEL") {
    return labelTypeToAssetTypes(labelType);
  }
  return [kind];
}

export function QuickStartWorkspace() {
  const router = useRouter();
  const { keyInfo } = useAuthStore();

  const [mode, setMode] = useState<"single" | "multi">("single");
  const [productInfo, setProductInfo] = useState("");
  const [category, setCategory] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [commonAssets, setCommonAssets] = useState<Record<AssetKind, PendingAsset[]>>(() =>
    createEmptyAssetsRecord(COMMON_KINDS),
  );
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [variantNameInput, setVariantNameInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isMulti = mode === "multi";

  const isPerUseExhausted = keyInfo?.type === "PER_USE" && (keyInfo.usedCount ?? 0) >= 1;

  const allAssetsCount = COMMON_KINDS.reduce(
    (sum, kind) => sum + commonAssets[kind].length,
    0,
  ) + variants.reduce(
    (sum, variant) =>
      sum + VARIANT_KINDS.reduce((innerSum, kind) => innerSum + variant.assets[kind].length, 0),
    0,
  );

  const updateCommonAssets = (kind: AssetKind, assets: PendingAsset[]) => {
    setCommonAssets((prev) => ({ ...prev, [kind]: assets }));
  };

  const updateVariantAssets = (localId: string, kind: AssetKind, assets: PendingAsset[]) => {
    setVariants((prev) =>
      prev.map((variant) =>
        variant.localId === localId
          ? { ...variant, assets: { ...variant.assets, [kind]: assets } }
          : variant,
      ),
    );
  };

  const addVariant = () => {
    const name = variantNameInput.trim();
    if (!name) {
      toast.error("请输入变体名称");
      return;
    }
    if (variants.some((v) => v.name === name)) {
      toast.error("已存在同名变体");
      return;
    }
    setVariants((prev) => [
      ...prev,
      {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name,
        assets: createEmptyAssetsRecord(VARIANT_KINDS),
      },
    ]);
    setVariantNameInput("");
  };

  const removeVariant = (localId: string) => {
    setVariants((prev) => prev.filter((variant) => variant.localId !== localId));
  };

  const uploadSingleAsset = async (
    projectId: string,
    type: "MAIN" | "ANGLE" | "DETAIL" | "PACKAGING" | "NUTRITION" | "INGREDIENT",
    asset: PendingAsset,
    variantId?: string,
  ) => {
    const base64Payload = await fileToBase64Payload(asset.file);
    const response = await fetch(`/api/projects/${projectId}/assets/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        ...base64Payload,
        variantId: variantId ?? null,
      }),
    });
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error?.message ?? `${assetTypeLabels[type]}上传失败`);
    }
  };

  const uploadAssetsInOrder = async (
    projectId: string,
    assets: PendingAsset[],
    kind: AssetKind,
    variantId?: string,
  ) => {
    for (const asset of assets) {
      const types = kindToUploadType(kind, asset.labelType);
      for (const type of types) {
        await uploadSingleAsset(projectId, type, asset, variantId);
      }
    }
  };

  const handleStart = async () => {
    if (!productInfo.trim() && allAssetsCount === 0) {
      toast.error("请至少填写产品信息或上传一张图片");
      return;
    }

    if (isMulti && variants.length < 2) {
      toast.error("多规格模式至少需要 2 个规格");
      return;
    }

    if (isMulti && variants.some((v) => !v.name.trim())) {
      toast.error("请填写所有规格名称");
      return;
    }

    if (isMulti && variants.some((v) => v.assets.PACKAGING.length === 0)) {
      toast.error("多规格模式下，每个规格至少需要上传 1 张包装图，否则 AI 无法区分口味");
      return;
    }

    if (keyInfo?.type === "PER_USE") {
      const machineId = typeof window !== "undefined" ? localStorage.getItem("bm_machine_id") : null;
      const consumeRes = await fetch("/api/auth/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyInfo.key, machineId }),
      });
      const consumeData = await consumeRes.json();
      if (!consumeData.success) {
        toast.error(consumeData.error?.message ?? "次卡已用完");
        return;
      }
    }

    setSubmitting(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (keyInfo?.key) {
        headers["x-access-key"] = keyInfo.key;
      }

      const createResponse = await fetch("/api/projects", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: buildDraftProjectName(),
          platform: "general_ecommerce",
          style: "generic_clean",
          mode,
          description: productInfo,
          productInfo,
          category,
          sellingPoints,
          targetAudience,
        }),
      });
      const createdPayload = await createResponse.json();
      if (!createdPayload.success) {
        throw new Error(createdPayload.error?.message ?? "创建项目失败");
      }

      const projectId = createdPayload.data.id as string;

      const variantIdMap: Record<string, string> = {};
      for (const variant of variants) {
        const variantResponse = await fetch(`/api/projects/${projectId}/variants`, {
          method: "POST",
          headers,
          body: JSON.stringify({ name: variant.name }),
        });
        const variantPayload = await variantResponse.json();
        if (!variantPayload.success) {
          throw new Error(variantPayload.error?.message ?? `创建变体 ${variant.name} 失败`);
        }
        variantIdMap[variant.localId] = variantPayload.data.id as string;
      }

      for (const kind of COMMON_KINDS) {
        await uploadAssetsInOrder(projectId, commonAssets[kind], kind);
      }

      for (const variant of variants) {
        const variantId = variantIdMap[variant.localId];
        if (!variantId) continue;
        for (const kind of VARIANT_KINDS) {
          await uploadAssetsInOrder(projectId, variant.assets[kind], kind, variantId);
        }
      }

      const analyzePayload = await postIdempotentGeneration(
        `/api/projects/${projectId}/analyze`,
        `${projectId}:analyze`,
        {},
      );

      if (!analyzePayload.success) {
        const rawErrorCode = String(analyzePayload.error?.code ?? "");
        const shouldAutoRetry = rawErrorCode === "PROVIDER_TIMEOUT";
        const errorCode = encodeURIComponent(rawErrorCode);
        const errorMessage = encodeURIComponent(
          String(analyzePayload.error?.message ?? "自动分析未完成。"),
        );

        toast.warning(
          shouldAutoRetry
            ? "正在为你跳转到分析页继续自动重试。"
            : "已为你跳转到分析页继续处理。",
        );

        router.push(
          `/projects/${projectId}/analysis?source=quick-start${shouldAutoRetry ? "&autoRun=1" : ""}&analysisErrorCode=${errorCode}&analysisErrorMessage=${errorMessage}`,
        );
        return;
      }

      toast.success("AI 已自动完成首轮分析。");
      router.push(`/projects/${projectId}/analysis`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "快速开始失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-semibold tracking-[-0.06em] text-slate-950 dark:text-white md:text-5xl">
          创建商品详情页
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-500 dark:text-slate-400">
          填写产品信息，AI 自动生成完整的详情页方案
        </p>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white/84 p-6 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/6 md:p-10">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>生成模式</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={mode === "single" ? "default" : "outline"}
                onClick={() => setMode("single")}
                disabled={submitting}
              >
                单品 / 单规格
              </Button>
              <Button
                type="button"
                variant={mode === "multi" ? "default" : "outline"}
                onClick={() => setMode("multi")}
                disabled={submitting}
              >
                多规格 / 多口味
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "single"
                ? "适用于单一 SKU，所有模块都围绕同一个商品生成。"
                : "适用于同一商品下有多个口味/规格（如云饺三口味），系统会为每个规格单独生成模块图。"}
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>
              产品信息 <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              value={productInfo}
              onChange={(e) => setProductInfo(e.target.value)}
              placeholder="例如：全麦山药茯苓馒头，低GI认证，药食同源，适合控糖人群..."
              rows={3}
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label>品类</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="例如：食品 / 3C数码 / 服装"
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label>目标人群</Label>
            <Input
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="例如：上班族、减脂人群"
              disabled={submitting}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>核心卖点</Label>
            <Textarea
              value={sellingPoints}
              onChange={(e) => setSellingPoints(e.target.value)}
              placeholder="例如：1.低GI认证 2.三重高纤 3.乳酸菌发酵..."
              rows={2}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="mt-8">
          <h3 className="mb-4 text-base font-semibold">
            通用素材
            {isMulti && <span className="ml-2 text-sm font-normal text-slate-500">（可选，用于全家福、品牌调性等通用模块）</span>}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COMMON_KINDS.map((kind) => (
              <QuickStartAssetUploader
                key={kind}
                title={kindLabels[kind]}
                kind={kind}
                assets={commonAssets[kind]}
                onChange={(assets) => updateCommonAssets(kind, assets)}
                disabled={submitting}
              />
            ))}
          </div>
        </div>

        {isMulti && (
          <div className="mt-8">
            <h3 className="mb-4 text-base font-semibold">规格 / 口味 / SKU</h3>
          <div className="flex gap-2">
            <Input
              value={variantNameInput}
              onChange={(e) => setVariantNameInput(e.target.value)}
              placeholder="例如：500g 家庭装 / 红色 / 礼盒装"
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addVariant();
                }
              }}
            />
            <Button type="button" onClick={addVariant} disabled={submitting || !variantNameInput.trim()}>
              <Plus className="mr-1.5 h-4 w-4" />
              添加
            </Button>
          </div>

          {variants.length > 0 && (
            <div className="mt-4 space-y-4">
              {variants.map((variant) => (
                <div
                  key={variant.localId}
                  className="rounded-[1.25rem] border border-slate-200 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-medium">{variant.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-rose-500 hover:text-rose-600"
                      disabled={submitting}
                      onClick={() => removeVariant(variant.localId)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {VARIANT_KINDS.map((kind) => (
                      <QuickStartAssetUploader
                        key={kind}
                        title={kindLabels[kind]}
                        kind={kind}
                        assets={variant.assets[kind]}
                        onChange={(assets) => updateVariantAssets(variant.localId, kind, assets)}
                        disabled={submitting}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        <div className="mt-8 flex justify-center">
          <Button
            onClick={handleStart}
            disabled={
              submitting ||
              isPerUseExhausted ||
              (!productInfo.trim() && allAssetsCount === 0) ||
              (isMulti && variants.length < 2)
            }
            className="min-w-[220px] rounded-full px-8"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            {submitting
              ? "正在分析产品…"
              : isPerUseExhausted
                ? "次卡已用完"
                : "开始生成详情页方案"}
          </Button>
        </div>
      </div>
    </section>
  );
}
