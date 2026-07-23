import fs from "fs/promises";
import path from "path";

import { prisma } from "@/lib/db/prisma";
import {
  orderAssetsByIds,
  referenceInputSignature,
  resolveSectionReferenceAssets,
  selectModelReferenceInputs,
  type ModelReferenceInputCandidate,
  type ModelReferenceRole,
  type ReferenceAssetRecord,
} from "@/lib/services/reference-resolution";
import { assetPublicUrl, deleteAssetRecord } from "@/lib/storage/asset-manager";
import { env } from "@/lib/utils/env";

function readPreviewConfig(snapshot: unknown) {
  const data = (snapshot as Record<string, unknown> | null) ?? {};
  const previewConfig = (data.previewConfig as Record<string, unknown> | null) ?? {};

  return {
    heroImageCount: Math.min(5, Math.max(3, Number(previewConfig.heroImageCount ?? 4))),
    detailSectionCount: Math.min(10, Math.max(4, Number(previewConfig.detailSectionCount ?? 6))),
  };
}

function readModuleTemplate(snapshot: unknown, sectionType: string) {
  const data = (snapshot as Record<string, unknown> | null) ?? {};
  const templates = data.moduleTemplates as Record<string, unknown> | undefined;
  const entry = templates?.[sectionType];
  if (!entry || typeof entry !== "object") return null;
  const template = entry as Record<string, unknown>;
  return {
    imageAssetId: typeof template.imageAssetId === "string" ? template.imageAssetId : null,
    imageUrl: typeof template.imageUrl === "string" ? template.imageUrl : null,
  };
}

function assetReferenceInput(
  asset: ReferenceAssetRecord,
  role: ModelReferenceRole,
): ModelReferenceInputCandidate {
  return {
    key: `asset:${asset.id}`,
    role,
    assetId: asset.id,
    fileName: asset.fileName,
    type: asset.type,
    url: assetPublicUrl(asset),
  };
}

function readStoredReferenceInputs(metadata: unknown): ModelReferenceInputCandidate[] {
  const data = (metadata as Record<string, unknown> | null) ?? {};
  if (!Array.isArray(data.providerReferenceInputs)) return [];

  return data.providerReferenceInputs.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const input = value as Record<string, unknown>;
    const role = input.role;
    if (role !== "product" && role !== "style_anchor" && role !== "template" && role !== "neighbor") {
      return [];
    }
    return [{
      key: typeof input.key === "string" ? input.key : `stored:${index}`,
      role,
      assetId: typeof input.assetId === "string" ? input.assetId : null,
      fileName: typeof input.fileName === "string" ? input.fileName : `reference-${index + 1}`,
      type: typeof input.type === "string" ? input.type : null,
      url: typeof input.url === "string" ? input.url : null,
    }];
  });
}

async function deleteAssetIfUnreferenced(assetId: string | null | undefined) {
  if (!assetId) {
    return;
  }

  const versionRefCount = await prisma.sectionVersion.count({
    where: { imageAssetId: assetId },
  });
  const currentRefCount = await prisma.pageSection.count({
    where: { currentImageAssetId: assetId },
  });

  if (versionRefCount === 0 && currentRefCount === 0) {
    await deleteAssetRecord(assetId);
  }
}

async function normalizeSectionOrder(projectId: string) {
  const sections = await prisma.pageSection.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    select: { id: true },
  });

  await prisma.$transaction(
    sections.map((section, index) =>
      prisma.pageSection.update({
        where: { id: section.id },
        data: { order: index },
      }),
    ),
  );
}

async function pruneProjectToPreviewConfig(projectId: string, snapshot: unknown) {
  const previewConfig = readPreviewConfig(snapshot);
  const sections = await prisma.pageSection.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          imageAsset: true,
        },
      },
      generatedAssets: true,
    },
  });

  const removableSections = [
    ...sections.filter((section) => section.type === "HERO").slice(previewConfig.heroImageCount),
    ...sections.filter((section) => section.type !== "HERO").slice(previewConfig.detailSectionCount),
  ];

  for (const section of removableSections) {
    const assetIds = [
      ...new Set(
        [
          section.currentImageAssetId,
          ...section.versions.map((version) => version.imageAssetId),
          ...section.generatedAssets.map((asset) => asset.id),
        ].filter(Boolean),
      ),
    ] as string[];

    await prisma.pageSection.delete({
      where: { id: section.id },
    });

    for (const assetId of assetIds) {
      await deleteAssetIfUnreferenced(assetId);
    }
  }

  if (removableSections.length > 0) {
    await normalizeSectionOrder(projectId);
  }
}

export async function listProjects(_accessKeyId?: string | null) {
  // 所有激活码可见全部项目历史
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      assets: {
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
      sections: true,
    },
  });

  return projects.map((project) => ({
    ...project,
    coverImageUrl: assetPublicUrl(project.assets[0]),
    sectionCount: project.sections.length,
  }));
}

export async function createProject(
  input: {
    name: string;
    platform: string;
    style: string;
    mode?: "single" | "multi";
    description?: string | null;
    productInfo?: string | null;
    category?: string | null;
    sellingPoints?: string | null;
    targetAudience?: string | null;
  },
  accessKeyId?: string | null,
) {
  const { productInfo, category, sellingPoints, targetAudience, mode, ...projectData } = input;
  return prisma.project.create({
    data: {
      ...projectData,
      accessKeyId: accessKeyId || null,
      modelSnapshot: {
        mode: mode ?? "single",
        productInfo,
        category,
        sellingPoints,
        targetAudience,
      },
    },
  });
}

