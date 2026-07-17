"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Sparkles, Upload, Trash2, Package, Wand2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type {
  HeroSceneLibraryRecord,
  HeroCopyLibraryRecord,
  HeroSceneGenerationRecord,
  HeroSceneVariantRecord,
} from "@/types/hero-scene";
import { LAYOUT_STYLES } from "@/types/hero-scene";

export default function HeroSceneGeneratorPage() {
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [scenes, setScenes] = useState<HeroSceneLibraryRecord[]>([]);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [copyLibraries, setCopyLibraries] = useState<HeroCopyLibraryRecord[]>([]);
  const [selectedCopyLibraryId, setSelectedCopyLibraryId] = useState<string>("");
  const [selectedLayouts, setSelectedLayouts] = useState<string[]>(["title-bottom", "center-tag"]);
  const [generations, setGenerations] = useState<HeroSceneGenerationRecord[]>([]);
  const [variants, setVariants] = useState<HeroSceneVariantRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch("/api/hero-scenes")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setScenes(data.data);
          setSelectedScenes(data.data.map((s: HeroSceneLibraryRecord) => s.id));
        }
      });

    fetch("/api/hero-copies")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCopyLibraries(data.data);
          if (data.data.length > 0) setSelectedCopyLibraryId(data.data[0].id);
        }
      });
  }, []);

  const loadGenerations = useCallback(async () => {
    try {
      const res = await fetch("/api/hero-scene-generations");
      const data = await res.json();
      if (data.success) setGenerations(data.data);
    } catch {
      console.error("加载生成任务失败");
    }
  }, []);

  const loadVariants = useCallback(async (generationId?: string) => {
    try {
      const url = generationId
        ? `/api/hero-scene-variants?generationId=${generationId}`
        : "/api/hero-scene-variants?generationId=";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setVariants(data.data);
    } catch {
      console.error("加载变体失败");
    }
  }, []);

  useEffect(() => {
    loadGenerations();
    const interval = setInterval(() => {
      loadGenerations();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadGenerations]);

  useEffect(() => {
    const completedIds = generations.filter((g) => g.status === "COMPLETED").map((g) => g.id);
    if (completedIds.length > 0) {
      loadVariants();
    }
  }, [generations, loadVariants]);

  const readFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFile(file);
    setProductImage(dataUrl);
  };

  const toggleScene = (id: string) => {
    setSelectedScenes((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const toggleLayout = (value: string) => {
    setSelectedLayouts((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const handleGenerateScenes = async () => {
    if (!productImage) {
      toast.error("请上传商品原图");
      return;
    }
    if (!productName.trim()) {
      toast.error("请输入商品名称");
      return;
    }
    if (selectedScenes.length === 0) {
      toast.error("请至少选择一个场景");
      return;
    }

    setRunning(true);
    try {
      const res = await fetch("/api/hero-scene-generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          productDescription: productDesc,
          sourceImageUrl: productImage,
          sceneLibraryIds: selectedScenes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`已创建 ${data.data.length} 个场景生成任务`);
        loadGenerations();
      } else {
        throw new Error(data.error?.message ?? "生成失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setRunning(false);
    }
  };

  const handleGenerateVariants = async () => {
    const completed = generations.filter((g) => g.status === "COMPLETED");
    if (completed.length === 0) {
      toast.error("没有已完成的场景底图");
      return;
    }
    if (!selectedCopyLibraryId) {
      toast.error("请选择文案组");
      return;
    }
    if (selectedLayouts.length === 0) {
      toast.error("请至少选择一种排版");
      return;
    }

    const copyLib = copyLibraries.find((l) => l.id === selectedCopyLibraryId);
    if (!copyLib || copyLib.copies.length === 0) {
      toast.error("文案组为空");
      return;
    }

    setRunning(true);
    try {
      for (const generation of completed) {
        const copies = copyLib.copies.map((copyText) => ({ copyText, tags: ["限时", "包邮"].slice(0, Math.floor(Math.random() * 2) + 1) }));
        const res = await fetch("/api/hero-scene-variants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generationId: generation.id,
            copies,
            layoutStyles: selectedLayouts,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message ?? "裂变失败");
      }
      toast.success("变体生成任务已提交");
      setTimeout(() => loadVariants(), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "裂变失败");
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async () => {
    const completedVariants = variants.filter((v) => v.status === "COMPLETED" && v.variantImageUrl);
    if (completedVariants.length === 0) {
      toast.error("没有可导出的变体");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/hero-scene-exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          variantIds: completedVariants.map((v) => v.id),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const zipUrl = data.data.exportRecord.zipFilePath;
        const a = document.createElement("a");
        a.href = zipUrl;
        a.download = `${productName || "商品"}.zip`;
        a.click();
        toast.success(`已导出 ${data.data.exportRecord.variantCount} 张图片`);
      } else {
        throw new Error(data.error?.message ?? "导出失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <Sparkles className="h-6 w-6" />
        AI 场景裂变工作台
      </h1>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Left Panel */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>商品原图</Label>
                <div className="border-2 border-dashed rounded-xl p-4 text-center">
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" id="product-image" />
                  <label htmlFor="product-image" className="cursor-pointer block">
                    {productImage ? (
                      <img src={productImage} alt="商品" className="h-40 w-full object-contain rounded-lg" />
                    ) : (
                      <>
                        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">点击上传商品原图</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>商品名称</Label>
                <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="如：红色保温杯" />
              </div>

              <div className="space-y-2">
                <Label>商品描述</Label>
                <Textarea value={productDesc} onChange={(e) => setProductDesc(e.target.value)} rows={3} placeholder="材质、卖点、适用人群..." />
              </div>

              <div className="space-y-2">
                <Label>选择场景（{selectedScenes.length} 个）</Label>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {scenes.map((scene) => (
                    <button
                      key={scene.id}
                      onClick={() => toggleScene(scene.id)}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        selectedScenes.includes(scene.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {scene.name}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={handleGenerateScenes} disabled={running} className="w-full">
                {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
                生成场景底图
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-medium">裂变配置</h3>

              <div className="space-y-2">
                <Label>文案组</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedCopyLibraryId}
                  onChange={(e) => setSelectedCopyLibraryId(e.target.value)}
                >
                  <option value="">选择文案组</option>
                  {copyLibraries.map((lib) => (
                    <option key={lib.id} value={lib.id}>{lib.name} ({lib.copies.length} 条)</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>排版样式</Label>
                <div className="flex flex-wrap gap-1.5">
                  {LAYOUT_STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => toggleLayout(style.value)}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        selectedLayouts.includes(style.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={handleGenerateVariants} disabled={running} variant="outline" className="w-full">
                {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                生成裂变变体
              </Button>

              <Button onClick={handleExport} disabled={exporting} className="w-full">
                {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Package className="h-4 w-4 mr-1" />}
                按品名导出 ZIP
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">场景底图</h3>
              {generations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ImageIcon className="mx-auto h-10 w-10 mb-2 opacity-50" />
                  左侧上传商品并生成场景
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {generations.map((gen) => (
                    <div key={gen.id} className="relative group bg-muted rounded-lg overflow-hidden aspect-square">
                      {gen.status === "COMPLETED" && gen.generatedImageUrl ? (
                        <img src={gen.generatedImageUrl} alt={gen.sceneLibrary?.name} className="h-full w-full object-cover" />
                      ) : gen.status === "FAILED" ? (
                        <div className="h-full flex items-center justify-center text-xs text-red-500 p-2 text-center">失败</div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          {gen.whiteBgImageUrl && (
                            <span className="text-[10px] text-muted-foreground mt-1">白底已生成，场景生成中</span>
                          )}
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 truncate">
                        {gen.sceneLibrary?.name} · {gen.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">裂变变体</h3>
              {variants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  先生成场景底图，再生成变体
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {variants.map((variant) => (
                    <div key={variant.id} className="relative group bg-muted rounded-lg overflow-hidden aspect-square">
                      {variant.status === "COMPLETED" && variant.variantImageUrl ? (
                        <img src={variant.variantImageUrl} alt={variant.copyText} className="h-full w-full object-cover" />
                      ) : variant.status === "FAILED" ? (
                        <div className="h-full flex items-center justify-center text-xs text-red-500 p-2 text-center">失败</div>
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 truncate">
                        {variant.copyText}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
