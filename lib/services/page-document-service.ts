import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  buildLegacyNodeMutations,
  computeRevisionContentHash,
  hashDocumentValue,
  rootNodeStableId,
  validateDraftNodeTree,
  type DraftNodeSnapshot,
  type LegacySectionSnapshot,
} from "@/lib/services/page-document-model";
import { ApiRouteError } from "@/lib/utils/route";
import type { PageDocumentPatchInput } from "@/lib/validations/page-document";

const DOCUMENT_SCHEMA_VERSION = 1;

function asInputJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function readPageData(project: {
  name: string;
  platform: string;
  style: string;
  modelSnapshot: unknown;
  selectedPaletteId: string | null;
  paletteOptions: unknown;
}) {
  const snapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
  return {
    title: project.name,
    platform: project.platform,
    style: project.style,
    previewConfig: snapshot.previewConfig ?? null,
    contentLanguage:
      ((snapshot.previewConfig as Record<string, unknown> | null)?.contentLanguage as string | undefined) ?? "zh-CN",
    styleGuide: snapshot.styleGuide ?? null,
    generationSettings: snapshot.generationSettings ?? null,
    paletteStyle: snapshot.paletteStyle ?? null,
    selectedPaletteId: project.selectedPaletteId,
    paletteOptions: project.paletteOptions ?? null,
    modelAssignments: snapshot.modelAssignments ?? null,
  };
}

function sectionSnapshot(section: {
  id: string;
  sectionKey: string;
  type: string;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  order: number;
  status: string;
  currentImageAssetId: string | null;
  editableData: unknown;
}): LegacySectionSnapshot {
  return {
    ...section,
    type: String(section.type),
    status: String(section.status),
  };
}

function nodeSnapshot(node: {
  stableId: string;
  parentStableId: string | null;
  nodeType: string;
  sortOrder: number;
  data: unknown;
  sourceType: string | null;
  sourceKey: string | null;
  sourceRecordId: string | null;
  legacySectionId: string | null;
  nodeHash: string;
  status: string;
  archivedAt: Date | null;
}): DraftNodeSnapshot {
  return node;
}

function rootNode(projectId: string): DraftNodeSnapshot {
  const stableId = rootNodeStableId(projectId);
  const data = { role: "page-root", layout: { direction: "vertical" } };
  return {
    stableId,
    parentStableId: null,
    nodeType: "page.root",
    sortOrder: 0,
    data,
    sourceType: "system",
    sourceKey: "root",
    sourceRecordId: null,
    legacySectionId: null,
    nodeHash: hashDocumentValue({ nodeType: "page.root", data }),
    status: "active",
    archivedAt: null,
  };
}

function readLegacySectionProjection(data: Record<string, unknown>) {
  const content = (data.content as Record<string, unknown> | null) ?? {};
  const section = (data.section as Record<string, unknown> | null) ?? {};
  return {
    title: typeof content.title === "string" ? content.title : undefined,
    goal: typeof content.goal === "string" ? content.goal : undefined,
    copy: typeof content.copy === "string" ? content.copy : undefined,
    visualPrompt: typeof content.visualPrompt === "string" ? content.visualPrompt : undefined,
    type: typeof section.sectionType === "string" ? section.sectionType : undefined,
  };
}

async function projectNodesToLegacySections(
  tx: Prisma.TransactionClient,
  nodes: Array<{
    nodeType: string;
    status: string;
    legacySectionId: string | null;
    data: unknown;
  }>,
) {
  for (const node of nodes) {
    if (node.status !== "active" || node.nodeType !== "commerce.section" || !node.legacySectionId) continue;
    const projection = readLegacySectionProjection(node.data as Record<string, unknown>);
    await tx.pageSection.update({
      where: { id: node.legacySectionId },
      data: {
        ...(projection.title !== undefined ? { title: projection.title } : {}),
        ...(projection.goal !== undefined ? { goal: projection.goal } : {}),
        ...(projection.copy !== undefined ? { copy: projection.copy } : {}),
        ...(projection.visualPrompt !== undefined ? { visualPrompt: projection.visualPrompt } : {}),
        ...(projection.type !== undefined ? { type: projection.type as any } : {}),
      },
    });
  }
}

