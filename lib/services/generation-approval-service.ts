import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { ApiRouteError } from "@/lib/utils/route";

export const GENERATION_APPROVAL_VERSION = 1;
export const GENERATION_APPROVAL_OPTIMIZER_VERSION = "motu-detail-workflow-v1";

type ApprovalSection = {
  id: string;
  sectionKey?: string | null;
  type: string;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  order: number;
  status?: string | null;
  currentImageAssetId?: string | null;
  currentImageAsset?: { id: string; createdAt: Date | string; metadata?: unknown } | null;
  editableData?: unknown;
};

type ApprovalProject = {
  platform: string;
  style: string;
  selectedPaletteId?: string | null;
  modelSnapshot?: unknown;
  generationApproval?: unknown;
};

export type GenerationApprovalRecord = {
  version: 1;
  blueprintFingerprint: string;
  blueprintApprovedAt: string;
  sectionPromptReviews: Array<{
    sectionId: string;
    promptSignature: string;
    status: "approved";
    reviewedAt: string;
    optimizerVersion: string;
  }>;
  sampleSectionIds: string[];
  approvedSamples: Record<string, { assetId: string; approvedAt: string }>;
};

export type GenerationApprovalStage =
  | "blueprint_required"
  | "sample_generation"
  | "sample_review"
  | "remaining_generation"
  | "completed";

export type GenerationApprovalView = {
  version: 1;
  stage: GenerationApprovalStage;
  stale: boolean;
  reason: string;
  currentFingerprint: string;
  blueprintApprovedAt: string | null;
  sampleSectionIds: string[];
  approvedSampleSectionIds: string[];
  activeSampleSectionId: string | null;
  pendingSectionIds: string[];
  canApproveBlueprint: boolean;
  canGenerateCurrentSample: boolean;
  canGenerateRemaining: boolean;
};

function normalizeStableValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeStableValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeStableValue(entry)]),
    );
  }
  return String(value);
}

function hashStableValue(value: unknown) {
  return createHash("sha256").update(JSON.stringify(normalizeStableValue(value))).digest("hex");
}

function readSnapshot(project: ApprovalProject) {
  return (project.modelSnapshot as Record<string, unknown> | null) ?? {};
}

function readApprovalRecord(value: unknown): GenerationApprovalRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GenerationApprovalRecord>;
  if (
    candidate.version !== GENERATION_APPROVAL_VERSION ||
    typeof candidate.blueprintFingerprint !== "string" ||
    typeof candidate.blueprintApprovedAt !== "string" ||
    !Array.isArray(candidate.sampleSectionIds) ||
    !candidate.approvedSamples ||
    typeof candidate.approvedSamples !== "object"
  ) {
    return null;
  }
  return candidate as GenerationApprovalRecord;
}

function fingerprintStyleGuide(snapshot: Record<string, unknown>) {
  const styleGuide = (snapshot.styleGuide as Record<string, unknown> | null) ?? {};
  const {
    anchorKind: _anchorKind,
    anchorImageAssetId: _anchorImageAssetId,
    anchorSectionId: _anchorSectionId,
    ...stableStyleGuide
  } = styleGuide;
  return stableStyleGuide;
}

export function computeBlueprintFingerprint(project: ApprovalProject, sections: ApprovalSection[]) {
  const snapshot = readSnapshot(project);
  return hashStableValue({
    project: {
      platform: project.platform,
      style: project.style,
      selectedPaletteId: project.selectedPaletteId ?? snapshot.selectedPaletteId ?? null,
      previewConfig: snapshot.previewConfig ?? null,
      generationSettings: snapshot.generationSettings ?? null,
      paletteStyle: snapshot.paletteStyle ?? null,
      styleGuide: fingerprintStyleGuide(snapshot),
    },
    sections: [...sections]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((section) => ({
        id: section.id,
        sectionKey: section.sectionKey ?? null,
        type: section.type,
        title: section.title,
        goal: section.goal,
        copy: section.copy,
        visualPrompt: section.visualPrompt,
        order: section.order,
        editableData: section.editableData ?? null,
      })),
  });
}

export function computeSectionPromptSignature(section: ApprovalSection) {
  return hashStableValue({
    id: section.id,
    title: section.title,
    goal: section.goal,
    copy: section.copy,
    visualPrompt: section.visualPrompt,
    editableData: section.editableData ?? null,
  });
}

export function selectSampleSectionIds(sections: ApprovalSection[]) {
  const ordered = [...sections].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const firstHero = ordered.find((section) => section.type === "HERO");
  const firstCoreDetail = ordered.find(
    (section) => section.type !== "HERO" && !String(section.sectionKey ?? "").startsWith("detail_optional_"),
  );
  const fallbackDetail = ordered.find((section) => section.type !== "HERO");
  return [...new Set([firstHero?.id, firstCoreDetail?.id ?? fallbackDetail?.id, ordered[0]?.id].filter(Boolean))] as string[];
}

