"use client";

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface StyleGuideColorPalette {
  background?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  text?: string;
}

export interface ProjectStyleGuideData {
  colorPalette?: StyleGuideColorPalette;
  typography?: {
    headingStyle?: string;
    bodyStyle?: string;
  };
  mood?: string;
}

interface ProjectStyleGuideProps {
  projectId: string;
  styleGuide?: ProjectStyleGuideData | null;
}

function ColorSwatch({ color, label }: { color?: string; label: string }) {
  if (!color) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="h-10 w-10 rounded-full border border-border shadow-sm"
        style={{ backgroundColor: color }}
        title={color}
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[10px] font-mono text-muted-foreground">{color}</span>
    </div>
  );
}

export function ProjectStyleGuide({ projectId, styleGuide: initialStyleGuide }: ProjectStyleGuideProps) {
  const [styleGuide, setStyleGuide] = useState<ProjectStyleGuideData | null>(initialStyleGuide ?? null);
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/style-guide`, { method: "POST" });
      const payload = await res.json();
      if (!payload.success) {
        toast.error(payload.error?.message ?? "提取失败");
        return;
      }
      setStyleGuide(payload.data.styleGuide);
      toast.success("已根据商品图重新提取调色板");
    } catch (error) {
      toast.error("调色板提取请求失败");
    } finally {
      setLoading(false);
    }
  };

  if (!styleGuide?.colorPalette) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">项目调色板</p>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            提取
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          尚未生成统一调色板。点击“提取”会根据商品主图自动生成品牌色，或在重新规划页面时自动生成。
        </p>
      </div>
    );
  }

  const { colorPalette, mood, typography } = styleGuide;

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">项目统一调色板</p>
        <div className="flex items-center gap-2">
          {mood ? <span className="text-xs text-muted-foreground">{mood}</span> : null}
          <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            重新提取
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <ColorSwatch color={colorPalette.background} label="背景" />
        <ColorSwatch color={colorPalette.primary} label="主色" />
        <ColorSwatch color={colorPalette.secondary} label="辅色" />
        <ColorSwatch color={colorPalette.accent} label="强调" />
        <ColorSwatch color={colorPalette.text} label="文字" />
      </div>
      {typography ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          字体：{typography.headingStyle ?? "默认"} / {typography.bodyStyle ?? "默认"}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        所有模块生图时会自动遵循这套调色板，保证整页色彩一致。
      </p>
    </div>
  );
}
