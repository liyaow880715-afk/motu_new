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
    headingFont?: string;
    bodyFont?: string;
  };
  mood?: string;
  visualSystem?: {
    lighting?: string;
    shadowStyle?: string;
    textureStyle?: string;
    compositionGrid?: string;
    typographyScale?: string;
    badgeStyle?: string;
    iconStyle?: string;
    productAngle?: string;
    productSizeRatio?: string;
    productPosition?: string;
  };
  anchorImageUrl?: string;
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
        <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
          <p>字体风格：{typography.headingStyle ?? "默认"} / {typography.bodyStyle ?? "默认"}</p>
          {typography.headingFont ? <p>标题字体：{typography.headingFont}</p> : null}
          {typography.bodyFont ? <p>正文字体：{typography.bodyFont}</p> : null}
        </div>
      ) : null}

      {styleGuide.anchorImageUrl ? (
        <div className="mt-3">
          <p className="text-xs font-medium">风格锚点图</p>
          <img
            src={styleGuide.anchorImageUrl}
            alt="风格锚点"
            className="mt-1.5 max-h-48 w-full rounded-xl border border-border object-cover"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">所有模块会以这张图作为首要风格参考。</p>
        </div>
      ) : null}

      {styleGuide.visualSystem ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-background p-2">
          <p className="text-xs font-medium">视觉系统</p>
          <div className="grid gap-1.5 text-[10px] text-muted-foreground">
            {styleGuide.visualSystem.lighting ? <p>• 光照：{styleGuide.visualSystem.lighting}</p> : null}
            {styleGuide.visualSystem.shadowStyle ? <p>• 阴影：{styleGuide.visualSystem.shadowStyle}</p> : null}
            {styleGuide.visualSystem.textureStyle ? <p>• 纹理：{styleGuide.visualSystem.textureStyle}</p> : null}
            {styleGuide.visualSystem.compositionGrid ? <p>• 构图：{styleGuide.visualSystem.compositionGrid}</p> : null}
            {styleGuide.visualSystem.typographyScale ? <p>• 字号：{styleGuide.visualSystem.typographyScale}</p> : null}
            {styleGuide.visualSystem.badgeStyle ? <p>• 标签：{styleGuide.visualSystem.badgeStyle}</p> : null}
            {styleGuide.visualSystem.iconStyle ? <p>• 图标：{styleGuide.visualSystem.iconStyle}</p> : null}
            {styleGuide.visualSystem.productAngle ? <p>• 产品角度：{styleGuide.visualSystem.productAngle}</p> : null}
            {styleGuide.visualSystem.productSizeRatio ? <p>• 产品大小：{styleGuide.visualSystem.productSizeRatio}</p> : null}
            {styleGuide.visualSystem.productPosition ? <p>• 产品位置：{styleGuide.visualSystem.productPosition}</p> : null}
          </div>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">
        所有模块生图时会自动遵循这套调色板和视觉系统，保证整页浑然一体。
      </p>
    </div>
  );
}
