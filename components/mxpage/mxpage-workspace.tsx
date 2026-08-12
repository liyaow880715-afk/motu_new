"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileImage,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  Monitor,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { ImageLightbox } from "@/components/shared/image-lightbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { postIdempotentGeneration } from "@/lib/utils/generation-request";

type WorkspaceNode = {
  id: string;
  stableId: string;
  parentStableId: string | null;
  legacySectionId: string | null;
  nodeType: string;
  sortOrder: number;
  data: Record<string, any>;
  sourceType: string | null;
  sourceKey: string | null;
  nodeHash: string;
  status: string;
};

type DocumentView = {
  id: string;
  authority: "LEGACY" | "MXPAGE";
  legacySyncedAt: string | null;
  draft: {
    id: string;
    editSequence: number;
    contentHash: string;
    rootNodeStableId: string;
    pageData: Record<string, any>;
    nodes: WorkspaceNode[];
  };
  etag: string;
};

interface MxPageWorkspaceProps {
  initialProject: any;
  initialDocument: DocumentView;
}

const sectionLabels: Record<string, string> = {
  HERO: "头图主视觉",
  SELLING_POINTS: "核心卖点",
  SCENARIO: "使用场景",
  DETAIL_CLOSEUP: "细节特写",
  SPECS: "规格参数",
  MATERIAL: "材质工艺",
  COMPARISON: "对比说明",
  GIFT_SCENE: "送礼场景",
  BRAND_TRUST: "品牌信任",
  PACKAGING: "包装展示",
  INGREDIENTS_TABLE: "成分配料",
  WHITE_BG_PRODUCT: "白底商品",
  SUMMARY: "总结收口",
  CUSTOM: "自定义模块",
};

function readNodeContent(node: WorkspaceNode | null) {
  const data = node?.data ?? {};
  const content = data.content ?? {};
  const section = data.section ?? {};
  return {
    title: String(content.title ?? ""),
    goal: String(content.goal ?? ""),
    copy: String(content.copy ?? ""),
    visualPrompt: String(content.visualPrompt ?? ""),
    sectionType: String(section.sectionType ?? "CUSTOM"),
  };
}

function updateNodeContent(node: WorkspaceNode, field: string, value: string) {
  const data = structuredClone(node.data ?? {});
  data.content = { ...(data.content ?? {}) };
  data.section = { ...(data.section ?? {}) };
  if (field === "sectionType") data.section.sectionType = value;
  else data.content[field] = value;
  return data;
}

function generationLabel(section: any) {
  const source = section?.currentImageAsset?.metadata?.visualPromptSource;
  if (!section?.imageUrl) return "待生成";
  if (source === "agent") return "Prompt Agent";
  if (source === "fallback") return "安全回退";
  return section.currentImageAsset?.metadata?.mode === "svg_fallback" ? "SVG 预览" : "AI 图片";
}

