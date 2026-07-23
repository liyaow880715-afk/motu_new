"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Loader2,
  Sparkles,
  Upload,
  Download,
  ImageIcon,
  Trash2,
  Wand2,
  Package,
  History,
  RefreshCw,
  Clock,
  Maximize2,
  FolderOpen,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/shared/image-lightbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { HERO_ANGLE_DEFINITIONS, HERO_ANGLE_IDS, type HeroAngle } from "@/lib/ai/prompts/hero-angles";
import { IMAGE_GENERATION_CONCURRENCY } from "@/lib/utils/concurrency";
import { assetTypeLabels, type ColorTokens } from "@/types/domain";

const ASPECT_RATIOS = [
  { label: "1:1 正方形", value: "1:1" },
  { label: "3:4 竖图", value: "3:4" },
  { label: "4:3 横图", value: "4:3" },
  { label: "16:9 宽屏", value: "16:9" },
];

const GROUP_COUNTS = [4, 5, 6, 7, 8, 9, 10];

/** 每组固定按 5 个卖点角度各出 1 张 */
const IMAGES_PER_GROUP = HERO_ANGLE_IDS.length;
const HERO_BATCH_REQUEST_TIMEOUT_MS = 1_200_000;
const MAX_IMAGE_REFERENCES = 6;

interface ScenePlan {
  sceneName: string;
  sellingPoint: string;
  style: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  coverImageUrl?: string;
}

interface SourceAsset {
  id: string;
  url: string;
  type: string;
  isMain: boolean;
  fileName: string;
}

interface ResultItem {
  index: number;
  sceneName: string;
  style: string;
  imageUrl: string;
  loading: boolean;
  error?: string;
  imageReady?: boolean;
  imageLoadError?: boolean;
  imageRetry?: number;
  angle?: string;
  headline?: string;
  subline?: string;
  score?: number | null;
  qcStatus?: "passed" | "failed" | "unscored";
  qcRetried?: boolean;
  referenceImageCount?: number;
  referenceRoles?: string[];
}

interface HistoryItem {
  id: string;
  fileName: string;
  url: string;
  createdAt: string;
  size: number;
}

/** 与后端 loadSourceProjectContext 一致的描述拼装逻辑 */
function buildProjectDescription(analysis: Record<string, unknown> | null): string {
  if (!analysis) return "";
  const parts = [
    analysis.category ? `品类：${analysis.category}` : "",
    analysis.material ? `材质：${analysis.material}` : "",
    analysis.color ? `颜色：${analysis.color}` : "",
    analysis.targetAudience ? `目标人群：${analysis.targetAudience}` : "",
    Array.isArray(analysis.sellingPoints) && analysis.sellingPoints.length
      ? `卖点：${(analysis.sellingPoints as unknown[]).join("、")}`
      : "",
    Array.isArray(analysis.numericClaims) && analysis.numericClaims.length
      ? `数字信息：${(analysis.numericClaims as unknown[]).join("、")}`
      : "",
    typeof analysis.description === "string" ? analysis.description : "",
    Array.isArray(analysis.usageScenarios) && analysis.usageScenarios.length
      ? `适用场景：${(analysis.usageScenarios as unknown[]).join("、")}`
      : "",
  ].filter(Boolean);
  return parts.join("\n");
}

function accessKeyHeaders(): Record<string, string> {
  const key = typeof window !== "undefined" ? localStorage.getItem("bm_access_key") : null;
  return key ? { "x-access-key": key } : {};
}

function defaultReferenceAssetIds(assets: SourceAsset[]): string[] {
  const identityAssets = assets.filter((asset) => ["MAIN", "ANGLE", "DETAIL"].includes(asset.type));
  const primary = identityAssets.find((asset) => asset.isMain)
    ?? identityAssets.find((asset) => asset.type === "MAIN")
    ?? identityAssets[0];
  const packaging = assets.filter((asset) => asset.type === "PACKAGING");
  const supporting = identityAssets.filter((asset) => asset.id !== primary?.id);
  return [primary, ...packaging.slice(0, 2), ...supporting]
    .filter((asset): asset is SourceAsset => Boolean(asset))
    .filter((asset, index, items) => items.findIndex((item) => item.id === asset.id) === index)
    .slice(0, MAX_IMAGE_REFERENCES)
    .map((asset) => asset.id);
}