export function buildBlueprintApproval(
  project: ApprovalProject,
  sections: ApprovalSection[],
  approvedAt = new Date().toISOString(),
): GenerationApprovalRecord {
  return {
    version: GENERATION_APPROVAL_VERSION,
    blueprintFingerprint: computeBlueprintFingerprint(project, sections),
    blueprintApprovedAt: approvedAt,
    sectionPromptReviews: [...sections]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((section) => ({
        sectionId: section.id,
        promptSignature: computeSectionPromptSignature(section),
        status: "approved" as const,
        reviewedAt: approvedAt,
        optimizerVersion: GENERATION_APPROVAL_OPTIMIZER_VERSION,
      })),
    sampleSectionIds: selectSampleSectionIds(sections),
    approvedSamples: {},
  };
}

function currentAssetWasGeneratedAfterApproval(section: ApprovalSection | undefined, approvedAt: string) {
  if (!section?.currentImageAssetId || !section.currentImageAsset) return false;
  const generatedAt = new Date(section.currentImageAsset.createdAt).getTime();
  const approvalTime = new Date(approvedAt).getTime();
  return Number.isFinite(generatedAt) && Number.isFinite(approvalTime) && generatedAt >= approvalTime;
}

export function deriveGenerationApprovalView(
  project: ApprovalProject,
  sections: ApprovalSection[],
): GenerationApprovalView {
  const ordered = [...sections].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const currentFingerprint = computeBlueprintFingerprint(project, ordered);
  const record = readApprovalRecord(project.generationApproval);
  const stale = Boolean(record && record.blueprintFingerprint !== currentFingerprint);
  const defaultSamples = selectSampleSectionIds(ordered);

  if (!record || stale) {
    return {
      version: GENERATION_APPROVAL_VERSION,
      stage: "blueprint_required",
      stale,
      reason: stale ? "规划内容或生成设置已变化，请重新确认整套蓝图。" : "请先确认整套页面规划与逐屏提示词。",
      currentFingerprint,
      blueprintApprovedAt: null,
      sampleSectionIds: defaultSamples,
      approvedSampleSectionIds: [],
      activeSampleSectionId: null,
      pendingSectionIds: ordered.map((section) => section.id),
      canApproveBlueprint: ordered.length > 0,
      canGenerateCurrentSample: false,
      canGenerateRemaining: false,
    };
  }

  const sectionById = new Map(ordered.map((section) => [section.id, section]));
  const sampleSectionIds = record.sampleSectionIds.filter((id) => sectionById.has(id));
  const approvedSampleSectionIds = sampleSectionIds.filter((id) => {
    const section = sectionById.get(id);
    const approval = record.approvedSamples[id];
    return Boolean(
      approval &&
        section?.currentImageAssetId === approval.assetId &&
        currentAssetWasGeneratedAfterApproval(section, record.blueprintApprovedAt),
    );
  });
  const activeSampleSectionId = sampleSectionIds.find((id) => !approvedSampleSectionIds.includes(id)) ?? null;
  const activeSample = activeSampleSectionId ? sectionById.get(activeSampleSectionId) : undefined;
  const activeSampleHasCurrentOutput = currentAssetWasGeneratedAfterApproval(activeSample, record.blueprintApprovedAt);
  const pendingSectionIds = ordered
    .filter(
      (section) =>
        section.status !== "SUCCESS" || !currentAssetWasGeneratedAfterApproval(section, record.blueprintApprovedAt),
    )
    .map((section) => section.id);

  if (activeSampleSectionId) {
    return {
      version: GENERATION_APPROVAL_VERSION,
      stage: activeSampleHasCurrentOutput ? "sample_review" : "sample_generation",
      stale: false,
      reason: activeSampleHasCurrentOutput
        ? "视觉样本已生成，请人工审核通过或重新生成。"
        : "蓝图已确认，请按顺序生成下一张视觉样本。",
      currentFingerprint,
      blueprintApprovedAt: record.blueprintApprovedAt,
      sampleSectionIds,
      approvedSampleSectionIds,
      activeSampleSectionId,
      pendingSectionIds,
      canApproveBlueprint: false,
      canGenerateCurrentSample: true,
      canGenerateRemaining: false,
    };
  }

  return {
    version: GENERATION_APPROVAL_VERSION,
    stage: pendingSectionIds.length === 0 ? "completed" : "remaining_generation",
    stale: false,
    reason:
      pendingSectionIds.length === 0
        ? "当前蓝图下的全部图片已生成并通过审核。"
        : "视觉样本已确认，可以生成剩余页面图片。",
    currentFingerprint,
    blueprintApprovedAt: record.blueprintApprovedAt,
    sampleSectionIds,
    approvedSampleSectionIds,
    activeSampleSectionId: null,
    pendingSectionIds,
    canApproveBlueprint: false,
    canGenerateCurrentSample: false,
    canGenerateRemaining: pendingSectionIds.length > 0,
  };
}

