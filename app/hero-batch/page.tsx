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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { HeroTemplateRecord, HeroTemplateStructure } from "@/types/hero-template";

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

const ASPECT_RATIOS = [
  { label: "1:1 正方形", value: "1:1" },
  { label: "3:4 竖图", value: "3:4" },
  { label: "4:3 横图", value: "4:3" },
  { label: "16:9 宽屏", value: "16:9" },
];

const ADMIN_SECRET_KEY = "motu_admin_secret";

export default function HeroBatchPage() {
  const searchParams = useSearchParams();
  const [productImages, setProductImages] = useState<string[]>([]);
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [count, setCount] = useState(10);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [selectedStyles, setSelectedStyles] = useState<string[]>(PRESET_STYLES.slice(0, 4));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<Array<{ index: number; style: string; imageUrl: string; loading: boolean; error?: string }>>([]);
  const [dragOver, setDragOver] = useState(false);

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
  const [exporting, setExporting] = useState(false);

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
        body: JSON.stringify({ productImage: productImages[0] }),
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
          info.description ?? "",
          Array.isArray(info.usageScenarios) && info.usageScenarios.length ? `适用场景：${info.usageScenarios.join("、")}` : "",
        ].filter(Boolean);
        setProductDesc(descParts.join("\n"));
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
        setAnalyzedStructure(data.data.structure);
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
              analyzedStructure.colorPalette.background,
              analyzedStructure.colorPalette.primary,
              analyzedStructure.colorPalette.secondary,
              analyzedStructure.colorPalette.accent,
              analyzedStructure.colorPalette.text,
            ],
            typography: analyzedStructure.typography,
          },
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
      return;
    }
    const template = templates.find((t) => t.id === templateId) ?? null;
    setSelectedTemplateId(templateId);
    if (template) {
      setReferenceHeroImage(template.referenceImageUrl);
      setAnalyzedStructure(template.structureJson);
      toast.info(`已套用模板：${template.name}`);
    }
  };

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
  };

  const toggleStyle = (style: string) => {
    setSelectedStyles((prev) => {
      if (prev.includes(style)) return prev.filter((s) => s !== style);
      if (prev.length >= 12) return prev;
      return [...prev, style];
    });
  };

  const handleGenerate = useCallback(async () => {
    if (!productName.trim()) {
      toast.error("请输入商品名称");
      return;
    }
    if (selectedStyles.length === 0) {
      toast.error("请至少选择一种风格");
      return;
    }

    const stylesToUse: string[] = [];
    for (let i = 0; i < count; i++) {
      stylesToUse.push(selectedStyles[i % selectedStyles.length]);
    }

    const CONCURRENCY = 3;

    setRunning(true);
    setProgress(0);
    setResults(stylesToUse.map((style, i) => ({ index: i, style, imageUrl: "", loading: true })));

    let completed = 0;
    let nextIndex = 0;

    const generateOne = async (i: number) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);
      try {
        const payload: Record<string, unknown> = {
          productName,
          productDescription: productDesc,
          productImages: productImages.length > 0 ? productImages : undefined,
          style: stylesToUse[i],
          aspectRatio,
        };
        if (selectedTemplateId) {
          payload.heroTemplateId = selectedTemplateId;
        } else if (referenceHeroImage) {
          payload.referenceHeroImage = referenceHeroImage;
        }
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
            prev.map((r) => (r.index === i ? { ...r, imageUrl: data.data.imageUrl, loading: false } : r)),
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
    for (let w = 0; w < Math.min(CONCURRENCY, stylesToUse.length); w++) {
      workers.push(
        (async () => {
          while (nextIndex < stylesToUse.length) {
            const i = nextIndex++;
            await generateOne(i);
          }
        })(),
      );
    }

    await Promise.all(workers);

    setRunning(false);
    toast.success("批量生成完成！");
  }, [productName, productDesc, productImages, count, aspectRatio, selectedStyles, selectedTemplateId, referenceHeroImage]);

  const handleDownload = async (url: string, index: number) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `主图-${productName || "商品"}-${index + 1}.png`;
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
          上传商品图，选择风格，一次生成 10-20 张电商主图
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
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
                  上传一张参考主图，AI 会学习其版式、配色和排版风格进行生成
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
                      <option key={t.id} value={t.id}>{t.name}</option>
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
                    <p><span className="text-muted-foreground">风格：</span>{analyzedStructure.overallStyle}</p>
                    <p><span className="text-muted-foreground">背景：</span>{analyzedStructure.background}</p>
                    <p><span className="text-muted-foreground">光照：</span>{analyzedStructure.lighting}</p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {Object.entries(analyzedStructure.colorPalette).map(([key, color]) => (
                        <div key={key} className="flex items-center gap-1 bg-background rounded px-1.5 py-0.5 border">
                          <span className="inline-block w-3 h-3 rounded-full border" style={{ backgroundColor: color as string }} />
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
                <Label>生成数量：{count} 张</Label>
                <input
                  type="range"
                  min={5}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>5</span>
                  <span>20</span>
                </div>
              </div>

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

              <div className="space-y-2">
                <Label>选择风格（{selectedStyles.length} 种）</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_STYLES.map((style) => {
                    const selected = selectedStyles.includes(style);
                    return (
                      <button
                        key={style}
                        onClick={() => toggleStyle(style)}
                        disabled={running}
                        className={`rounded-full px-2.5 py-1 text-[10px] border transition-colors ${
                          selected ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"
                        }`}
                      >
                        {selected ? "✓ " : ""}
                        {style.split("，")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button onClick={handleGenerate} disabled={running} className="w-full">
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中 {progress}/{count}
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    生成 {count} 张主图
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
                          <img src={r.imageUrl} alt={`主图 ${r.index + 1}`} className="h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2">
                            <Button size="sm" variant="secondary" onClick={() => handleDownload(r.imageUrl, r.index)}>
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="p-2">
                      <Badge variant="outline" className="text-[10px]">主图 {r.index + 1}</Badge>
                      <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{r.style}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