export default function HeroBatchPage() {
  // Supplementary uploaded product images (merged with project assets server-side)
  const [productImages, setProductImages] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState("1:1");

  // Source project (required): name / selling points / palette are locked from it
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [paletteTokens, setPaletteTokens] = useState<ColorTokens | null>(null);
  const [sourceAssets, setSourceAssets] = useState<SourceAsset[]>([]);
  const [selectedReferenceAssetIds, setSelectedReferenceAssetIds] = useState<string[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);

  // Scene plan
  const [groupCount, setGroupCount] = useState(5);
  const [scenes, setScenes] = useState<ScenePlan[] | null>(null);
  const [scenesLoading, setScenesLoading] = useState(false);

  // Generation
  const [scoreEnabled, setScoreEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalJobs, setTotalJobs] = useState(0);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [exporting, setExporting] = useState(false);

  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<{ list: string[]; index: number } | null>(null);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  const selectedProject = projects.find((p) => p.id === sourceProjectId) ?? null;
  const productName = selectedProject?.name ?? "";

  // Load detail-page projects for reuse
  useEffect(() => {
    fetch("/api/projects", { headers: accessKeyHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setProjects(
            data.data.map((p: { id: string; name: string; coverImageUrl?: string }) => ({
              id: p.id,
              name: p.name,
              coverImageUrl: p.coverImageUrl,
            })),
          );
        }
      })
      .catch((error) => console.error("Failed to load projects:", error));
  }, []);

  // Load selected project's locked info (description from analysis) + palette
  useEffect(() => {
    if (!sourceProjectId) {
      setProjectDesc("");
      setPaletteTokens(null);
      setSourceAssets([]);
      setSelectedReferenceAssetIds([]);
      setScenes(null);
      return;
    }
    let cancelled = false;
    setProjectLoading(true);
    setScenes(null);

    fetch(`/api/projects/${sourceProjectId}`, { headers: accessKeyHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success || !data.data) return;
        const analysis = (data.data.analysis?.normalizedResult ?? null) as Record<string, unknown> | null;
        setProjectDesc(buildProjectDescription(analysis));
        const assets = Array.isArray(data.data.assets)
          ? data.data.assets
              .filter((asset: SourceAsset) => ["MAIN", "ANGLE", "DETAIL", "PACKAGING"].includes(asset.type) && asset.url)
              .map((asset: SourceAsset) => ({
                id: asset.id,
                url: asset.url,
                type: asset.type,
                isMain: asset.isMain,
                fileName: asset.fileName,
              }))
          : [];
        setSourceAssets(assets);
        setSelectedReferenceAssetIds(defaultReferenceAssetIds(assets));
      })
      .catch((error) => {
        if (!cancelled) console.error("Failed to load project detail:", error);
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });

    fetch(`/api/projects/${sourceProjectId}/palette`, { headers: accessKeyHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success || !data.data) return;
        const options = Array.isArray(data.data.paletteOptions) ? data.data.paletteOptions : [];
        const selected =
          options.find((o: { id: string }) => o.id === data.data.selectedPaletteId) ?? options[0] ?? null;
        setPaletteTokens(selected?.colorTokens ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load project palette:", error);
        setPaletteTokens(null);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceProjectId]);

  // Load generated hero batch history
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/hero-batch/history?limit=50");
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.items)) {
        setHistory(data.data.items);
      }
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const deleteHistoryItem = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/hero-batch/history?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setHistory((prev) => prev.filter((item) => item.id !== id));
        toast.success("已删除历史图片");
      } else {
        throw new Error(data.error?.message ?? "删除失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  }, []);

  const readFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newImages: string[] = [];
    let loaded = 0;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onloadend = () => {
        newImages.push(reader.result as string);
        loaded++;
        if (loaded === files.length) {
          setProductImages((prev) => [...prev, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    readFiles(e.target.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    readFiles(e.dataTransfer.files);
  };

  const removeImage = (idx: number) => {
    setProductImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleSourceAsset = (assetId: string) => {
    setSelectedReferenceAssetIds((current) => {
      if (current.includes(assetId)) {
        if (current.length === 1) {
          toast.error("至少保留 1 张历史项目参考图");
          return current;
        }
        return current.filter((id) => id !== assetId);
      }
      if (current.length >= MAX_IMAGE_REFERENCES) {
        toast.error(`参考图最多选择 ${MAX_IMAGE_REFERENCES} 张`);
        return current;
      }
      return [...current, assetId];
    });
  };

  // Step 1: generate / regenerate scene plans via text model
  const handleGenerateScenes = useCallback(async () => {
    if (!sourceProjectId || !productName) {
      toast.error("请先选择一个历史项目");
      return;
    }
    setScenesLoading(true);
    try {
      const res = await fetch("/api/hero-batch/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, productDescription: projectDesc, groupCount }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.scenes)) {
        setScenes(data.data.scenes);
        toast.success(`已生成 ${data.data.scenes.length} 组场景方案，可编辑后出图`);
      } else {
        throw new Error(data.error?.message ?? "场景生成失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "场景生成失败");
    } finally {
      setScenesLoading(false);
    }
  }, [sourceProjectId, productName, projectDesc, groupCount]);

  const updateScene = (idx: number, updates: Partial<ScenePlan>) => {
    setScenes((prev) => (prev ? prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)) : prev));
  };

  // Step 2: expand scenes × 5 angles and run batch generation
  const handleGenerate = useCallback(async () => {
    if (!scenes || scenes.length === 0) {
      toast.error("请先生成场景方案");
      return;
    }

    const jobs = scenes.flatMap((scene) =>
      HERO_ANGLE_IDS.map((angle: HeroAngle) => ({
        sceneName: scene.sceneName,
        style: scene.style,
        aspectRatio,
        angle,
      })),
    );

    setRunning(true);
    setProgress(0);
    setTotalJobs(jobs.length);
    setResults(jobs.map((job, i) => ({ index: i, sceneName: job.sceneName, style: job.style, imageUrl: "", loading: true })));

    let completed = 0;
    let nextIndex = 0;

    const generateOne = async (i: number) => {
      const controller = new AbortController();
      // 质检打分会多出最多 1 次重生成 + 2 次视觉质检，统一放宽到 20 分钟（后端 maxDuration=1200）
      const timeout = setTimeout(() => controller.abort(), HERO_BATCH_REQUEST_TIMEOUT_MS);
      try {
        const job = jobs[i];
        const payload: Record<string, unknown> = {
          productName,
          productDescription: projectDesc,
          productImages: productImages.length > 0 ? productImages : undefined,
          aspectRatio,
          jobs: [job],
          sourceProjectId,
          sourceAssetIds: selectedReferenceAssetIds,
          paletteTokens: paletteTokens ?? undefined,
          scoreEnabled,
        };
        const res = await fetch("/api/hero-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(payload),
        });
        clearTimeout(timeout);
        const data = await res.json();
        if (data.success) {
          const imageUrl = typeof data.data?.imageUrl === "string" ? data.data.imageUrl.trim() : "";
          if (!imageUrl) {
            throw new Error("生成接口返回成功，但没有返回图片地址");
          }
          setResults((prev) =>
            prev.map((r) => (r.index === i ? {
              ...r,
              imageUrl,
              imageReady: false,
              imageLoadError: false,
              imageRetry: 0,
              sceneName: data.data.sceneName ?? r.sceneName,
              angle: data.data.angle ?? r.angle,
              headline: data.data.headline ?? "",
              subline: data.data.subline ?? "",
              score: data.data.score ?? null,
              qcStatus: data.data.qcStatus ?? "unscored",
              qcRetried: data.data.qcRetried ?? false,
              referenceImageCount: data.data.referenceImageCount ?? 0,
              referenceRoles: data.data.referenceRoles ?? [],
              loading: false,
            } : r)),
          );
        } else {
          throw new Error(data.error?.message ?? "生成失败");
        }
      } catch (error) {
        clearTimeout(timeout);
        const msg = error instanceof Error ? error.message : "失败";
        const displayError = msg.includes("aborted") || msg.includes("AbortError") ? "请求超时或已取消" : msg;
        setResults((prev) =>
          prev.map((r) => (r.index === i ? { ...r, error: displayError, loading: false } : r)),
        );
      } finally {
        completed++;
        setProgress(completed);
      }
    };

    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(IMAGE_GENERATION_CONCURRENCY, jobs.length); w++) {
      workers.push(
        (async () => {
          while (nextIndex < jobs.length) {
            const i = nextIndex++;
            await generateOne(i);
          }
        })(),
      );
    }

    await Promise.all(workers);

    setRunning(false);
    toast.success("批量生成完成！");
    loadHistory();
  }, [scenes, productName, projectDesc, productImages, aspectRatio, sourceProjectId, selectedReferenceAssetIds, paletteTokens, scoreEnabled, loadHistory]);

  const handleDownload = async (url: string, index: number, fileName?: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName ?? `主图-${productName || "商品"}-${index + 1}.png`;
      a.click();
    } catch {
      toast.error("下载失败");
    }
  };

  const handleExportZip = async () => {
    const imageUrls = results.filter((r) => !r.loading && !r.error && r.imageUrl).map((r) => r.imageUrl);
    if (imageUrls.length === 0) {
      toast.error("没有可打包下载的图片");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/hero-batch/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls, productName, aspectRatio }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? "打包失败");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `主图-${productName || "商品"}-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已打包 ${imageUrls.length} 张主图`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打包失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6" />
          批量主图生成器
        </h1>
        <p className="text-muted-foreground mt-1">
          选择历史项目，AI 按卖点生成场景方案，每组出 {IMAGES_PER_GROUP} 张卖点角度主图
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Left Panel - Settings */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Source Project (required) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">历史项目（必选）</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  商品名称、卖点描述与色板直接套用该项目
                </p>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                  value={sourceProjectId}
                  onChange={(e) => setSourceProjectId(e.target.value)}
                  disabled={running || scenesLoading}
                >
                  <option value="">请选择历史项目</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                {sourceProjectId && (
                  <div className="rounded-lg bg-muted p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      {selectedProject?.coverImageUrl ? (
                        <img
                          src={selectedProject.coverImageUrl}
                          alt="项目封面"
                          className="h-10 w-10 rounded object-cover border"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{productName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {projectLoading ? "读取项目信息中..." : "名称 / 卖点 / 色板已锁定"}
                        </p>
                      </div>
                    </div>
                    {projectDesc ? (
                      <p className="text-[10px] text-muted-foreground whitespace-pre-line line-clamp-6 rounded bg-background border p-1.5">
                        {projectDesc}
                      </p>
                    ) : null}
                    {paletteTokens ? (
                      <div className="flex items-center gap-1.5">
                        {[paletteTokens.background, paletteTokens.primary, paletteTokens.secondary, paletteTokens.accent, paletteTokens.text]
                          .filter(Boolean)
                          .map((color, i) => (
                            <span key={i} className="inline-block w-4 h-4 rounded-full border" style={{ backgroundColor: color }} title={color} />
                          ))}
                        <span className="text-[10px] text-muted-foreground ml-1">项目色板已应用</span>
                      </div>
                    ) : null}
                    {sourceAssets.length > 0 ? (
                      <div className="space-y-2 border-t border-border/60 pt-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-medium">历史项目参考图</p>
                            <p className="text-[10px] text-muted-foreground">点击缩略图调整，已选 {selectedReferenceAssetIds.length}/{MAX_IMAGE_REFERENCES} 张</p>
                          </div>
                          <Badge variant="outline" className="text-[10px]">主图与包装优先</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {sourceAssets.map((asset) => {
                            const selectedIndex = selectedReferenceAssetIds.indexOf(asset.id);
                            const selected = selectedIndex >= 0;
                            return (
                              <div key={asset.id} className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => toggleSourceAsset(asset.id)}
                                  aria-pressed={selected}
                                  className={`relative block aspect-square w-full overflow-hidden rounded-md border-2 transition-colors ${
                                    selected ? "border-primary ring-1 ring-primary/30" : "border-transparent opacity-60 hover:opacity-100"
                                  }`}
                                >
                                  <img src={asset.url} alt={asset.fileName || "历史项目参考图"} className="h-full w-full object-cover" />
                                  <span className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/65 px-1 py-0.5 text-[9px] text-white">
                                    {assetTypeLabels[asset.type as keyof typeof assetTypeLabels] ?? asset.type}
                                  </span>
                                  {selected ? (
                                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                                      {selectedIndex + 1}
                                    </span>
                                  ) : null}
                                  {selected ? <Check className="absolute left-1 top-1 h-3.5 w-3.5 text-primary" /> : null}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          生成时会优先使用历史主商品图、包装图和你勾选的补充图，接口最多接收 6 张参考图。
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Supplementary upload */}
              <div className="space-y-2 pt-2 border-t">
                <Label>补充商品图（可选）</Label>
                <p className="text-xs text-muted-foreground">
                  项目素材会自动作为参考图，此处可额外补充
                </p>
                <div
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" id="product-upload" />
                  <label htmlFor="product-upload" className="cursor-pointer">
                    {productImages.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {productImages.map((img, idx) => (
                          <div key={idx} className="relative group">
                            <img src={img} alt={`商品图 ${idx + 1}`} className="h-20 w-full rounded-lg object-cover" />
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); removeImage(idx); }}
                              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center justify-center h-20 rounded-lg border border-dashed border-muted-foreground/30">
                          <Upload className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">点击或拖拽上传补充图（支持多张）</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Group count */}
              <div className="space-y-2 pt-2 border-t">
                <Label>场景组数（每组 {IMAGES_PER_GROUP} 张）</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                  value={groupCount}
                  onChange={(e) => { setGroupCount(Number(e.target.value)); setScenes(null); }}
                  disabled={running || scenesLoading}
                >
                  {GROUP_COUNTS.map((n) => (
                    <option key={n} value={n}>{n} 组（共 {n * IMAGES_PER_GROUP} 张）</option>
                  ))}
                </select>
              </div>

              {/* Aspect ratio */}
              <div className="space-y-2">
                <Label>图片比例</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ASPECT_RATIOS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setAspectRatio(r.value)}
                      className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                        aspectRatio === r.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* QC score toggle */}
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <Label className="text-xs">AI 质检打分</Label>
                  <p className="text-[10px] text-muted-foreground">生成后自动打分，低于 60 分带修正意见重试（更耗时）</p>
                </div>
                <button
                  type="button"
                  onClick={() => setScoreEnabled((prev) => !prev)}
                  disabled={running}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] transition-colors ${
                    scoreEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {scoreEnabled ? "开" : "关"}
                </button>
              </div>

              {/* Step 1: scene plan */}
              <Button
                variant={scenes ? "outline" : "default"}
                onClick={handleGenerateScenes}
                disabled={!sourceProjectId || scenesLoading || running}
                className="w-full"
              >
                {scenesLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    AI 正在按卖点匹配场景...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {scenes ? "换一批场景方案" : `生成 ${groupCount} 组场景方案`}
                  </>
                )}
              </Button>

              {/* Scene plan list (editable) */}
              {scenes && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    确认或编辑以下 {scenes.length} 组场景，每组将按 {IMAGES_PER_GROUP} 个卖点角度各出 1 张
                  </p>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {scenes.map((scene, idx) => (
                      <Card key={idx} className="bg-muted/40">
                        <CardContent className="p-3 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium w-5">{idx + 1}</span>
                            <Input
                              value={scene.sceneName}
                              onChange={(e) => updateScene(idx, { sceneName: e.target.value })}
                              className="flex-1 h-7 text-xs"
                              placeholder="场景名称"
                              disabled={running}
                            />
                          </div>
                          {scene.sellingPoint ? (
                            <div className="pl-7">
                              <Badge variant="outline" className="text-[10px]">卖点：{scene.sellingPoint}</Badge>
                            </div>
                          ) : null}
                          <Textarea
                            value={scene.style}
                            onChange={(e) => updateScene(idx, { style: e.target.value })}
                            rows={2}
                            className="ml-7 w-[calc(100%-1.75rem)] text-xs"
                            placeholder="场景风格描述"
                            disabled={running}
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: batch generate */}
              <Button
                onClick={handleGenerate}
                disabled={!scenes || scenes.length === 0 || running || scenesLoading}
                className="w-full"
              >
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中 {progress}/{totalJobs}
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    批量出图 {scenes ? `${scenes.length} 组 × ${IMAGES_PER_GROUP} 张 = ${scenes.length * IMAGES_PER_GROUP} 张` : ""}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Results */}
        <div>
          {running && totalJobs > 0 ? (
            <div className="mb-3 space-y-2 rounded-md border bg-card p-3" aria-live="polite">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">批量生成进度</span>
                <span className="text-muted-foreground">{progress}/{totalJobs}</span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={totalJobs}
                aria-valuenow={progress}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-primary transition-[width] duration-300"
                  style={{ width: `${(progress / totalJobs) * 100}%` }}
                />
              </div>
              <div className="flex gap-4 text-[10px] text-muted-foreground">
                <span className="text-green-600">生成成功 {results.filter((result) => !result.loading && !result.error && result.imageUrl).length}</span>
                <span>图片就绪 {results.filter((result) => result.imageReady).length}</span>
                <span className="text-red-500">失败 {results.filter((result) => !result.loading && result.error).length}</span>
                <span>剩余 {Math.max(0, totalJobs - progress)}</span>
              </div>
            </div>
          ) : null}
          {results.length === 0 ? (
            <Card className="h-full flex items-center justify-center p-12">
              <div className="text-center">
                <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">左侧选择项目并生成场景方案后，点击批量出图</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">生成结果</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportZip}
                  disabled={exporting || results.some((r) => r.loading)}
                >
                  {exporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Package className="mr-2 h-4 w-4" />
                  )}
                  一键打包下载
                </Button>
              </div>
              {Array.from({ length: Math.ceil(results.length / IMAGES_PER_GROUP) }, (_, groupIdx) => {
                const groupResults = results.slice(groupIdx * IMAGES_PER_GROUP, (groupIdx + 1) * IMAGES_PER_GROUP);
                const groupName = groupResults[0]?.sceneName || `第 ${groupIdx + 1} 组`;
                return (
                  <div key={groupIdx} className="space-y-2">
                    <h3 className="text-xs font-medium text-muted-foreground">
                      第 {groupIdx + 1} 组 · {groupName}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {groupResults.map((r) => (
                        <Card key={r.index} className="overflow-hidden group">
                          <div className={`bg-muted relative ${
                            aspectRatio === "1:1" ? "aspect-square" :
                            aspectRatio === "3:4" ? "aspect-[3/4]" :
                            aspectRatio === "4:3" ? "aspect-[4/3]" :
                            aspectRatio === "16:9" ? "aspect-video" : "aspect-square"
                          }`}>
                            {r.loading ? (
                              <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                              </div>
                            ) : r.error ? (
                              <div className="flex h-full items-center justify-center text-xs text-red-500 p-2 text-center">
                                {r.error}
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="block h-full w-full cursor-zoom-in"
                                  disabled={r.imageLoadError === true}
                                  onClick={() => {
                                    const list = results.filter((x) => !x.loading && !x.error && x.imageUrl).map((x) => x.imageUrl);
                                    const index = list.indexOf(r.imageUrl);
                                    if (index >= 0) setLightbox({ list, index });
                                  }}
                                  aria-label="放大查看"
                                >
                                  <img
                                    key={r.imageRetry ?? 0}
                                    src={`${r.imageUrl}${r.imageUrl.includes("?") ? "&" : "?"}preview=${r.imageRetry ?? 0}`}
                                    alt={`主图 ${r.index + 1}`}
                                    className="h-full w-full object-cover"
                                    onLoad={() => {
                                      setResults((current) => current.map((item) => (
                                        item.index === r.index && !item.imageReady
                                          ? { ...item, imageReady: true, imageLoadError: false }
                                          : item
                                      )));
                                    }}
                                    onError={() => {
                                      setResults((current) => current.map((item) => (
                                        item.index === r.index
                                          ? { ...item, imageReady: false, imageLoadError: true }
                                          : item
                                      )));
                                    }}
                                  />
                                </button>
                                {!r.imageReady && !r.imageLoadError ? (
                                  <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
                                    <div className="flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[10px] text-white shadow-sm">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      图片加载中
                                    </div>
                                  </div>
                                ) : null}
                                {r.imageLoadError ? (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-3 text-center text-[10px] text-red-500">
                                    <span>图片加载失败</span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-[10px]"
                                      onClick={() => {
                                        setResults((current) => current.map((item) => (
                                          item.index === r.index
                                            ? {
                                                ...item,
                                                imageReady: false,
                                                imageLoadError: false,
                                                imageRetry: (item.imageRetry ?? 0) + 1,
                                              }
                                            : item
                                        )));
                                      }}
                                    >
                                      <RefreshCw className="mr-1 h-3 w-3" />
                                      重新加载
                                    </Button>
                                  </div>
                                ) : null}
                                {!r.imageLoadError ? <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2 pointer-events-none">
                                  <Button size="sm" variant="secondary" className="pointer-events-auto" onClick={() => {
                                    const list = results.filter((x) => !x.loading && !x.error && x.imageUrl).map((x) => x.imageUrl);
                                    const index = list.indexOf(r.imageUrl);
                                    if (index >= 0) setLightbox({ list, index });
                                  }}>
                                    <Maximize2 className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="secondary" className="pointer-events-auto" onClick={() => handleDownload(r.imageUrl, r.index)}>
                                    <Download className="h-3 w-3" />
                                  </Button>
                                </div> : null}
                              </>
                            )}
                          </div>
                          <div className="p-2">
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{r.sceneName || `主图 ${r.index + 1}`}</Badge>
                              {r.angle && HERO_ANGLE_DEFINITIONS[r.angle as HeroAngle] ? (
                                <Badge variant="default" className="text-[10px]">{HERO_ANGLE_DEFINITIONS[r.angle as HeroAngle].label}</Badge>
                              ) : null}
                              {r.qcStatus === "unscored" && scoreEnabled ? (
                                <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500" title="质检未完成或当前没有可用视觉模型">
                                  未评分
                                </Badge>
                              ) : typeof r.score === "number" ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    r.score >= 80 ? "border-green-500 text-green-600" :
                                    r.score >= 60 ? "border-amber-500 text-amber-600" :
                                    "border-red-500 text-red-600"
                                  }`}
                                  title={r.qcRetried ? "质检未通过，已自动重试" : "AI 质检得分"}
                                >
                                  {r.score}分{r.qcRetried ? "·已重试" : ""}
                                </Badge>
                              ) : null}
                              {r.referenceImageCount ? (
                                <Badge variant="outline" className="text-[10px]" title="本次实际发送给模型的参考图数量">
                                  参考图 {r.referenceImageCount} 张
                                </Badge>
                              ) : null}
                            </div>
                            {r.headline ? <p className="mt-1 text-[10px] font-medium line-clamp-1" title={r.headline}>{r.headline}</p> : null}
                            <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{r.style}</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* History */}
          <Card className="mt-6">
            <CardContent className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setHistoryExpanded((prev) => !prev)}
              >
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium">历史生成记录</h2>
                  <Badge variant="default" className="text-[10px]">{history.length}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={(e) => { e.stopPropagation(); loadHistory(); }}
                    disabled={historyLoading}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} />
                  </Button>
                  <span className="text-muted-foreground">{historyExpanded ? "−" : "+"}</span>
                </div>
              </div>

              {historyExpanded && (
                <div className="mt-4">
                  {history.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Clock className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      暂无历史生成记录
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {history.map((item) => (
                        <Card key={item.id} className="overflow-hidden group">
                          <div className="relative aspect-square bg-muted">
                            <button
                              type="button"
                              className="block h-full w-full cursor-zoom-in"
                              onClick={() => {
                                const list = history.map((x) => x.url);
                                const index = list.indexOf(item.url);
                                if (index >= 0) setLightbox({ list, index });
                              }}
                              aria-label="放大查看"
                            >
                              <img src={item.url} alt={item.fileName} className="h-full w-full object-cover" />
                            </button>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2 pointer-events-none">
                              <Button size="sm" variant="secondary" className="pointer-events-auto" onClick={() => {
                                const list = history.map((x) => x.url);
                                const index = list.indexOf(item.url);
                                if (index >= 0) setLightbox({ list, index });
                              }}>
                                <Maximize2 className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="secondary" className="pointer-events-auto" onClick={() => handleDownload(item.url, 0, item.fileName)}>
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="destructive" className="pointer-events-auto" onClick={() => deleteHistoryItem(item.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="p-2">
                            <p className="text-[10px] text-muted-foreground truncate" title={item.fileName}>
                              {item.fileName}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(item.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <ImageLightbox
        src={lightbox ? lightbox.list[lightbox.index] ?? null : null}
        onClose={() => setLightbox(null)}
        onPrev={lightbox && lightbox.list.length > 1 ? () => setLightbox((cur) => (cur ? { ...cur, index: (cur.index - 1 + cur.list.length) % cur.list.length } : cur)) : undefined}
        onNext={lightbox && lightbox.list.length > 1 ? () => setLightbox((cur) => (cur ? { ...cur, index: (cur.index + 1) % cur.list.length } : cur)) : undefined}
      />
    </div>
  );
}