async function loadApprovalContext(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { currentImageAsset: true },
      },
    },
  });
  if (!project) throw new ApiRouteError("NOT_FOUND", "Project not found.", 404);
  return project;
}

export async function getGenerationApprovalView(projectId: string) {
  const project = await loadApprovalContext(projectId);
  return deriveGenerationApprovalView(project, project.sections);
}

export async function approveProjectBlueprint(projectId: string) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      include: {
        sections: {
          orderBy: { order: "asc" },
          include: { currentImageAsset: true },
        },
      },
    });
    if (!project) throw new ApiRouteError("NOT_FOUND", "Project not found.", 404);
    if (project.sections.length === 0) {
      throw new ApiRouteError("PLAN_REQUIRED", "请先完成页面规划，再确认蓝图。", 409);
    }
    const generationApproval = buildBlueprintApproval(project, project.sections);
    await tx.project.update({
      where: { id: projectId },
      data: { generationApproval: generationApproval as unknown as Prisma.InputJsonValue },
    });
    return deriveGenerationApprovalView(
      { ...project, generationApproval },
      project.sections,
    );
  });
}

export function assertSectionGenerationAllowedForView(view: GenerationApprovalView, sectionId: string) {
  if (view.stage === "blueprint_required") {
    throw new ApiRouteError("BLUEPRINT_APPROVAL_REQUIRED", view.reason, 409, view);
  }
  if (
    (view.stage === "sample_generation" || view.stage === "sample_review") &&
    view.activeSampleSectionId !== sectionId
  ) {
    throw new ApiRouteError(
      "VISUAL_SAMPLE_APPROVAL_REQUIRED",
      "请先完成并人工确认当前视觉样本，再生成其他页面图片。",
      409,
      view,
    );
  }
  return view;
}

export async function assertSectionGenerationAllowed(projectId: string, sectionId: string) {
  const project = await loadApprovalContext(projectId);
  return assertSectionGenerationAllowedForView(
    deriveGenerationApprovalView(project, project.sections),
    sectionId,
  );
}

export async function recordApprovedSampleAsset(
  projectId: string,
  sectionId: string,
  assetId: string,
  approvedAt = new Date().toISOString(),
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      include: {
        sections: {
          orderBy: { order: "asc" },
          include: { currentImageAsset: true },
        },
      },
    });
    if (!project) throw new ApiRouteError("NOT_FOUND", "Project not found.", 404);
    const record = readApprovalRecord(project.generationApproval);
    if (!record || record.blueprintFingerprint !== computeBlueprintFingerprint(project, project.sections)) {
      return deriveGenerationApprovalView(project, project.sections);
    }
    if (!record.sampleSectionIds.includes(sectionId)) {
      return deriveGenerationApprovalView(project, project.sections);
    }
    const view = deriveGenerationApprovalView(project, project.sections);
    if (view.activeSampleSectionId !== sectionId) {
      throw new ApiRouteError(
        "SAMPLE_APPROVAL_ORDER_INVALID",
        "请按顺序确认视觉样本，先完成当前样本后再继续。",
        409,
        view,
      );
    }
    const section = project.sections.find((entry) => entry.id === sectionId);
    if (
      !section ||
      section.currentImageAssetId !== assetId ||
      !currentAssetWasGeneratedAfterApproval(section, record.blueprintApprovedAt)
    ) {
      throw new ApiRouteError(
        "STALE_SAMPLE_ASSET",
        "该样本不是蓝图确认后生成的当前图片，请重新生成后再审核。",
        409,
      );
    }
    const generationApproval: GenerationApprovalRecord = {
      ...record,
      approvedSamples: {
        ...record.approvedSamples,
        [sectionId]: { assetId, approvedAt },
      },
    };
    const metadata = (section.currentImageAsset?.metadata as Record<string, unknown> | null) ?? {};
    await Promise.all([
      tx.productAsset.update({
        where: { id: assetId },
        data: {
          metadata: {
            ...metadata,
            manualReview: { status: "approved", approvedAt },
          } as Prisma.InputJsonValue,
        },
      }),
      tx.pageSection.update({
        where: { id: sectionId },
        data: { status: "SUCCESS", currentImageAssetId: assetId },
      }),
      tx.project.update({
        where: { id: projectId },
        data: { generationApproval: generationApproval as unknown as Prisma.InputJsonValue },
      }),
    ]);
    return deriveGenerationApprovalView(
      { ...project, generationApproval },
      project.sections,
    );
  });
}