function serializeDocument(document: any) {
  const draft = document.revisions.find((revision: any) => revision.number === 0) ?? null;
  return {
    ...document,
    draft,
    etag: draft ? `${draft.id}:${draft.editSequence}:${draft.contentHash}` : null,
  };
}

async function loadProjectForDocument(projectId: string, tx: Prisma.TransactionClient = prisma) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      platform: true,
      style: true,
      modelSnapshot: true,
      selectedPaletteId: true,
      paletteOptions: true,
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          sectionKey: true,
          type: true,
          title: true,
          goal: true,
          copy: true,
          visualPrompt: true,
          order: true,
          status: true,
          currentImageAssetId: true,
          editableData: true,
        },
      },
    },
  });
  if (!project) throw new ApiRouteError("NOT_FOUND", "Project not found.", 404);
  return project;
}

async function loadDocument(projectId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.pageDocument.findUnique({
    where: { projectId },
    include: {
      revisions: {
        orderBy: { number: "desc" },
        include: { nodes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      },
    },
  });
}

export async function getPageDocument(projectId: string) {
  const document = await loadDocument(projectId);
  return document ? serializeDocument(document) : null;
}

export async function bootstrapPageDocument(projectId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await loadDocument(projectId, tx);
      if (existing) return serializeDocument(existing);

    const project = await loadProjectForDocument(projectId, tx);
    const pageData = readPageData(project);
    const root = rootNode(projectId);
    const sections = project.sections.map(sectionSnapshot);
    const mutations = buildLegacyNodeMutations({
      projectId,
      rootStableId: root.stableId,
      sections,
      existingNodes: [],
    });
    const nodes = [
      root,
      ...mutations.flatMap((mutation) => mutation.kind === "create" ? [mutation.node] : []),
    ];
    const legacySourceHash = hashDocumentValue(sections);
    const contentHash = computeRevisionContentHash(pageData, nodes);
    validateDraftNodeTree(root.stableId, nodes);

    await tx.pageDocument.create({
      data: {
        projectId,
        schemaVersion: DOCUMENT_SCHEMA_VERSION,
        authority: "LEGACY",
        legacySourceHash,
        legacySyncedAt: new Date(),
        revisions: {
          create: {
            number: 0,
            kind: "DRAFT",
            source: "LEGACY_IMPORT",
            schemaVersion: DOCUMENT_SCHEMA_VERSION,
            pageData: asInputJson(pageData),
            rootNodeStableId: root.stableId,
            contentHash,
            nodes: {
              create: nodes.map((node) => ({
                stableId: node.stableId,
                parentStableId: node.parentStableId,
                nodeType: node.nodeType,
                sortOrder: node.sortOrder,
                data: asInputJson(node.data),
                sourceType: node.sourceType,
                sourceKey: node.sourceKey,
                sourceRecordId: node.sourceRecordId,
                legacySectionId: node.legacySectionId,
                nodeHash: node.nodeHash,
                status: node.status,
                archivedAt: node.archivedAt,
              })),
            },
          },
        },
      },
    });

      return serializeDocument((await loadDocument(projectId, tx))!);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await loadDocument(projectId);
      if (existing) return serializeDocument(existing);
    }
    throw error;
  }
}