function CanvasNodeVisual({
  imageUrl,
  title,
  goal,
  sectionType,
}: {
  imageUrl?: string | null;
  title: string;
  goal: string;
  sectionType: string;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed = Boolean(imageUrl && failedImageUrl === imageUrl);
  const aspectClass = sectionType === "HERO" ? "aspect-square" : "aspect-[3/4]";

  if (imageUrl && !imageFailed) {
    return (
      <img
        src={imageUrl}
        alt={title}
        className={cn("block h-auto w-full bg-slate-100 object-cover", aspectClass)}
        loading="lazy"
        decoding="async"
        onError={() => setFailedImageUrl(imageUrl)}
      />
    );
  }

  return (
    <div className={cn("flex w-full flex-col items-center justify-center gap-3 bg-[linear-gradient(145deg,#f8fafc,#eef1f5)] px-8 text-center dark:bg-[linear-gradient(145deg,#1c1e22,#121315)]", aspectClass)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm dark:border-white/10 dark:bg-white/5"><FileImage className="h-5 w-5" /></div>
      <div>
        <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{title || "待生成模块"}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{imageFailed ? "历史图片无法加载，请在右侧重新生成。" : goal || "完成节点规划后生成页面图片"}</p>
      </div>
    </div>
  );
}

export function MxPageWorkspace({ initialProject, initialDocument }: MxPageWorkspaceProps) {
  const firstSectionNode = initialDocument.draft.nodes.find(
    (node) => node.nodeType === "commerce.section" && node.status === "active",
  );
  const [project, setProject] = useState(initialProject);
  const [documentView, setDocumentView] = useState(initialDocument);
  const [selectedStableId, setSelectedStableId] = useState<string | null>(firstSectionNode?.stableId ?? null);
  const [draftData, setDraftData] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const activeNodes = useMemo(
    () => documentView.draft.nodes
      .filter((node) => node.status === "active" && node.nodeType === "commerce.section")
      .sort((left, right) => left.sortOrder - right.sortOrder),
    [documentView.draft.nodes],
  );
  const selectedNode = useMemo(
    () => activeNodes.find((node) => node.stableId === selectedStableId) ?? activeNodes[0] ?? null,
    [activeNodes, selectedStableId],
  );
  const selectedSection = useMemo(
    () => project.sections.find((section: any) => section.id === selectedNode?.legacySectionId) ?? null,
    [project.sections, selectedNode?.legacySectionId],
  );

  useEffect(() => {
    setDraftData(selectedNode ? structuredClone(selectedNode.data) : null);
  }, [selectedNode]);

  const refreshWorkspace = useCallback(async () => {
    const [projectResponse, documentResponse] = await Promise.all([
      fetch(`/api/projects/${project.id}`),
      fetch(`/api/projects/${project.id}/document`),
    ]);
    const [projectPayload, documentPayload] = await Promise.all([
      projectResponse.json(),
      documentResponse.json(),
    ]);
    if (projectPayload.success) setProject(projectPayload.data);
    if (documentPayload.success) setDocumentView(documentPayload.data);
  }, [project.id]);

  const changeDraftField = (field: string, value: string) => {
    if (!selectedNode) return;
    setDraftData(updateNodeContent({ ...selectedNode, data: draftData ?? selectedNode.data }, field, value));
  };

  const saveNode = useCallback(async () => {
    if (!selectedNode || !draftData) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/document`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedEditSequence: documentView.draft.editSequence,
          operations: [{ op: "update", stableId: selectedNode.stableId, data: draftData }],
        }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message ?? "节点保存失败");
      setDocumentView(payload.data);
      await refreshWorkspace();
      toast.success("MxPage 节点已保存，兼容生图模块已同步");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "节点保存失败");
    } finally {
      setSaving(false);
    }
  }, [documentView.draft.editSequence, draftData, project.id, refreshWorkspace, selectedNode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveNode]);

  const syncLegacy = async () => {
    setSyncing(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/document`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "sync_legacy",
          expectedEditSequence: documentView.draft.editSequence,
          force: documentView.authority === "MXPAGE",
        }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message ?? "旧规划同步失败");
      setDocumentView(payload.data);
      await refreshWorkspace();
      toast.success("旧规划已显式同步到 MxPage 草稿");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "旧规划同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const runGeneration = async (mode: "generate" | "regenerate" | "repaint" | "enhance") => {
    if (!selectedSection) {
      toast.error("当前节点没有兼容的旧 Section，暂时无法调用生图链路");
      return;
    }
    setRunningAction(mode);
    try {
      const isEdit = mode === "repaint" || mode === "enhance";
      const endpoint = isEdit
        ? `/api/projects/${project.id}/sections/${selectedSection.id}/edit`
        : `/api/projects/${project.id}/sections/${selectedSection.id}/${mode}`;
      const payload = await postIdempotentGeneration(
        endpoint,
        `${project.id}:${selectedSection.id}:mxpage:${mode}`,
        isEdit ? { editMode: mode } : {},
      );
      if (!payload.success) throw new Error(payload.error?.message ?? "图片生成失败");
      await refreshWorkspace();
      toast.success(mode === "generate" ? "当前节点图片已生成" : "当前节点已生成新版本");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片生成失败");
    } finally {
      setRunningAction(null);
    }
  };

  const content = readNodeContent(selectedNode ? { ...selectedNode, data: draftData ?? selectedNode.data } : null);
  const generatedCount = project.sections.filter((section: any) => Boolean(section.imageUrl)).length;

  return (
    <div className="-mx-2 overflow-hidden rounded-[28px] border border-slate-200 bg-[#f5f6f8] shadow-[0_26px_80px_-48px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#090a0c]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-white/10 dark:bg-[#111214]">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/projects/${project.id}/planner`} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-black">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-slate-950 dark:text-white">{project.name}</h1>
              <Badge variant={documentView.authority === "MXPAGE" ? "success" : "outline"}>
                {documentView.authority === "MXPAGE" ? "MxPage 主草稿" : "旧规划兼容"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">文档 v1 · 修订序号 {documentView.draft.editSequence} · {activeNodes.length} 个页面节点</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={syncLegacy} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            同步旧规划
          </Button>
          <Link href={`/projects/${project.id}/export`}><Button variant="outline" size="sm">导出中心</Button></Link>
          <Button size="sm" onClick={saveNode} disabled={saving || !selectedNode} className="gap-2">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存节点
          </Button>
        </div>
      </header>

      <div className="grid min-h-[760px] grid-cols-1 xl:grid-cols-[280px_minmax(460px,1fr)_360px]">
        <aside className="border-b border-slate-200 bg-white xl:border-b-0 xl:border-r dark:border-white/10 dark:bg-[#111214]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div><p className="text-sm font-semibold">页面结构</p><p className="text-[11px] text-slate-500">稳定节点 ID · Revision 草稿</p></div>
            <Badge variant="outline">{activeNodes.length}</Badge>
          </div>
          <div className="max-h-[700px] space-y-1 overflow-y-auto p-3">
            <div className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-500"><Monitor className="h-3.5 w-3.5" />页面根节点</div>
            {activeNodes.map((node, index) => {
              const nodeContent = readNodeContent(node);
              const section = project.sections.find((item: any) => item.id === node.legacySectionId);
              const selected = node.stableId === selectedNode?.stableId;
              return (
                <button key={node.stableId} type="button" onClick={() => setSelectedStableId(node.stableId)} className={cn("group w-full rounded-xl border px-3 py-3 text-left transition", selected ? "border-slate-950 bg-slate-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-black" : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:hover:border-white/10 dark:hover:bg-white/5")}>
                  <div className="flex items-start gap-3">
                    <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold", selected ? "bg-white/15 dark:bg-black/10" : "bg-slate-100 dark:bg-white/10")}>{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{nodeContent.title || "未命名模块"}</p>
                      <div className={cn("mt-1 flex items-center gap-1.5 text-[10px]", selected ? "text-white/65 dark:text-black/55" : "text-slate-400")}><span>{sectionLabels[nodeContent.sectionType] ?? nodeContent.sectionType}</span><span>·</span><span>{section?.imageUrl ? "已出图" : "待出图"}</span></div>
                    </div>
                    <ChevronRight className={cn("mt-1 h-3.5 w-3.5 shrink-0", selected ? "opacity-80" : "opacity-0 group-hover:opacity-50")} />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 bg-[#eceef1] p-4 sm:p-6 dark:bg-[#0c0d0f]">
          <div className="mx-auto flex max-w-[720px] items-center justify-between pb-4">
            <div><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">页面画布</p><p className="text-xs text-slate-500">真实商品图片按节点顺序连续渲染</p></div>
            <div className="flex items-center gap-2 text-xs text-slate-500"><Badge variant="outline">{generatedCount}/{activeNodes.length} 已生成</Badge><Badge variant="outline">{documentView.draft.pageData?.contentLanguage ?? "zh-CN"}</Badge></div>
          </div>
          <div className="mx-auto max-h-[690px] max-w-[720px] overflow-y-auto rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_70px_-44px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-[#151619]">
            {activeNodes.map((node) => {
              const nodeContent = readNodeContent(node);
              const section = project.sections.find((item: any) => item.id === node.legacySectionId);
              const selected = node.stableId === selectedNode?.stableId;
              return (
                <button type="button" key={node.stableId} onClick={() => setSelectedStableId(node.stableId)} className={cn("relative block w-full overflow-hidden border-b border-slate-100 text-left last:border-b-0 dark:border-white/5", selected && "ring-2 ring-inset ring-slate-950 dark:ring-white")}>
                  {section?.imageUrl ? <CanvasNodeVisual imageUrl={section.imageUrl} title={nodeContent.title} goal={nodeContent.goal} sectionType={nodeContent.sectionType} /> : (
                    <div className={cn("flex w-full flex-col items-center justify-center gap-3 bg-[linear-gradient(145deg,#f8fafc,#eef1f5)] px-8 text-center dark:bg-[linear-gradient(145deg,#1c1e22,#121315)]", nodeContent.sectionType === "HERO" ? "aspect-square" : "aspect-[3/4]")}>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm dark:border-white/10 dark:bg-white/5"><FileImage className="h-5 w-5" /></div>
                      <div><p className="text-base font-semibold text-slate-800 dark:text-slate-100">{nodeContent.title || "待生成模块"}</p><p className="mt-1 text-xs leading-5 text-slate-500">{nodeContent.goal || "完成节点规划后生成页面图片"}</p></div>
                    </div>
                  )}
                  <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                    <span className="rounded-lg bg-black/72 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">{sectionLabels[nodeContent.sectionType] ?? nodeContent.sectionType}</span>
                    {selected ? <span className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-medium text-slate-900 shadow"><Check className="h-3 w-3" />当前节点</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </main>

        <aside className="border-t border-slate-200 bg-white xl:border-l xl:border-t-0 dark:border-white/10 dark:bg-[#111214]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div><p className="text-sm font-semibold">节点属性</p><p className="text-[11px] text-slate-500">内容、Prompt 与生成版本</p></div>
            {selectedSection ? <Badge variant={selectedSection.imageUrl ? "success" : "outline"}>{generationLabel(selectedSection)}</Badge> : null}
          </div>
          {!selectedNode || !draftData ? <div className="p-6 text-sm text-slate-500">请选择一个页面节点开始编辑。</div> : (
            <div className="max-h-[700px] space-y-5 overflow-y-auto p-4">
              <div className="space-y-2"><Label>节点类型</Label><select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-white/5" value={content.sectionType} onChange={(event) => changeDraftField("sectionType", event.target.value)}>{Object.entries(sectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div className="space-y-2"><Label>模块标题</Label><Input value={content.title} onChange={(event) => changeDraftField("title", event.target.value)} /></div>
              <div className="space-y-2"><Label>沟通目标</Label><Input value={content.goal} onChange={(event) => changeDraftField("goal", event.target.value)} /></div>
              <div className="space-y-2"><Label>画面文案</Label><Textarea className="min-h-28" value={content.copy} onChange={(event) => changeDraftField("copy", event.target.value)} /></div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2"><Label>中文 Primary Prompt</Label><Badge variant="outline" className="gap-1"><WandSparkles className="h-3 w-3" />生成前二次规划</Badge></div>
                <Textarea className="min-h-44 font-mono text-xs leading-5" value={content.visualPrompt} onChange={(event) => changeDraftField("visualPrompt", event.target.value)} />
                <p className="text-[11px] leading-5 text-slate-500">保存后写入 MxPage 草稿，并投影到兼容 Section；图片执行前会再经过 Visual Prompt Agent。</p>
              </div>
              <Button onClick={saveNode} disabled={saving} className="w-full gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存当前节点</Button>
              <div className="space-y-3 border-t border-slate-100 pt-5 dark:border-white/10">
                <div><p className="text-sm font-semibold">AI 图片操作</p><p className="mt-1 text-[11px] leading-5 text-slate-500">复用现有审批、参考图、包装保护、质量评分和版本管理。</p></div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" disabled={Boolean(runningAction)} onClick={() => runGeneration(selectedSection?.imageUrl ? "regenerate" : "generate")} className="gap-1.5">{runningAction === "generate" || runningAction === "regenerate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}{selectedSection?.imageUrl ? "重新生成" : "生成图片"}</Button>
                  <Button variant="outline" size="sm" disabled={!selectedSection?.imageUrl || Boolean(runningAction)} onClick={() => runGeneration("enhance")} className="gap-1.5">{runningAction === "enhance" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}画质增强</Button>
                  <Button variant="outline" size="sm" disabled={!selectedSection?.imageUrl || Boolean(runningAction)} onClick={() => runGeneration("repaint")} className="gap-1.5">{runningAction === "repaint" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}基于当前图重绘</Button>
                  <Button variant="outline" size="sm" disabled={!selectedSection?.imageUrl} onClick={() => setLightboxSrc(selectedSection?.imageUrl ?? null)} className="gap-1.5"><Monitor className="h-3.5 w-3.5" />查看大图</Button>
                </div>
              </div>
              <div className="space-y-3 border-t border-slate-100 pt-5 dark:border-white/10">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold">图片版本</p><Badge variant="outline">{selectedSection?.versions?.length ?? 0}</Badge></div>
                {(selectedSection?.versions ?? []).slice(0, 5).map((version: any) => <div key={version.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-white/10"><div><p className="font-medium">v{version.versionNumber}</p><p className="mt-0.5 text-[10px] text-slate-500">{version.isActive ? "当前生效版本" : "历史版本"}</p></div>{version.isActive ? <Badge variant="success">当前</Badge> : <Badge variant="outline">历史</Badge>}</div>)}
              </div>
            </div>
          )}
        </aside>
      </div>
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
