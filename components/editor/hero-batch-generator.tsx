"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, ImageIcon, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  clearGenerationIdempotencyKey,
  getOrCreateGenerationIdempotencyKey,
} from "@/lib/utils/generation-request";

const PRESET_STYLES = [
  { id: "white", label: "白底简约", desc: "高端简约白底图，产品居中，柔和影棚光" },
  { id: "lifestyle", label: "生活场景", desc: "产品摆放在木质桌面，自然窗光，温暖氛围" },
  { id: "street", label: "户外街拍", desc: "模特手持产品，城市背景虚化，时尚杂志感" },
  { id: "minimal", label: "极简艺术", desc: "纯色渐变背景，产品悬浮，柔和阴影" },
  { id: "gift", label: "礼盒开箱", desc: "产品放置在精美包装中，丝带装饰" },
  { id: "flatlay", label: "俯拍平铺", desc: "产品与配件整齐排列，ins 风" },
  { id: "dark", label: "暗黑高级", desc: "黑色背景，聚光灯，金属光泽，科技风" },
  { id: "cozy", label: "温馨居家", desc: "产品放在沙发/床头，暖黄灯光" },
];

interface HeroBatchGeneratorProps {
  projectId: string;
}

type BatchResult = {
  index: number;
  style: string;
  success: boolean;
  assetId?: string;
  error?: string;
};

type BatchProgress = {
  completed: number;
  total: number;
  succeeded: number;
  failed: number;
};

export function HeroBatchGenerator({ projectId }: HeroBatchGeneratorProps) {
  const router = useRouter();
  const [showPanel, setShowPanel] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [progress, setProgress] = useState<BatchProgress>({ completed: 0, total: 0, succeeded: 0, failed: 0 });
  const [selectedStyles, setSelectedStyles] = useState<string[]>(["white", "lifestyle", "street", "minimal"]);

  const toggleStyle = (id: string) => {
    setSelectedStyles((prev) => {
      if (prev.includes(id)) {
        return prev.filter((s) => s !== id);
      }
      if (prev.length >= 8) return prev;
      return [...prev, id];
    });
  };

  const handleGenerate = useCallback(async () => {
    if (selectedStyles.length < 2) {
      toast.error("请至少选择 2 种风格");
      return;
    }

    const styles = selectedStyles.map((id) => PRESET_STYLES.find((s) => s.id === id)?.desc ?? "").filter(Boolean);

    setRunning(true);
    setResults(null);
    setProgress({ completed: 0, total: styles.length, succeeded: 0, failed: 0 });
    toast.info(`开始批量生成 ${styles.length} 张头图，请耐心等待...`);

    const idempotencyScope = `${projectId}:hero-batch`;
    const idempotencyKey = getOrCreateGenerationIdempotencyKey(idempotencyScope);
    try {
      const res = await fetch(`/api/projects/${projectId}/hero-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ count: styles.length, styles, idempotencyKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "生成失败");
      }

      if (!res.body) throw new Error("生成进度流不可用");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completedEvent = false;
      let finalSuccessCount = 0;

      const handleEvent = (line: string) => {
        const event = JSON.parse(line) as {
          type: "started" | "progress" | "complete" | "error";
          completed?: number;
          total?: number;
          generatedCount?: number;
          failedCount?: number;
          result?: BatchResult;
          results?: BatchResult[];
          message?: string;
        };

        if (event.type === "started") {
          setProgress((current) => ({ ...current, total: event.total ?? current.total }));
          return;
        }
        if (event.type === "progress" && event.result) {
          setProgress({
            completed: event.completed ?? 0,
            total: event.total ?? styles.length,
            succeeded: event.generatedCount ?? 0,
            failed: event.failedCount ?? 0,
          });
          setResults((current) => {
            const next = [...(current ?? [])];
            next[event.result!.index] = event.result!;
            return next.filter(Boolean);
          });
          return;
        }
        if (event.type === "complete") {
          completedEvent = true;
          finalSuccessCount = event.generatedCount ?? 0;
          setResults(event.results ?? []);
          setProgress({
            completed: event.total ?? styles.length,
            total: event.total ?? styles.length,
            succeeded: event.generatedCount ?? 0,
            failed: (event.total ?? styles.length) - (event.generatedCount ?? 0),
          });
          return;
        }
        if (event.type === "error") {
          throw new Error(event.message ?? "生成失败");
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.filter(Boolean).forEach(handleEvent);
        if (done) break;
      }
      if (buffer.trim()) handleEvent(buffer.trim());
      if (!completedEvent) throw new Error("生成进度流提前结束");

      clearGenerationIdempotencyKey(idempotencyScope, idempotencyKey);
      const successCount = finalSuccessCount;
      if (successCount === styles.length) {
        toast.success(`全部 ${successCount} 张头图生成完成！`);
      } else {
        toast.warning(`${successCount}/${styles.length} 张生成成功`);
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setRunning(false);
    }
  }, [projectId, selectedStyles, router]);

  return (
    <div>
      <Button variant="outline" onClick={() => { setShowPanel((v) => !v); setResults(null); setProgress({ completed: 0, total: 0, succeeded: 0, failed: 0 }); }}>
        <Sparkles className="mr-2 h-4 w-4" />
        批量生成头图
      </Button>

      {showPanel && (
        <Card className="mt-3 overflow-hidden">
          <CardContent className="p-4 space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">选择风格（{selectedStyles.length} 种）</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {PRESET_STYLES.map((style) => {
                  const selected = selectedStyles.includes(style.id);
                  return (
                    <button
                      key={style.id}
                      onClick={() => toggleStyle(style.id)}
                      disabled={running}
                      className={`rounded-xl border p-2 text-left text-xs transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="font-medium">{style.label}</div>
                      <div className="mt-0.5 text-muted-foreground line-clamp-2">{style.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={running || selectedStyles.length < 2}
              className="w-full"
            >
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中 {progress.completed}/{progress.total}
                </>
              ) : (
                <>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  生成 {selectedStyles.length} 张头图
                </>
              )}
            </Button>

            {progress.total > 0 && (
              <div className="space-y-2 border-t pt-3" aria-live="polite">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">生成进度</span>
                  <span className="text-muted-foreground">{progress.completed}/{progress.total}</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.completed}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full bg-primary transition-[width] duration-300"
                    style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex gap-4 text-[10px] text-muted-foreground">
                  <span className="text-green-600">成功 {progress.succeeded}</span>
                  <span className="text-red-500">失败 {progress.failed}</span>
                  <span>剩余 {Math.max(0, progress.total - progress.completed)}</span>
                </div>
              </div>
            )}

            {results && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">生成结果（{results.length}/{progress.total}）</h4>
                <div className="space-y-1.5">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {r.success ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      )}
                      <Badge variant="outline" className="text-[10px] shrink-0">头图 {i + 1}</Badge>
                      <span className="truncate text-muted-foreground">{r.style}</span>
                      {r.error && <span className="text-red-500 shrink-0">({r.error})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