export async function syncLegacySectionsToDraft(
  projectId: string,
  expectedEditSequence: number,
  force = false,
) {
  return prisma.$transaction(async (tx) => {
    const document = await loadDocument(projectId, tx);
    if (!document) throw new ApiRouteError("DOCUMENT_NOT_FOUND", "Page document has not been initialized.", 404);
    if (document.authority === "MXPAGE" && !force) {
      throw new ApiRouteError("LEGACY_SYNC_CONFIRMATION_REQUIRED", "The MxPage draft owns this document. Explicit confirmation is required before importing legacy sections.", 409);
    }
    const draft = document.revisions.find((revision) => revision.number === 0);
    if (!draft) throw new ApiRouteError("DRAFT_NOT_FOUND", "Editable draft revision is missing.", 409);
    if (draft.editSequence !== expectedEditSequence) {
      throw new ApiRouteError("DRAFT_STALE", "The page draft changed before legacy synchronization.", 409, {
        expectedEditSequence,
        actualEditSequence: draft.editSequence,
      });
    }

    const project = await loadProjectForDocument(projectId, tx);
    const sections = project.sections.map(sectionSnapshot);
    const existingNodes = draft.nodes.map(nodeSnapshot);
    const mutations = buildLegacyNodeMutations({
      projectId,
      rootStableId: draft.rootNodeStableId,
      sections,
      existingNodes,
    });

    for (const mutation of mutations) {
      if (mutation.kind === "archive") {
        await tx.pageNode.update({
          where: { revisionId_stableId: { revisionId: draft.id, stableId: mutation.stableId } },
          data: { status: "archived", archivedAt: new Date(), legacySectionId: null },
        });
        continue;
      }

      const data = {
        parentStableId: mutation.node.parentStableId,
        nodeType: mutation.node.nodeType,
        sortOrder: mutation.node.sortOrder,
        data: asInputJson(mutation.node.data),
        sourceType: mutation.node.sourceType,
        sourceKey: mutation.node.sourceKey,
        sourceRecordId: mutation.node.sourceRecordId,
        legacySectionId: mutation.node.legacySectionId,
        nodeHash: mutation.node.nodeHash,
        status: "active",
        archivedAt: null,
      };
      if (mutation.kind === "create") {
        await tx.pageNode.create({ data: { revisionId: draft.id, stableId: mutation.node.stableId, ...data } });
      } else {
        await tx.pageNode.update({
          where: { revisionId_stableId: { revisionId: draft.id, stableId: mutation.stableId } },
          data,
        });
      }
    }

    const refreshedNodes = await tx.pageNode.findMany({ where: { revisionId: draft.id } });
    const pageData = readPageData(project);
    const contentHash = computeRevisionContentHash(pageData, refreshedNodes.map(nodeSnapshot));
    validateDraftNodeTree(draft.rootNodeStableId, refreshedNodes.map(nodeSnapshot));
    const updated = await tx.pageRevision.updateMany({
      where: { id: draft.id, kind: "DRAFT", editSequence: expectedEditSequence },
      data: {
        source: "LEGACY_SYNC",
        pageData: asInputJson(pageData),
        editSequence: { increment: 1 },
        contentHash,
      },
    });
    if (updated.count !== 1) throw new ApiRouteError("DRAFT_STALE", "The page draft changed during synchronization.", 409);

    await tx.pageDocument.update({
      where: { id: document.id },
      data: {
        legacySourceHash: hashDocumentValue(sections),
        legacySyncedAt: new Date(),
      },
    });

    return serializeDocument((await loadDocument(projectId, tx))!);
  });
}

