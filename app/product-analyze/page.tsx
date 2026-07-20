"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  Sparkles,
  Upload,
  Trash2,
  ImageIcon,
  ScanSearch,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface AnalysisResult {
  productName: string;
  category: string;
  material: string;
  color: string;
  sellingPoints: string[];
  description: string;
  targetAudience: string;
  usageScenarios: string[];
  numericClaims: string[];
  imageRoles: string[];
}

/** 拼装为批量主图/详情页通用的卖点描述文本 */
function buildDescText(info: AnalysisResult): string {
  return [
    info.category ? `品类：${info.category}` : "",
    info.material ? `材质：${info.material}` : "",
    info.color ? `颜色：${info.color}` : "",
    info.targetAudience ? `目标人群：${info.targetAudience}` : "",
    info.sellingPoints.length ? `卖点：${info.sellingPoints.join("、")}` : "",
    info.numericClaims.length ? `数字信息：${info.numericClaims.join("、")}` : "",
    info.description,
    info.usageScenarios.length ? `适用场景：${info.usageScenarios.join("、")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function ProductAnalyzePage() {
  const [productImages, setProductImages] = useState<string[]>([]);
  const [imageRoles, setImageRoles] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [productName, setProductName] = useState("");
  const [descText, setDescText] = useState("");
  const [copied, setCopied] = useState(false);

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

  const handleAnalyze = useCallback(async () => {
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
        const info = data.data as AnalysisResult;
        setResult(info);
        setProductName(info.productName ?? "");
        setDescText(buildDescText(info));
        if (Array.isArray(info.imageRoles) && info.imageRoles.length) {
          setImageRoles(info.imageRoles);
        }
        toast.success("AI 分析完成");
      } else {
        throw new Error(data.error?.message ?? "分析失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  }, [productImages]);

  const handleCopyAll = async () => {
    const text = [`商品名称：${productName}`, "", descText].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScanSearch className="h-6 w-6" />
          商品分析
        </h1>
        <p className="text-muted-foreground mt-1">
          上传商品图片，AI 自动分析商品名称、卖点、描述等信息，可直接复制使用
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Left Panel - Upload */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>商品图片（支持多张）</Label>
                <div
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" id="analyze-upload" />
                  <label htmlFor="analyze-upload" className="cursor-pointer">
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
              </div>

              <Button onClick={handleAnalyze} disabled={analyzing || productImages.length === 0} className="w-full">
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
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Results */}
        <div>
          {!result ? (
            <Card className="h-full flex items-center justify-center p-12">
              <div className="text-center">
                <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">上传商品图后点击 AI 分析</p>
              </div>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-muted-foreground">分析结果（可编辑）</h2>
                  <Button size="sm" variant="outline" onClick={handleCopyAll}>
                    {copied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
                    复制全部
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>商品名称</Label>
                  <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>商品卖点/描述</Label>
                  <Textarea value={descText} onChange={(e) => setDescText(e.target.value)} rows={8} />
                </div>

                {result.sellingPoints.length > 0 && (
                  <div className="space-y-2">
                    <Label>核心卖点</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {result.sellingPoints.map((sp, i) => (
                        <Badge key={i} variant="default" className="text-xs">{sp}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {result.category ? (
                    <div className="rounded-lg border p-2.5">
                      <p className="text-[10px] text-muted-foreground">品类</p>
                      <p className="text-xs font-medium mt-0.5">{result.category}</p>
                    </div>
                  ) : null}
                  {result.material ? (
                    <div className="rounded-lg border p-2.5">
                      <p className="text-[10px] text-muted-foreground">材质</p>
                      <p className="text-xs font-medium mt-0.5">{result.material}</p>
                    </div>
                  ) : null}
                  {result.color ? (
                    <div className="rounded-lg border p-2.5">
                      <p className="text-[10px] text-muted-foreground">颜色</p>
                      <p className="text-xs font-medium mt-0.5">{result.color}</p>
                    </div>
                  ) : null}
                  {result.targetAudience ? (
                    <div className="rounded-lg border p-2.5">
                      <p className="text-[10px] text-muted-foreground">目标人群</p>
                      <p className="text-xs font-medium mt-0.5">{result.targetAudience}</p>
                    </div>
                  ) : null}
                </div>

                {result.numericClaims.length > 0 && (
                  <div className="space-y-2">
                    <Label>数字信息</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {result.numericClaims.map((nc, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{nc}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {result.usageScenarios.length > 0 && (
                  <div className="space-y-2">
                    <Label>适用场景</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {result.usageScenarios.map((sc, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{sc}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
