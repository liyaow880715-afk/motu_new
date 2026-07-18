"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  Sparkles,
  Upload,
  Download,
  ImageIcon,
  Trash2,
  Wand2,
  Package,
  Plus,
  X,
  Layers,
  ShieldCheck,
  History,
  RefreshCw,
  Clock,
  GripVertical,
  Copy,
  ChevronDown,
  ChevronUp,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/shared/image-lightbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { HeroTemplateRecord, HeroTemplateScene, HeroTemplateStructure } from "@/types/hero-template";
import { HERO_ANGLE_DEFINITIONS, HERO_ANGLE_IDS, type HeroAngle } from "@/lib/ai/prompts/hero-angles";

const PRESET_STYLES = [
  "白底简约，产品居中，柔和影棚光，干净背景",
  "生活场景，产品摆放在木质桌面，自然窗光，温暖氛围",
  "户外街拍，模特手持产品，城市背景虚化，时尚杂志感",
  "极简艺术，纯色渐变背景，产品悬浮，柔和阴影",
  "礼盒开箱，产品放置在精美包装中，丝带装饰",
  "俯拍平铺，产品与配件整齐排列，浅色布面，ins 风",
  "暗黑高级，黑色背景，聚光灯打在产品上，金属光泽",
  "温馨居家，产品放在沙发/床头，暖黄灯光，生活气息",
  "科技感，蓝色冷光背景，电路纹理，未来感",
  "自然清新，绿色植物背景，阳光穿透，环保感",
  "节日氛围，红色金色装饰，灯笼/圣诞树，喜庆感",
  "运动活力，健身房/跑道背景，动感光线，年轻感",
];

const SCENE_NAMES = [
  "白底简约",
  "生活场景",
  "户外街拍",
  "极简艺术",
  "礼盒开箱",
  "俯拍平铺",
  "暗黑高级",
  "温馨居家",
];

const ASPECT_RATIOS = [
  { label: "1:1 正方形", value: "1:1" },
  { label: "3:4 竖图", value: "3:4" },
  { label: "4:3 横图", value: "4:3" },
  { label: "16:9 宽屏", value: "16:9" },
];

const ADMIN_SECRET_KEY = "motu_admin_secret";

interface HeroBatchJob {
  id: string;
  sceneName: string;
  style: string;
  aspectRatio: string;
  heroTemplateId?: string;
  referenceHeroImage?: string;
  angle?: HeroAngle;
}

interface HistoryItem {
  id: string;
  fileName: string;
  url: string;
  createdAt: string;
  size: number;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createDefaultJob(index: number): HeroBatchJob {
  return {
    id: generateId(),
    sceneName: SCENE_NAMES[index % SCENE_NAMES.length],
    style: PRESET_STYLES[index % PRESET_STYLES.length],
    aspectRatio: "1:1",
    angle: HERO_ANGLE_IDS[index % HERO_ANGLE_IDS.length],
  };
}

export default function HeroBatchPage() {
  const searchParams = useSearchParams();
  const [productImages, setProductImages] = useState<string[]>([]);
  const [imageRoles, setImageRoles] = useState<string[]>([]);
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [jobs, setJobs] = useState<HeroBatchJob[]>(() =>
    Array.from({ length: 4 }, (_, i) => createDefaultJob(i)),
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Array<{ index: number; sceneName: string; style: string; imageUrl: string; loading: boolean; error?: string; angle?: string; headline?: string; subline?: string }>>([]);
  const [dragOver, setDragOver] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Admin auth for template library
  const [adminSecret, setAdminSecret] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(ADMIN_SECRET_KEY) || "";
  });
  const [adminInput, setAdminInput] = useState("");

