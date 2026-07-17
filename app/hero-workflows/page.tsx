"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileImage,
  GitBranch,
  Loader2,
  Package,
  Play,
  RefreshCw,
  SkipForward,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { HeroWorkflowRecord, WorkflowStage } from "@/types/hero-workflow";

const STAGES: WorkflowStage[] = [
  "EXTRACT",
  "STRATEGY",
  "WHITE_BG",
  "SCENES",
  "COPIES",
  "VARIANTS",
  "ASSETS",
  "REVIEW",
  "EXPORT",
];

const STAGE_LABELS: Record<WorkflowStage, string> = {
  EXTRACT: "信息识别",
  STRATEGY: "生成策略",
  WHITE_BG: "白底图",
  SCENES: "场景底图",
  COPIES: "文案生成",
  VARIANTS: "裂变变体",
  ASSETS: "产品素材",
  REVIEW: "质量审查",
  EXPORT: "导出打包",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  RUNNING: "bg-blue-100 text-blue-700",
  REVIEW_REQUIRED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-4 w-4" />,
  RUNNING: <Loader2 className="h-4 w-4 animate-spin" />,
  REVIEW_REQUIRED: <AlertTriangle className="h-4 w-4" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4" />,
  FAILED: <XCircle className="h-4 w-4" />,
};

