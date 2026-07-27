"use client";

import { useMemo, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  contentLanguageLabels,
  contentLanguageOptions,
  normalizeContentLanguage,
  type ContentLanguage,
} from "@/lib/utils/content-language";

const OPTIONAL_SECTION_OPTIONS = [
  { id: "ingredients_table", label: "成分表+配料表展示图（1:1）" },
  { id: "white_bg_product", label: "白底商品图·主图+包装组合（1:1）" },
  { id: "specs", label: "规格图（1:1）" },
] as const;

type OptionalSectionId = (typeof OPTIONAL_SECTION_OPTIONS)[number]["id"];

type PreviewConfig = {
  heroImageCount: number;
  detailSectionCount: number;
  imageAspectRatio: "3:4" | "9:16";
  contentLanguage: ContentLanguage;
  optionalSections: OptionalSectionId[];
};

type ProjectConfigCardProject = {
  id: string;
  modelSnapshot: unknown;
} | null;

function normalizePreviewConfig(snapshot: unknown): PreviewConfig {
  const data = (snapshot as Record<string, unknown> | null) ?? {};
  const previewConfig = (data.previewConfig as Record<string, unknown> | null) ?? {};

  const rawOptional = Array.isArray(previewConfig.optionalSections) ? previewConfig.optionalSections : [];
  const optionalSections = rawOptional.filter((item): item is OptionalSectionId =>
    OPTIONAL_SECTION_OPTIONS.some((option) => option.id === item),
  );

  return {
    heroImageCount: Math.min(5, Math.max(3, Number(previewConfig.heroImageCount ?? 5))),
    detailSectionCount: Math.min(10, Math.max(4, Number(previewConfig.detailSectionCount ?? 8))),
    imageAspectRatio: previewConfig.imageAspectRatio === "3:4" ? "3:4" : "9:16",
    contentLanguage: normalizeContentLanguage(previewConfig.contentLanguage),
    optionalSections,
  };
}

function OutputConfigSummary({ config }: { config: PreviewConfig }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="default">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-slate-500" />
          内容语言：{contentLanguageLabels[config.contentLanguage]}
        </Badge>
        <Badge variant="success">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          头图：{config.heroImageCount} 张
        </Badge>
        <Badge variant="warning">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
          详情页：{config.detailSectionCount} 张
        </Badge>
        <Badge variant="outline">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-sky-500" />
          详情图比例：{config.imageAspectRatio}
        </Badge>
        {config.optionalSections.length > 0 ? (
          <Badge variant="default">
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-violet-500" />
            可选模块：{config.optionalSections.map((id) => OPTIONAL_SECTION_OPTIONS.find((o) => o.id === id)?.label ?? id).join("、")}
          </Badge>
        ) : null}
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-sky-500" />
        这份配置会同时影响页面规划文案、图像中的文字语言，以及后续导出结果。
      </p>
    </div>
  );
}

export function ProjectOutputConfigCard({
  project,
  editable = false,
}: {
  project: ProjectConfigCardProject;
  editable?: boolean;
}) {
  const router = useRouter();
  const initialConfig = useMemo(() => normalizePreviewConfig(project?.modelSnapshot), [project?.modelSnapshot]);
  const [formState, setFormState] = useState<PreviewConfig>(initialConfig);
  const [saving, setSaving] = useState(false);

  if (!project) {
    return null;
  }

  const hasChanges =
    formState.heroImageCount !== initialConfig.heroImageCount ||
    formState.detailSectionCount !== initialConfig.detailSectionCount ||
    formState.imageAspectRatio !== initialConfig.imageAspectRatio ||
    formState.contentLanguage !== initialConfig.contentLanguage ||
    formState.optionalSections.join(",") !== initialConfig.optionalSections.join(",");

  const saveConfig = async () => {
    try {
      setSaving(true);
      const snapshot = ((project.modelSnapshot as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelSnapshot: {
            ...snapshot,
            previewConfig: {
              ...((snapshot.previewConfig as Record<string, unknown> | null) ?? {}),
              heroImageCount: formState.heroImageCount,
              detailSectionCount: formState.detailSectionCount,
              imageAspectRatio: formState.imageAspectRatio,
              contentLanguage: formState.contentLanguage,
              optionalSections: formState.optionalSections,
            },
          },
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? "输出配置保存失败");
      }

      toast.success("输出配置已保存");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "输出配置保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return (
      <Card className="border-dashed bg-muted/30 dark:bg-white/[0.03]">
        <CardContent className="p-4">
          <OutputConfigSummary config={initialConfig} />
        </CardContent>
      </Card>
    );
  }

  return (
      <Card className="border-dashed bg-muted/30 dark:bg-white/[0.03]">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-sky-600" />
          输出配置
        </CardTitle>
        <CardDescription>这里调整的语言、头图数量、详情页数量和比例，会直接影响后续规划、生成与导出。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>内容语言</Label>
            <select
              className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
              value={formState.contentLanguage}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  contentLanguage: normalizeContentLanguage(event.target.value),
                }))
              }
            >
              {contentLanguageOptions.map((option) => (
                <option key={option} value={option}>
                  {contentLanguageLabels[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>头图数量</Label>
            <select
              className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
              value={String(formState.heroImageCount)}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  heroImageCount: Math.min(5, Math.max(3, Number(event.target.value))),
                }))
              }
            >
              {[3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {count} 张
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>详情页数量</Label>
            <select
              className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
              value={String(formState.detailSectionCount)}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  detailSectionCount: Math.min(10, Math.max(4, Number(event.target.value))),
                }))
              }
            >
              {[4, 5, 6, 7, 8, 9, 10].map((count) => (
                <option key={count} value={count}>
                  {count} 张
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>详情图比例</Label>
            <select
              className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
              value={formState.imageAspectRatio}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  imageAspectRatio: event.target.value === "3:4" ? "3:4" : "9:16",
                }))
              }
            >
              <option value="9:16">9:16</option>
              <option value="3:4">3:4</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>可选模块（1:1，勾选后自动追加到详情页末尾）</Label>
          <div className="flex flex-wrap gap-2">
            {OPTIONAL_SECTION_OPTIONS.map((option) => {
              const checked = formState.optionalSections.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
                    checked
                      ? "border-sky-500 bg-sky-50/60 text-sky-700 dark:border-sky-400 dark:bg-sky-950/20 dark:text-sky-300"
                      : "border-border bg-background hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={checked}
                    onChange={() =>
                      setFormState((current) => ({
                        ...current,
                        optionalSections: checked
                          ? current.optionalSections.filter((item) => item !== option.id)
                          : [...current.optionalSections, option.id],
                      }))
                    }
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">保存配置后需要重新执行一次「页面规划」，可选模块才会追加进去。</p>
        </div>

        <OutputConfigSummary config={formState} />

        <div className="flex justify-end">
          <Button onClick={saveConfig} disabled={saving || !hasChanges} className="rounded-xl">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            保存输出配置
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