  // Hero template state
  const [referenceHeroImage, setReferenceHeroImage] = useState<string | null>(null);
  const [analyzedStructure, setAnalyzedStructure] = useState<HeroTemplateStructure | null>(null);
  const [analyzingHero, setAnalyzingHero] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showTemplateNameInput, setShowTemplateNameInput] = useState(false);
  const [templates, setTemplates] = useState<HeroTemplateRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  const authHeaders = useCallback((extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
    if (adminSecret) headers["x-admin-secret"] = adminSecret;
    return headers;
  }, [adminSecret]);

  const saveAdminSecret = () => {
    const value = adminInput.trim();
    if (!value) {
      toast.error("请输入管理员密码");
      return;
    }
    localStorage.setItem(ADMIN_SECRET_KEY, value);
    setAdminSecret(value);
    toast.success("管理员密码已保存");
  };

  const clearAdminSecret = () => {
    localStorage.removeItem(ADMIN_SECRET_KEY);
    setAdminSecret("");
    setAdminInput("");
  };

  // Load saved hero templates on mount and when admin secret changes
  useEffect(() => {
    fetch("/api/hero-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setTemplates(data.data);
        }
      })
      .catch((error) => console.error("Failed to load templates:", error));
  }, [authHeaders]);

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
        headers: authHeaders(),
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
  }, [authHeaders]);

  // Auto-select template from query param
  useEffect(() => {
    const templateId = searchParams.get("templateId");
    if (templateId && templates.length > 0 && selectedTemplateId !== templateId) {
      handleSelectTemplate(templateId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, templates]);

  const handleAnalyzeImage = useCallback(async () => {
    if (productImages.length === 0) {
      toast.error("请先上传商品图片");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch("/api/hero-batch/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productImages }),
      });
      const data = await res.json();
      if (data.success) {
        const info = data.data;
        setProductName(info.productName ?? "");
        const descParts = [
          info.category ? `品类：${info.category}` : "",
          info.material ? `材质：${info.material}` : "",
          info.color ? `颜色：${info.color}` : "",
          info.targetAudience ? `目标人群：${info.targetAudience}` : "",
          Array.isArray(info.sellingPoints) && info.sellingPoints.length ? `卖点：${info.sellingPoints.join("、")}` : "",
          Array.isArray(info.numericClaims) && info.numericClaims.length ? `数字信息：${info.numericClaims.join("、")}` : "",
          info.description ?? "",
          Array.isArray(info.usageScenarios) && info.usageScenarios.length ? `适用场景：${info.usageScenarios.join("、")}` : "",
        ].filter(Boolean);
        setProductDesc(descParts.join("\n"));
        if (Array.isArray(info.imageRoles) && info.imageRoles.length) {
          setImageRoles(info.imageRoles);
        }
        toast.success("AI 分析完成，已自动填充商品信息");
      } else {
        throw new Error(data.error?.message ?? "分析失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  }, [productImages]);

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
          setImageRoles([]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const readSingleFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleReferenceHeroChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readSingleFile(file);
    setReferenceHeroImage(dataUrl);
    setSelectedTemplateId(null);
    setAnalyzedStructure(null);
  };

  const handleAnalyzeHeroImage = async () => {
    if (!referenceHeroImage) {
      toast.error("请先上传参考主图");
      return;
    }
    if (!adminSecret) {
      toast.error("请先输入管理员密码以使用模板库");
      return;
    }
    setAnalyzingHero(true);
    try {
      const res = await fetch("/api/hero-templates/analyze", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ productImage: referenceHeroImage }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalyzedStructure(data.data.structure as HeroTemplateStructure);
        toast.success("参考主图分析完成，已提取版式风格");
      } else {
        throw new Error(data.error?.message ?? "分析失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "参考主图分析失败");
    } finally {
      setAnalyzingHero(false);
    }
  };

  const handleSaveHeroTemplate = async () => {
    if (!referenceHeroImage || !analyzedStructure) {
      toast.error("请先上传并分析参考主图");
      return;
    }
    if (!adminSecret) {
      toast.error("请先输入管理员密码以保存模板");
      return;
    }
    const name = templateName.trim() || `主图模板 ${new Date().toLocaleString()}`;
    setSavingTemplate(true);
    try {
      // Convert current jobs to template scenes for reuse, excluding per-job reference images
      const scenes = jobs.map((job, index) => ({
        name: job.sceneName,
        sortOrder: index,
        stylePrompt: job.style,
        aspectRatio: job.aspectRatio,
      }));

      const res = await fetch("/api/hero-templates", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name,
          referenceImageUrl: referenceHeroImage,
          structureJson: analyzedStructure,
          styleProfile: {
            overallStyle: analyzedStructure.overallStyle,
            colorPalette: [
              analyzedStructure.colorPalette?.background,
              analyzedStructure.colorPalette?.primary,
              analyzedStructure.colorPalette?.secondary,
              analyzedStructure.colorPalette?.accent,
              analyzedStructure.colorPalette?.text,
            ],
            typography: analyzedStructure.typography,
          },
          scenes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("已保存到模板库");
        setTemplates((prev) => [data.data, ...prev]);
        setSelectedTemplateId(data.data.id);
        setShowTemplateNameInput(false);
        setTemplateName("");
      } else {
        throw new Error(data.error?.message ?? "保存失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    if (templateId === "") {
      setSelectedTemplateId(null);
      setReferenceHeroImage(null);
      setAnalyzedStructure(null);
      return;
    }
    const template = templates.find((t) => t.id === templateId) ?? null;
    setSelectedTemplateId(templateId);
    if (template) {
      setReferenceHeroImage(template.referenceImageUrl);
      setAnalyzedStructure(template.structureJson as unknown as HeroTemplateStructure);

      // If template has predefined scenes, apply them to the job list
      if (template.scenes && template.scenes.length > 0) {
        const newJobs = template.scenes.map((scene, index) => sceneToJob(scene, index));
        setJobs(newJobs);
        toast.info(`已套用模板「${template.name}」的 ${template.scenes.length} 个场景`);
      } else {
        toast.info(`已套用模板：${template.name}`);
      }
    }
  };

  const sceneToJob = (scene: HeroTemplateScene, index: number): HeroBatchJob => ({
    id: generateId(),
    sceneName: scene.name,
    style: scene.stylePrompt,
    aspectRatio: scene.aspectRatio ?? aspectRatio,
    heroTemplateId: selectedTemplateId ?? undefined,
    referenceHeroImage: scene.referenceHeroImage ?? undefined,
  });

  const clearReferenceHero = () => {
    setReferenceHeroImage(null);
    setAnalyzedStructure(null);
    setSelectedTemplateId(null);
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
    setImageRoles((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateJob = (id: string, updates: Partial<HeroBatchJob>) => {
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...updates } : job)));
  };

  const addJob = () => {
    setJobs((prev) => [...prev, createDefaultJob(prev.length)]);
  };

  const duplicateJob = (job: HeroBatchJob) => {
    setJobs((prev) => [...prev, { ...job, id: generateId() }]);
  };

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== id));
  };

  const moveJob = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= jobs.length) return;
    setJobs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  };

  const handleJobReferenceHeroChange = async (jobId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readSingleFile(file);
    updateJob(jobId, { referenceHeroImage: dataUrl, heroTemplateId: undefined });
  };

  const clearJobReferenceHero = (jobId: string) => {
    updateJob(jobId, { referenceHeroImage: undefined });
  };

  const toggleJobExpanded = (id: string) => {
    setExpandedJobs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGenerate = useCallback(async () => {
    if (!productName.trim()) {
      toast.error("请输入商品名称");
      return;
    }
    if (jobs.length === 0) {
      toast.error("请至少添加一个场景任务");
      return;
    }

    const CONCURRENCY = 3;

    setRunning(true);
    setProgress(0);
    setResults(jobs.map((job, i) => ({ index: i, sceneName: job.sceneName, style: job.style, imageUrl: "", loading: true })));

    let completed = 0;
    let nextIndex = 0;

    const generateOne = async (i: number) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);
      try {
        const job = jobs[i];
        const payload: Record<string, unknown> = {
          productName,
          productDescription: productDesc,
          productImages: productImages.length > 0 ? productImages : undefined,
          aspectRatio,
          jobs: [job],
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
          setResults((prev) =>
            prev.map((r) => (r.index === i ? {
              ...r,
              imageUrl: data.data.imageUrl,
              sceneName: data.data.sceneName ?? r.sceneName,
              angle: data.data.angle ?? r.angle,
              headline: data.data.headline ?? "",
              subline: data.data.subline ?? "",
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
    for (let w = 0; w < Math.min(CONCURRENCY, jobs.length); w++) {
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
  }, [productName, productDesc, productImages, aspectRatio, jobs, loadHistory]);

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
          上传商品图，为每个场景配置风格与套版，一次生成多张电商主图
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Left Panel - Settings */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Upload */}
              <div className="space-y-2">
                <Label>商品图片（支持多张）</Label>
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
                            {imageRoles[idx] && (
                              <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/60 text-white truncate px-1 rounded-b-lg">
                                {imageRoles[idx]}
                              </span>
                            )}
                          </div>
                        ))}
                        <div className="flex items-center justify-center h-20 rounded-lg border border-dashed border-muted-foreground/30">
                          <Upload className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">点击或拖拽上传商品图（支持多张）</p>
                      </>
                    )}
                  </label>
                </div>
                {productImages.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleAnalyzeImage}
                    disabled={analyzing}
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        AI 分析中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        AI 分析图片文案
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Hero Template */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">主图套版（可选）</Label>
                  </div>
                  {adminSecret ? (
                    <button
                      type="button"
                      onClick={clearAdminSecret}
                      className="text-[10px] text-green-600 flex items-center gap-1 hover:underline"
                    >
                      <ShieldCheck className="h-3 w-3" /> 已验证
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  选择模板后，若模板包含多个场景，会自动展开为下方任务列表
                </p>

                {!adminSecret && (
                  <div className="space-y-1.5 rounded-lg bg-muted p-2">
                    <Label className="text-xs">管理员密码</Label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="输入密码以使用模板库"
                        value={adminInput}
                        onChange={(e) => setAdminInput(e.target.value)}
                        className="flex-1 h-8 text-xs"
                      />
                      <Button size="sm" className="h-8" onClick={saveAdminSecret}>
                        保存
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">桌面端可跳过此步骤</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs">选择已保存模板</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                    value={selectedTemplateId ?? ""}
                    onChange={(e) => handleSelectTemplate(e.target.value)}
                    disabled={running}
                  >
                    <option value="">不使用模板</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}{t.scenes && t.scenes.length > 0 ? ` (${t.scenes.length} 场景)` : ""}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">或上传新的参考主图</Label>
                  <div className="relative border-2 border-dashed rounded-xl p-2 text-center transition-colors border-border hover:bg-muted/50">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleReferenceHeroChange}
                      className="hidden"
                      id="hero-template-upload"
                      disabled={running}
                    />
                    <label htmlFor="hero-template-upload" className="cursor-pointer block">
                      {referenceHeroImage ? (
                        <div className="relative group inline-block">
                          <img src={referenceHeroImage} alt="参考主图" className="h-28 w-auto rounded-lg object-contain mx-auto" />
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); clearReferenceHero(); }}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                          <p className="mt-1 text-xs text-muted-foreground">点击上传参考主图</p>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                {referenceHeroImage && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={handleAnalyzeHeroImage}
                      disabled={analyzingHero || !adminSecret}
                    >
                      {analyzingHero ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1 h-3 w-3" />
                      )}
                      分析版式
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setShowTemplateNameInput(true)}
                      disabled={!analyzedStructure || savingTemplate || !adminSecret}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      保存模板
                    </Button>
                  </div>
                )}

                {showTemplateNameInput && (
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="输入模板名称"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="flex-1 h-8 text-xs"
                    />
                    <Button size="sm" className="h-8" onClick={handleSaveHeroTemplate} disabled={savingTemplate}>
                      {savingTemplate ? <Loader2 className="h-3 w-3 animate-spin" /> : "保存"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowTemplateNameInput(false)}>
                      取消
                    </Button>
                  </div>
                )}

                {analyzedStructure && (
                  <div className="rounded-lg bg-muted p-2 text-xs space-y-1">
                    <p><span className="text-muted-foreground">风格：</span>{String(analyzedStructure.overallStyle)}</p>
                    <p><span className="text-muted-foreground">背景：</span>{String(analyzedStructure.background)}</p>
                    <p><span className="text-muted-foreground">光照：</span>{String(analyzedStructure.lighting)}</p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {analyzedStructure.colorPalette && Object.entries(analyzedStructure.colorPalette).map(([key, color]) => (
                        <div key={key} className="flex items-center gap-1 bg-background rounded px-1.5 py-0.5 border">
                          <span className="inline-block w-3 h-3 rounded-full border" style={{ backgroundColor: color }} />
                          <span className="text-[10px] text-muted-foreground">{key}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>商品名称</Label>
                <Input placeholder="如：红色保温杯" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>商品卖点/描述（可选）</Label>
                <Textarea placeholder="如：304不锈钢、24小时保温、500ml大容量..." value={productDesc} onChange={(e) => setProductDesc(e.target.value)} rows={3} />
              </div>

              <div className="space-y-2">
                <Label>默认图片比例</Label>
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>场景任务（{jobs.length} 个）</Label>
                  <Button size="sm" variant="outline" onClick={addJob} disabled={running} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> 添加场景
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  每个场景可独立配置风格、套版、参考图和比例
                </p>

                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {jobs.map((job, index) => {
                    const expanded = !!expandedJobs[job.id];
                    const hasRef = !!job.referenceHeroImage;
                    return (
                      <Card key={job.id} className="bg-muted/40">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium w-5">{index + 1}</span>
                            <Input
                              value={job.sceneName}
                              onChange={(e) => updateJob(job.id, { sceneName: e.target.value })}
                              className="flex-1 h-7 text-xs"
                              placeholder="场景名称"
                              disabled={running}
                            />
                            <button
                              type="button"
                              onClick={() => toggleJobExpanded(job.id)}
                              className="p-1 hover:bg-muted rounded"
                            >
                              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => duplicateJob(job)}
                              disabled={running}
                              className="p-1 hover:bg-muted rounded text-muted-foreground"
                              title="复制"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeJob(job.id)}
                              disabled={running || jobs.length <= 1}
                              className="p-1 hover:bg-red-50 rounded text-red-500 disabled:opacity-30"
                              title="删除"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1 pl-7">
                            <button
                              type="button"
                              onClick={() => moveJob(index, -1)}
                              disabled={index === 0 || running}
                              className="text-[10px] px-1.5 py-0.5 border rounded disabled:opacity-30"
                            >
                              上移
                            </button>
                            <button
                              type="button"
                              onClick={() => moveJob(index, 1)}
                              disabled={index === jobs.length - 1 || running}
                              className="text-[10px] px-1.5 py-0.5 border rounded disabled:opacity-30"
                            >
                              下移
                            </button>
                            <Badge variant="outline" className="text-[10px] bg-secondary/30">{job.aspectRatio}</Badge>
                            {job.heroTemplateId && <Badge variant="outline" className="text-[10px]">套版</Badge>}
                            {hasRef && <Badge variant="outline" className="text-[10px]">参考图</Badge>}
                          </div>

                          {expanded && (
                            <div className="pl-7 space-y-2 pt-1">
                              <div className="space-y-1">
                                <Label className="text-[10px]">风格 / 场景描述</Label>
                                <Textarea
                                  value={job.style}
                                  onChange={(e) => updateJob(job.id, { style: e.target.value })}
                                  rows={2}
                                  className="text-xs"
                                  placeholder="描述该场景的风格、背景、光线等"
                                  disabled={running}
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px]">图片比例</Label>
                                  <select
                                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                                    value={job.aspectRatio}
                                    onChange={(e) => updateJob(job.id, { aspectRatio: e.target.value })}
                                    disabled={running}
                                  >
                                    {ASPECT_RATIOS.map((r) => (
                                      <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px]">卖点策略</Label>
                                  <select
                                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                                    value={job.angle ?? ""}
                                    onChange={(e) => updateJob(job.id, { angle: (e.target.value || undefined) as HeroAngle | undefined })}
                                    disabled={running}
                                  >
                                    {HERO_ANGLE_IDS.map((angleId) => (
                                      <option key={angleId} value={angleId}>{HERO_ANGLE_DEFINITIONS[angleId].label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px]">套版模板</Label>
                                  <select
                                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                                    value={job.heroTemplateId ?? ""}
                                    onChange={(e) => updateJob(job.id, { heroTemplateId: e.target.value || undefined, referenceHeroImage: undefined })}
                                    disabled={running}
                                  >
                                    <option value="">跟随全局</option>
                                    {templates.map((t) => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[10px]">专属参考主图（可选，覆盖套版）</Label>
                                <div className="relative border border-dashed rounded-lg p-2 text-center transition-colors hover:bg-muted/50">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleJobReferenceHeroChange(job.id, e)}
                                    className="hidden"
                                    id={`job-ref-upload-${job.id}`}
                                    disabled={running}
                                  />
                                  <label htmlFor={`job-ref-upload-${job.id}`} className="cursor-pointer block">
                                    {job.referenceHeroImage ? (
                                      <div className="relative group inline-block">
                                        <img src={job.referenceHeroImage} alt="参考主图" className="h-20 w-auto rounded-lg object-contain mx-auto" />
                                        <button
                                          type="button"
                                          onClick={(e) => { e.preventDefault(); clearJobReferenceHero(job.id); }}
                                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <Upload className="mx-auto h-4 w-4 text-muted-foreground" />
                                        <p className="text-[10px] text-muted-foreground">点击上传</p>
                                      </>
                                    )}
                                  </label>
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              <Button onClick={handleGenerate} disabled={running} className="w-full">
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中 {progress}/{jobs.length}
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    生成 {jobs.length} 张主图
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Results */}
        <div>
          {results.length === 0 ? (
            <Card className="h-full flex items-center justify-center p-12">
              <div className="text-center">
                <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">左侧设置参数后点击生成</p>
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {results.map((r) => (
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
                            onClick={() => setLightboxSrc(r.imageUrl)}
                            aria-label="放大查看"
                          >
                            <img src={r.imageUrl} alt={`主图 ${r.index + 1}`} className="h-full w-full object-cover" />
                          </button>
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2 pointer-events-none">
                            <Button size="sm" variant="secondary" className="pointer-events-auto" onClick={() => setLightboxSrc(r.imageUrl)}>
                              <Maximize2 className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="secondary" className="pointer-events-auto" onClick={() => handleDownload(r.imageUrl, r.index)}>
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{r.sceneName || `主图 ${r.index + 1}`}</Badge>
                        {r.angle && HERO_ANGLE_DEFINITIONS[r.angle as HeroAngle] ? (
                          <Badge variant="default" className="text-[10px]">{HERO_ANGLE_DEFINITIONS[r.angle as HeroAngle].label}</Badge>
                        ) : null}
                      </div>
                      {r.headline ? <p className="mt-1 text-[10px] font-medium line-clamp-1" title={r.headline}>{r.headline}</p> : null}
                      <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{r.style}</p>
                    </div>
                  </Card>
                ))}
              </div>
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
                              onClick={() => setLightboxSrc(item.url)}
                              aria-label="放大查看"
                            >
                              <img src={item.url} alt={item.fileName} className="h-full w-full object-cover" />
                            </button>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2 pointer-events-none">
                              <Button size="sm" variant="secondary" className="pointer-events-auto" onClick={() => setLightboxSrc(item.url)}>
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
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