export default function HeroWorkflowsPage() {
  const [workflows, setWorkflows] = useState<HeroWorkflowRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editStageData, setEditStageData] = useState<string>("");

  const selected = workflows.find((w) => w.id === selectedId);

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/hero-workflows");
      const data = await res.json();
      if (data.success) setWorkflows(data.data);
    } catch {
      console.error("加载工作流失败");
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
    const interval = setInterval(loadWorkflows, 3000);
    return () => clearInterval(interval);
  }, [loadWorkflows]);

  useEffect(() => {
    if (selected) {
      setEditStageData(JSON.stringify(selected.stageData, null, 2));
    }
  }, [selected?.id, selected?.stageData]);

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFile(file);
    setSourceImage(dataUrl);
  };

  const handleCreate = async () => {
    if (!sourceImage) {
      toast.error("请上传商品原图");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/hero-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          sourceImageUrl: sourceImage,
          autoStart: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWorkflows((prev) => [data.data, ...prev]);
        setSelectedId(data.data.id);
        setSourceImage(null);
        setProductName("");
        toast.success("工作流已创建并开始运行");
      } else {
        throw new Error(data.error?.message ?? "创建失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: string, stageData?: unknown) => {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/hero-workflows/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, stageData }),
      });
      const data = await res.json();
      if (data.success) {
        setWorkflows((prev) => prev.map((w) => (w.id === id ? data.data : w)));
        toast.success("操作成功");
      } else {
        throw new Error(data.error?.message ?? "操作失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/hero-workflows/${id}`, { method: "DELETE" });
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const renderStageContent = (workflow: HeroWorkflowRecord) => {
    const stage = workflow.currentStage;
    const data = workflow.stageData;

    if (stage === "EXTRACT" && data.extract) {
      return (
        <div className="space-y-3 text-sm">
          <p><strong>商品名称：</strong>{data.extract.productName}</p>
          <p><strong>描述：</strong>{data.extract.productDescription || "-"}</p>
          <p><strong>类别：</strong>{data.extract.category || "-"}</p>
          <div><strong>规格：</strong>
            {data.extract.specs.length === 0 ? "-" : (
              <ul className="list-disc pl-5">
                {data.extract.specs.map((s, i) => <li key={i}>{s.label}：{s.value}</li>)}
              </ul>
            )}
          </div>
          <div><strong>成分：</strong>{data.extract.ingredients.join("、") || "-"}</div>
          <div><strong>营养成分：</strong>
            {data.extract.nutritionRows.length === 0 ? "-" : (
              <ul className="list-disc pl-5">
                {data.extract.nutritionRows.map((r, i) => <li key={i}>{r.label}：{r.value} {r.unit}</li>)}
              </ul>
            )}
          </div>
        </div>
      );
    }

    if (stage === "STRATEGY" && data.strategy) {
      return (
        <div className="space-y-3 text-sm">
          <p><strong>选中场景：</strong>{data.strategy.sceneIds.join(", ")}</p>
          <p><strong>排版：</strong>{data.strategy.layouts.join(", ")}</p>
          <p><strong>文案风格：</strong>{data.strategy.copyStyles.join(", ")}</p>
          <p><strong>文案数量：</strong>{data.strategy.copyCount}</p>
          <p><strong>生成素材：</strong>{data.strategy.assetTypes.join(", ")}</p>
          <div><strong>店铺/链接：</strong>
            {data.strategy.stores.map((s, i) => (
              <div key={i} className="pl-2">{s.name}: {s.links.join("、")}</div>
            ))}
          </div>
        </div>
      );
    }

    if (stage === "WHITE_BG" && data.whiteBg) {
      return <img src={data.whiteBg.imageUrl} alt="白底图" className="h-64 object-contain bg-white rounded border" />;
    }

    if (stage === "SCENES" && data.scenes) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {data.scenes.map((scene, idx) => (
            <div key={idx} className="border rounded-lg overflow-hidden bg-muted">
              <div className="p-2 text-xs font-medium border-b bg-background">{scene.sceneName} · {scene.status}</div>
              {scene.imageUrl ? (
                <img src={scene.imageUrl} alt={scene.sceneName} className="h-32 w-full object-cover" />
              ) : (
                <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">{scene.errorMessage || "生成中"}</div>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (stage === "COPIES" && data.copies) {
      return (
        <div className="space-y-2">
          {data.copies.map((copy, idx) => (
            <div key={idx} className="border rounded p-2 text-sm">
              <p className="font-medium">{copy.copyText}</p>
              {copy.subCopyText && <p className="text-muted-foreground text-xs">{copy.subCopyText}</p>}
              <div className="flex gap-1 mt-1">
                {copy.tags.map((t, i) => <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (stage === "VARIANTS" && data.variants) {
      const completed = data.variants.filter((v) => v.status === "COMPLETED" && v.imageUrl);
      return (
        <div>
          <p className="text-sm text-muted-foreground mb-2">已完成 {completed.length} / {data.variants.length}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.variants.slice(0, 8).map((v, idx) => (
              <div key={idx} className="border rounded-lg overflow-hidden bg-muted">
                {v.imageUrl ? (
                  <img src={v.imageUrl} alt={v.copyText} className="h-24 w-full object-cover" />
                ) : (
                  <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">{v.errorMessage || v.status}</div>
                )}
                <div className="p-1 text-[10px] truncate">{v.copyText}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (stage === "ASSETS" && data.assets) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.assets.map((asset, idx) => (
            <div key={idx} className="border rounded-lg overflow-hidden bg-muted">
              <div className="p-1 text-xs font-medium border-b bg-background">{asset.type}</div>
              <img src={asset.imageUrl} alt={asset.type} className="h-24 w-full object-contain bg-white" />
            </div>
          ))}
        </div>
      );
    }

    if (stage === "REVIEW" && data.review) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold">{data.review.score}</div>
            <Badge className={data.review.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
              {data.review.passed ? "通过" : "未通过"}
            </Badge>
          </div>
          <div className="space-y-2">
            {data.review.issues.map((issue, idx) => (
              <div key={idx} className="text-sm border-l-2 pl-2" style={{ borderColor: issue.severity === "high" ? "#ef4444" : issue.severity === "medium" ? "#f59e0b" : "#3b82f6" }}>
                <span className="font-medium">[{issue.type}]</span> {issue.target} — {issue.message}
              </div>
            ))}
            {data.review.issues.length === 0 && <p className="text-sm text-muted-foreground">未发现明显问题</p>}
          </div>
        </div>
      );
    }

    if (stage === "EXPORT" && data.export) {
      return (
        <div className="space-y-3">
          <p className="text-sm">已导出 {data.export.variantCount} 张图片</p>
          <a href={data.export.zipFilePath} download className="text-primary text-sm underline">
            下载 ZIP
          </a>
        </div>
      );
    }

    return <p className="text-sm text-muted-foreground">当前阶段暂无预览数据</p>;
  };

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <GitBranch className="h-6 w-6" />
        AI 自动化工作流
      </h1>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-medium">新建工作流</h3>
              <div className="space-y-2">
                <Label>商品原图</Label>
                <div className="border-2 border-dashed rounded-xl p-4 text-center">
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" id="workflow-image" />
                  <label htmlFor="workflow-image" className="cursor-pointer block">
                    {sourceImage ? (
                      <img src={sourceImage} alt="商品" className="h-40 w-full object-contain rounded-lg" />
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
                <Label>商品名称（可选）</Label>
                <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="AI 可自动识别" />
              </div>
              <Button onClick={handleCreate} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                创建并运行
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">工作流列表</h3>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {workflows.map((w) => (
                  <div
                    key={w.id}
                    onClick={() => setSelectedId(w.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedId === w.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{w.productName}</span>
                      <Badge className={STATUS_COLORS[w.status]}>{STATUS_ICONS[w.status]}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {STAGE_LABELS[w.currentStage]} · {new Date(w.updatedAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {selected ? (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{selected.productName}</h2>
                    <p className="text-xs text-muted-foreground">ID: {selected.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_COLORS[selected.status]}>
                      {STATUS_ICONS[selected.status]} {selected.status === "REVIEW_REQUIRED" ? "待审核" : selected.status}
                    </Badge>
                    {selected.status === "REVIEW_REQUIRED" && (
                      <>
                        <Button size="sm" onClick={() => handleAction(selected.id, "continue")} disabled={!!actionLoading}>
                          {actionLoading === "continue" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                          继续
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleAction(selected.id, "retry")} disabled={!!actionLoading}>
                          {actionLoading === "retry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          重跑
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleAction(selected.id, "skip")} disabled={!!actionLoading}>
                          {actionLoading === "skip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                          跳过
                        </Button>
                      </>
                    )}
                    {selected.status === "FAILED" && (
                      <Button size="sm" variant="outline" onClick={() => handleAction(selected.id, "retry")} disabled={!!actionLoading}>
                        {actionLoading === "retry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        重试
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(selected.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-1 overflow-x-auto py-2">
                  {STAGES.map((s, idx) => {
                    const isCurrent = s === selected.currentStage;
                    const passed = STAGES.indexOf(s) < STAGES.indexOf(selected.currentStage);
                    return (
                      <div key={s} className="flex items-center shrink-0">
                        <div
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            isCurrent
                              ? "bg-primary text-primary-foreground"
                              : passed
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {STAGE_LABELS[s]}
                        </div>
                        {idx < STAGES.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300 mx-1" />}
                      </div>
                    );
                  })}
                </div>

                <div className="border rounded-lg p-4 bg-muted/30">
                  <h3 className="font-medium mb-3">{STAGE_LABELS[selected.currentStage]} 预览</h3>
                  {renderStageContent(selected)}
                </div>

                {selected.status === "REVIEW_REQUIRED" && (
                  <div className="space-y-2">
                    <Label>阶段数据 JSON（可直接编辑后点击继续）</Label>
                    <Textarea
                      value={editStageData}
                      onChange={(e) => setEditStageData(e.target.value)}
                      rows={8}
                      className="font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(editStageData);
                          handleAction(selected.id, "continue", parsed);
                        } catch {
                          toast.error("JSON 格式错误");
                        }
                      }}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === "continue" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      保存并继续
                    </Button>
                  </div>
                )}

                {selected.errorMessage && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                    错误：{selected.errorMessage}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <GitBranch className="mx-auto h-10 w-10 mb-2 opacity-50" />
                左侧创建或选择一个工作流
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
