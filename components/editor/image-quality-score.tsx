"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ImageQualityScoreData {
  id: string;
  assetId: string;
  overallScore: number;
  colorConsistencyScore: number;
  promptAlignmentScore: number;
  copyAlignmentScore: number;
  compositionScore: number;
  typographyScore: number;
  analysis: string | null;
  scoredByModel: string | null;
  scoredAt: string | null;
}

interface ImageQualityScoreProps {
  assetId: string | null | undefined;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function ScoreRadar({ items }: { items: { label: string; value: number }[] }) {
  const size = 160;
  const center = size / 2;
  const radius = 56;
  const angleStep = (Math.PI * 2) / items.length;
  const points = items.map((item, index) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (item.value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
      labelX: center + (radius + 18) * Math.cos(angle),
      labelY: center + (radius + 18) * Math.sin(angle),
    };
  });

  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="overflow-visible">
        {[0.25, 0.5, 0.75, 1].map((scale) => {
          const ring = items.map((_, index) => {
            const angle = index * angleStep - Math.PI / 2;
            const r = radius * scale;
            return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
          }).join(" ");
          return <polygon key={scale} points={ring} fill="none" stroke="currentColor" strokeOpacity={0.12} className="text-muted-foreground" />;
        })}
        {points.map((p, index) => (
          <line
            key={index}
            x1={center}
            y1={center}
            x2={p.labelX}
            y2={p.labelY}
            stroke="currentColor"
            strokeOpacity={0.12}
            className="text-muted-foreground"
          />
        ))}
        <polygon points={polygonPoints} fill="rgba(16, 185, 129, 0.18)" stroke="#10b981" strokeWidth={2} />
        {points.map((p, index) => (
          <circle key={index} cx={p.x} cy={p.y} r={3} fill="#10b981" />
        ))}
        {items.map((item, index) => (
          <text
            key={`label-${index}`}
            x={points[index].labelX}
            y={points[index].labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground text-[9px]"
          >
            {item.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 60) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export function ImageQualityScore({ assetId }: ImageQualityScoreProps) {
  const [score, setScore] = useState<ImageQualityScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchScore = useCallback(async () => {
    if (!assetId) return;
    try {
      const res = await fetch(`/api/assets/${assetId}/score`);
      const payload = await res.json();
      if (payload.success && payload.data.score) {
        setScore(payload.data.score);
      } else {
        setScore(null);
      }
    } catch (error) {
      console.error("[ImageQualityScore] fetch failed:", error);
    }
  }, [assetId]);

  const handleRescore = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/assets/${assetId}/score`, { method: "POST" });
      const payload = await res.json();
      if (!payload.success) {
        toast.error(payload.error?.message ?? "评分失败");
        return;
      }
      setScore(payload.data.score);
      toast.success("图片质量评分已完成");
    } catch (error) {
      toast.error("评分请求失败");
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    setScore(null);
    fetchScore();
  }, [assetId, fetchScore]);

  if (!assetId) {
    return null;
  }

  if (!score && !loading) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">图片质量评分</span>
          <Button size="sm" variant="outline" onClick={handleRescore} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            评分
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">暂无评分，点击“评分”调用 vision 模型评估当前图片。</p>
      </div>
    );
  }

  if (loading && !score) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">图片质量评分</span>
          <span className="text-xs text-muted-foreground">评分中...</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">正在调用 vision 模型分析图片，请稍候。</p>
      </div>
    );
  }

  if (!score) return null;

  const items = [
    { label: "整体质量", value: score.overallScore },
    { label: "色彩一致性", value: score.colorConsistencyScore },
    { label: "提示词对齐", value: score.promptAlignmentScore },
    { label: "文案对齐", value: score.copyAlignmentScore },
    { label: "构图", value: score.compositionScore },
    { label: "文字可读性", value: score.typographyScore },
  ];

  const radarItems = items.slice(1);

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">图片质量评分</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBg(score.overallScore)}`}>
            {score.overallScore}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={handleRescore} disabled={loading}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          重新评分
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 w-full text-left text-xs text-muted-foreground hover:text-foreground"
      >
        {expanded ? "收起详情 ▲" : "查看详情 ▼"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <ScoreRadar items={radarItems} />
          {items.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>{item.label}</span>
                <span className={`font-medium ${scoreColor(item.value)}`}>{item.value}</span>
              </div>
              <Progress value={item.value} className="h-1.5" />
            </div>
          ))}
          {score.analysis && (
            <div className="rounded-xl border border-border bg-background p-2">
              <p className="text-xs leading-5 text-muted-foreground">{score.analysis}</p>
            </div>
          )}
          {score.scoredByModel && (
            <p className="text-[10px] text-muted-foreground">评分模型：{score.scoredByModel}</p>
          )}
        </div>
      )}
    </div>
  );
}