export async function patchPageDocumentDraft(projectId: string, input: PageDocumentPatchInput) {
  return prisma.$transaction(async (tx) => {
    const document = await loadDocument(projectId, tx);
    if (!document) throw new ApiRouteError("DOCUMENT_NOT_FOUND", "Page document has not been initialized.", 404);
    const draft = document.revisions.find((revision) => revision.number === 0);
    if (!draft || draft.kind !== "DRAFT") throw new ApiRouteError("DRAFT_NOT_FOUND", "Editable draft revision is missing.", 409);
    if (draft.editSequence !== input.expectedEditSequence) {
      throw new ApiRouteError("DRAFT_STALE", "The page draft has changed. Refresh before saving.", 409);
    }

    const nodeByStableId = new Map(draft.nodes.map((node) => [node.stableId, node]));
    for (const operation of input.operations) {
      if (operation.op === "insert") {
        const stableId = operation.node.stableId ?? `mxnode_${randomUUID().replace(/-/g, "")}`;
        if (nodeByStableId.has(stableId)) throw new ApiRouteError("NODE_EXISTS", `Node ${stableId} already exists.`, 409);
        if (operation.node.parentStableId && !nodeByStableId.has(operation.node.parentStableId)) {
          throw new ApiRouteError("PARENT_NODE_NOT_FOUND", "The requested parent node does not exist.", 400);
        }
        const nodeHash = hashDocumentValue({ nodeType: operation.node.nodeType, data: operation.node.data });
        const created = await tx.pageNode.create({
          data: {
            revisionId: draft.id,
            stableId,
            parentStableId: operation.node.parentStableId,
            nodeType: operation.node.nodeType,
            sortOrder: operation.node.sortOrder,
            data: asInputJson(operation.node.data),
            sourceType: "mxpage",
            nodeHash,
          },
        });
        nodeByStableId.set(stableId, created);
        continue;
      }

      const current = nodeByStableId.get(operation.stableId);
      if (!current) throw new ApiRouteError("NODE_NOT_FOUND", `Node ${operation.stableId} was not found.`, 404);
      if (current.status !== "active") {
        throw new ApiRouteError("NODE_ARCHIVED", `Node ${operation.stableId} is archived and cannot be edited.`, 409);
      }
      if (current.stableId === draft.rootNodeStableId && operation.op === "remove") {
        throw new ApiRouteError("ROOT_NODE_REQUIRED", "The page root node cannot be removed.", 409);
      }

      if (operation.op === "update") {
        const nodeHash = hashDocumentValue({ nodeType: current.nodeType, data: operation.data });
        const updated = await tx.pageNode.update({
          where: { revisionId_stableId: { revisionId: draft.id, stableId: current.stableId } },
          data: { data: asInputJson(operation.data), nodeHash },
        });
        nodeByStableId.set(current.stableId, updated);
        if (current.legacySectionId && current.nodeType === "commerce.section") {
          await projectNodesToLegacySections(tx, [{
            nodeType: current.nodeType,
            status: current.status,
            legacySectionId: current.legacySectionId,
            data: operation.data,
          }]);
        }
      } else if (operation.op === "move") {
        if (operation.parentStableId === current.stableId) throw new ApiRouteError("NODE_CYCLE", "A node cannot be its own parent.", 400);
        if (operation.parentStableId && !nodeByStableId.has(operation.parentStableId)) {
          throw new ApiRouteError("PARENT_NODE_NOT_FOUND", "The requested parent node does not exist.", 400);
        }
        const updated = await tx.pageNode.update({
          where: { revisionId_stableId: { revisionId: draft.id, stableId: current.stableId } },
          data: { parentStableId: operation.parentStableId, sortOrder: operation.sortOrder },
        });
        nodeByStableId.set(current.stableId, updated);
      } else {
        await tx.pageNode.update({
          where: { revisionId_stableId: { revisionId: draft.id, stableId: current.stableId } },
          data: { status: "archived", archivedAt: new Date() },
        });
      }
    }

    const refreshedNodes = await tx.pageNode.findMany({ where: { revisionId: draft.id } });
    const pageData = input.pageData ?? (draft.pageData as Record<string, unknown>);
    const contentHash = computeRevisionContentHash(pageData, refreshedNodes.map(nodeSnapshot));
    validateDraftNodeTree(draft.rootNodeStableId, refreshedNodes.map(nodeSnapshot));
    const updated = await tx.pageRevision.updateMany({
      where: { id: draft.id, kind: "DRAFT", editSequence: input.expectedEditSequence },
      data: {
        source: "MXPAGE_EDIT",
        pageData: asInputJson(pageData),
        editSequence: { increment: 1 },
        contentHash,
      },
    });
    if (updated.count !== 1) throw new ApiRouteError("DRAFT_STALE", "The page draft changed while saving.", 409);
    await tx.pageDocument.update({ where: { id: document.id }, data: { authority: "MXPAGE" } });
    return serializeDocument((await loadDocument(projectId, tx))!);
  });
}