export async function getProjectDetail(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assets: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      analysis: true,
      variants: {
        include: { assets: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
        orderBy: { sortOrder: "asc" },
      },
      sections: {
        orderBy: { order: "asc" },
        include: {
          currentImageAsset: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            include: {
              imageAsset: true,
            },
          },
        },
      },
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!project) {
    return null;
  }

  const projectAssets = project.assets as ReferenceAssetRecord[];
  const assetById = new Map(projectAssets.map((asset) => [asset.id, asset]));
  const snapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
  const styleGuide = (snapshot.styleGuide as Record<string, unknown> | null) ?? {};
  const styleAnchorAssetId =
    typeof styleGuide.anchorImageAssetId === "string" ? styleGuide.anchorImageAssetId : null;
  const styleAnchorUrl = typeof styleGuide.anchorImageUrl === "string" ? styleGuide.anchorImageUrl : null;

  return {
    ...project,
    assets: project.assets.map((asset) => ({
      ...asset,
      url: assetPublicUrl(asset),
    })),
    variants: project.variants.map((variant) => ({
      ...variant,
      assets: variant.assets.map((asset) => ({
        ...asset,
        url: assetPublicUrl(asset),
      })),
    })),
    sections: project.sections.map((section, sectionIndex) => {
      const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
      const referenceAssetIds = Array.isArray(editableData.referenceAssetIds)
        ? editableData.referenceAssetIds.filter((id): id is string => typeof id === "string")
        : [];
      const resolution = resolveSectionReferenceAssets({
        section,
        projectAssets,
        explicitReferenceAssets: orderAssetsByIds(projectAssets, referenceAssetIds),
      });
      const productInputs = resolution.modelProductAssets.map((asset) => assetReferenceInput(asset, "product"));

      const styleAnchorAsset = styleAnchorAssetId ? assetById.get(styleAnchorAssetId) : null;
      const styleAnchorInput: ModelReferenceInputCandidate = styleAnchorAsset
        ? assetReferenceInput(styleAnchorAsset, "style_anchor")
        : {
            key: styleAnchorUrl ? `style:${styleAnchorUrl}` : "style:pending",
            role: "style_anchor",
            assetId: null,
            fileName: "style-anchor",
            type: "REFERENCE",
            url: styleAnchorUrl?.startsWith("data:") ? null : styleAnchorUrl,
            pending: !styleAnchorUrl,
          };

      const moduleTemplate = readModuleTemplate(snapshot, section.type);
      const editableTemplateUrl =
        typeof editableData.templateReferenceImageUrl === "string"
          ? editableData.templateReferenceImageUrl
          : null;
      const templateAsset = moduleTemplate?.imageAssetId
        ? assetById.get(moduleTemplate.imageAssetId)
        : null;
      const templateUrl = moduleTemplate?.imageUrl ?? editableTemplateUrl;
      const templateInput: ModelReferenceInputCandidate | null = templateAsset
        ? assetReferenceInput(templateAsset, "template")
        : templateUrl
          ? {
              key: `template:${templateUrl}`,
              role: "template",
              assetId: null,
              fileName: "layout-template",
              type: "REFERENCE",
              url: templateUrl.startsWith("data:") ? null : templateUrl,
            }
          : null;

      const neighborInputs = [project.sections[sectionIndex - 1], project.sections[sectionIndex + 1]].flatMap(
        (neighbor) => neighbor?.currentImageAsset
          ? [assetReferenceInput(neighbor.currentImageAsset as ReferenceAssetRecord, "neighbor")]
          : [],
      );
      const inputReferenceAssets = selectModelReferenceInputs({
        productInputs,
        styleAnchorInput: resolution.variantScope === "group" ? null : styleAnchorInput,
        templateInput: resolution.variantScope === "group" ? null : templateInput,
        neighborInputs: resolution.variantScope === "group" ? [] : neighborInputs,
      });

      const actualInputReferenceAssets = readStoredReferenceInputs(section.currentImageAsset?.metadata).map((input) => {
        const asset = input.assetId ? assetById.get(input.assetId) : null;
        return asset ? { ...input, url: assetPublicUrl(asset) } : input;
      });

      return {
        ...section,
        imageUrl: assetPublicUrl(section.currentImageAsset),
        inputReferenceAssets,
        actualInputReferenceAssets,
        referenceInputsConfirmed:
          actualInputReferenceAssets.length > 0 &&
          referenceInputSignature(inputReferenceAssets) === referenceInputSignature(actualInputReferenceAssets),
        versions: section.versions.map((version) => ({
          ...version,
          imageUrl: assetPublicUrl(version.imageAsset),
        })),
      };
    }),
  };
}

export async function updateProject(projectId: string, input: Record<string, unknown>) {
  await prisma.project.update({
    where: { id: projectId },
    data: input,
  });

  if ("modelSnapshot" in input) {
    await pruneProjectToPreviewConfig(projectId, input.modelSnapshot);
  }

  return getProjectDetail(projectId);
}

export async function deleteProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return null;
  }

  await prisma.project.delete({
    where: { id: projectId },
  });

  const storageRoot = path.resolve(process.cwd(), env.STORAGE_ROOT);
  await Promise.all([
    fs.rm(path.join(storageRoot, "uploads", projectId), { recursive: true, force: true }),
    fs.rm(path.join(storageRoot, "generated", projectId), { recursive: true, force: true }),
    fs.rm(path.join(storageRoot, "exports", projectId), { recursive: true, force: true }),
  ]);

  return project;
}
