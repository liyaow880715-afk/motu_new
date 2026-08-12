import { createHash } from "crypto";

export type LegacySectionSnapshot = {
  id: string;
  sectionKey: string;
  type: string;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  order: number;
  status: string;
  currentImageAssetId?: string | null;
  editableData?: unknown;
};

export type DraftNodeSnapshot = {
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
};

export type LegacyNodeMutation =
  | { kind: "create"; node: DraftNodeSnapshot }
  | { kind: "update"; stableId: string; node: DraftNodeSnapshot }
  | { kind: "archive"; stableId: string };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

export function stableJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function hashDocumentValue(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function rootNodeStableId(projectId: string) {
  return `mxroot_${hashDocumentValue({ projectId, role: "root" }).slice(0, 24)}`;
}

export function legacySectionStableId(projectId: string, sectionKey: string) {
  return `mxnode_${hashDocumentValue({ projectId, source: "legacy_page_section", sectionKey }).slice(0, 24)}`;
}

function readAspectRatio(section: LegacySectionSnapshot) {
  const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
  const controls = (editableData.controls as Record<string, unknown> | null) ?? {};
  const explicit = controls.aspectRatio ?? editableData.aspectRatio;
  if (explicit === "1:1" || explicit === "3:4" || explicit === "9:16") return explicit;
  return section.type === "HERO" ? "1:1" : "9:16";
}

export function legacySectionToDraftNode(
  projectId: string,
  rootStableId: string,
  section: LegacySectionSnapshot,
  stableId = legacySectionStableId(projectId, section.sectionKey),
): DraftNodeSnapshot {
  const data = {
    content: {
      title: section.title,
      goal: section.goal,
      copy: section.copy,
      visualPrompt: section.visualPrompt,
    },
    section: {
      sectionType: section.type,
      sectionKey: section.sectionKey,
      status: section.status,
    },
    layout: {
      aspectRatio: readAspectRatio(section),
    },
    style: {},
    assetRefs: section.currentImageAssetId ? [section.currentImageAssetId] : [],
    aiConfig: {
      editableData: section.editableData ?? {},
    },
  };

  return {
    stableId,
    parentStableId: rootStableId,
    nodeType: "commerce.section",
    sortOrder: section.order,
    data,
    sourceType: "legacy_page_section",
    sourceKey: section.sectionKey,
    sourceRecordId: section.id,
    legacySectionId: section.id,
    nodeHash: hashDocumentValue({ nodeType: "commerce.section", data }),
    status: "active",
    archivedAt: null,
  };
}

export function buildLegacyNodeMutations(input: {
  projectId: string;
  rootStableId: string;
  sections: LegacySectionSnapshot[];
  existingNodes: DraftNodeSnapshot[];
}) {
  const keys = new Set<string>();
  for (const section of input.sections) {
    if (keys.has(section.sectionKey)) {
      throw new Error(`Duplicate legacy sectionKey: ${section.sectionKey}`);
    }
    keys.add(section.sectionKey);
  }

  const existingBySourceKey = new Map(
    input.existingNodes
      .filter((node) => node.sourceType === "legacy_page_section" && node.sourceKey)
      .map((node) => [node.sourceKey as string, node]),
  );
  const mutations: LegacyNodeMutation[] = [];

  for (const section of [...input.sections].sort((left, right) => left.order - right.order)) {
    const existing = existingBySourceKey.get(section.sectionKey);
    const node = legacySectionToDraftNode(
      input.projectId,
      input.rootStableId,
      section,
      existing?.stableId,
    );
    mutations.push(existing
      ? { kind: "update", stableId: existing.stableId, node }
      : { kind: "create", node });
  }

  for (const existing of existingBySourceKey.values()) {
    if (!keys.has(existing.sourceKey as string) && existing.status !== "archived") {
      mutations.push({ kind: "archive", stableId: existing.stableId });
    }
  }

  return mutations;
}

export function computeRevisionContentHash(pageData: unknown, nodes: DraftNodeSnapshot[]) {
  return hashDocumentValue({
    pageData,
    nodes: nodes
      .filter((node) => node.status === "active")
      .sort((left, right) => left.sortOrder - right.sortOrder || left.stableId.localeCompare(right.stableId))
      .map((node) => ({
        stableId: node.stableId,
        parentStableId: node.parentStableId,
        nodeType: node.nodeType,
        sortOrder: node.sortOrder,
        nodeHash: node.nodeHash,
      })),
  });
}

export function validateDraftNodeTree(rootStableId: string, nodes: DraftNodeSnapshot[]) {
  const activeNodes = nodes.filter((node) => node.status === "active");
  const byStableId = new Map<string, DraftNodeSnapshot>();
  for (const node of activeNodes) {
    if (byStableId.has(node.stableId)) {
      throw new Error(`Duplicate node stableId: ${node.stableId}`);
    }
    byStableId.set(node.stableId, node);
  }

  const root = byStableId.get(rootStableId);
  if (!root || root.nodeType !== "page.root" || root.parentStableId !== null) {
    throw new Error("The document must contain exactly one valid page.root node.");
  }

  const rootNodes = activeNodes.filter((node) => node.parentStableId === null);
  if (rootNodes.length !== 1 || rootNodes[0]?.stableId !== rootStableId) {
    throw new Error("The document contains multiple roots or an invalid root pointer.");
  }

  for (const node of activeNodes) {
    if (node.stableId === rootStableId) continue;
    if (!node.parentStableId || !byStableId.has(node.parentStableId)) {
      throw new Error(`Node ${node.stableId} has no active parent.`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (stableId: string) => {
    if (visiting.has(stableId)) throw new Error(`Node cycle detected at ${stableId}.`);
    if (visited.has(stableId)) return;
    visiting.add(stableId);
    for (const node of activeNodes) {
      if (node.parentStableId === stableId) visit(node.stableId);
    }
    visiting.delete(stableId);
    visited.add(stableId);
  };
  visit(rootStableId);

  if (visited.size !== activeNodes.length) {
    throw new Error("The document contains nodes that are unreachable from the root.");
  }
}