export async function publishPageDocument(
  projectId: string,
  expectedEditSequence: number,
  expectedContentHash: string,
  summary?: string,
) {
  return prisma.$transaction(async (tx) => {
    const document = await loadDocument(projectId, tx);
    if (!document) throw new ApiRouteError("DOCUMENT_NOT_FOUND", "Page document has not been initialized.", 404);
    const draft = document.revisions.find((revision) => revision.number === 0);
    if (!draft || draft.kind !== "DRAFT") throw new ApiRouteError("DRAFT_NOT_FOUND", "Editable draft revision is missing.", 409);
    if (draft.editSequence !== expectedEditSequence) {
      throw new ApiRouteError("DRAFT_STALE", "The page draft changed before publishing.", 409);
    }
    if (draft.contentHash !== expectedContentHash) {
      throw new ApiRouteError("CONTENT_CHANGED", "The page content changed before publishing.", 409);
    }
    validateDraftNodeTree(draft.rootNodeStableId, draft.nodes.map(nodeSnapshot));

    const revisionNumber = document.nextPublishNumber;
    const published = await tx.pageRevision.create({
      data: {
        documentId: document.id,
        number: revisionNumber,
        kind: "PUBLISHED",
        source: "PUBLISH_SNAPSHOT",
        schemaVersion: draft.schemaVersion,
        pageData: asInputJson(draft.pageData),
        rootNodeStableId: draft.rootNodeStableId,
        editSequence: draft.editSequence,
        contentHash: draft.contentHash,
        parentRevisionId: document.publishedRevisionId,
        summary: summary?.trim() || `Published revision ${revisionNumber}`,
        publishedAt: new Date(),
        nodes: {
          create: draft.nodes.map((node) => ({
            stableId: node.stableId,
            parentStableId: node.parentStableId,
            nodeType: node.nodeType,
            sortOrder: node.sortOrder,
            data: asInputJson(node.data),
            sourceType: node.sourceType,
            sourceKey: node.sourceKey,
            sourceRecordId: node.sourceRecordId,
            legacySectionId: node.legacySectionId,
            nodeHash: node.nodeHash,
            status: node.status,
            archivedAt: node.archivedAt,
          })),
        },
      },
    });

    await tx.pageDocument.update({
      where: { id: document.id },
      data: {
        publishedRevisionId: published.id,
        nextPublishNumber: { increment: 1 },
      },
    });

    return serializeDocument((await loadDocument(projectId, tx))!);
  });
}

export async function rollbackPageDocument(
  projectId: string,
  targetRevisionId: string,
  resetDraft: boolean,
  expectedEditSequence?: number,
) {
  return prisma.$transaction(async (tx) => {
    const document = await loadDocument(projectId, tx);
    if (!document) throw new ApiRouteError("DOCUMENT_NOT_FOUND", "Page document has not been initialized.", 404);
    const target = document.revisions.find((revision) => revision.id === targetRevisionId);
    if (!target || target.kind !== "PUBLISHED") {
      throw new ApiRouteError("REVISION_NOT_FOUND", "The requested published revision does not belong to this document.", 404);
    }

    if (resetDraft) {
      const draft = document.revisions.find((revision) => revision.number === 0);
      if (!draft || draft.kind !== "DRAFT") throw new ApiRouteError("DRAFT_NOT_FOUND", "Editable draft revision is missing.", 409);
      if (expectedEditSequence === undefined || draft.editSequence !== expectedEditSequence) {
        throw new ApiRouteError("DRAFT_STALE", "The page draft changed before rollback.", 409);
      }
      await tx.pageNode.deleteMany({ where: { revisionId: draft.id } });
      await tx.pageNode.createMany({
        data: target.nodes.map((node) => ({
          revisionId: draft.id,
          stableId: node.stableId,
          parentStableId: node.parentStableId,
          nodeType: node.nodeType,
          sortOrder: node.sortOrder,
          data: asInputJson(node.data),
          sourceType: node.sourceType,
          sourceKey: node.sourceKey,
          sourceRecordId: node.sourceRecordId,
          legacySectionId: node.legacySectionId,
          nodeHash: node.nodeHash,
          status: node.status,
          archivedAt: node.archivedAt,
        })),
      });
      await tx.pageRevision.update({
        where: { id: draft.id },
        data: {
          source: "ROLLBACK",
          pageData: asInputJson(target.pageData),
          rootNodeStableId: target.rootNodeStableId,
          contentHash: target.contentHash,
          editSequence: { increment: 1 },
          summary: `Draft reset from published revision ${target.number}`,
        },
      });
      await projectNodesToLegacySections(tx, target.nodes);
    }

    await tx.pageDocument.update({
      where: { id: document.id },
      data: { publishedRevisionId: target.id },
    });
    return serializeDocument((await loadDocument(projectId, tx))!);
  });
}
