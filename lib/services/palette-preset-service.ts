import { Prisma } from "@prisma/client";
import { customAlphabet } from "nanoid";

import { prisma } from "@/lib/db/prisma";
import type { ColorTokens, PaletteOption } from "@/types/domain";

const generateShareCode = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 6);

export interface PalettePresetInput {
  name: string;
  description?: string | null;
  colorTokens: ColorTokens;
  tags?: string | null;
  category?: string | null;
  accessKeyId?: string | null;
  projectId?: string | null;
}

export interface PalettePresetOutput {
  id: string;
  name: string;
  description: string | null;
  colorTokens: ColorTokens;
  tags: string | null;
  category: string | null;
  shareCode: string | null;
  accessKeyId: string | null;
  projectId: string | null;
  createdAt: Date;
}

function toOutput(preset: {
  id: string;
  name: string;
  description: string | null;
  colorTokens: Prisma.JsonValue;
  tags: string | null;
  category: string | null;
  shareCode: string | null;
  accessKeyId: string | null;
  projectId: string | null;
  createdAt: Date;
}): PalettePresetOutput {
  return {
    ...preset,
    colorTokens: (preset.colorTokens ?? {}) as unknown as ColorTokens,
  };
}

async function generateUniqueShareCode(): Promise<string> {
  let code = generateShareCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const existing = await prisma.palettePreset.findUnique({ where: { shareCode: code } });
    if (!existing) return code;
    code = generateShareCode();
  }
  return code;
}

export async function listPalettePresets(accessKeyId?: string | null): Promise<PalettePresetOutput[]> {
  const presets = await prisma.palettePreset.findMany({
    where: {
      accessKeyId: accessKeyId ?? "",
    },
    orderBy: { createdAt: "desc" },
  });
  return presets.map(toOutput);
}

export async function createPalettePreset(input: PalettePresetInput): Promise<PalettePresetOutput> {
  const shareCode = await generateUniqueShareCode();
  const preset = await prisma.palettePreset.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      colorTokens: input.colorTokens as unknown as Prisma.InputJsonValue,
      tags: input.tags ?? null,
      category: input.category ?? null,
      shareCode,
      accessKeyId: input.accessKeyId ?? null,
      projectId: input.projectId ?? null,
    },
  });
  return toOutput(preset);
}

export async function getPalettePresetById(
  id: string,
  accessKeyId?: string | null,
): Promise<PalettePresetOutput | null> {
  const preset = await prisma.palettePreset.findFirst({
    where: {
      id,
      OR: [{ accessKeyId: accessKeyId ?? "" }, { shareCode: { not: null } }],
    },
  });
  return preset ? toOutput(preset) : null;
}

export async function getPalettePresetByShareCode(shareCode: string): Promise<PalettePresetOutput | null> {
  const preset = await prisma.palettePreset.findUnique({
    where: { shareCode: shareCode.toUpperCase() },
  });
  return preset ? toOutput(preset) : null;
}

export async function updatePalettePreset(
  id: string,
  input: Partial<PalettePresetInput>,
  accessKeyId?: string | null,
): Promise<PalettePresetOutput | null> {
  const existing = await prisma.palettePreset.findFirst({
    where: { id, accessKeyId: accessKeyId ?? "" },
  });
  if (!existing) return null;

  const data: Prisma.PalettePresetUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.colorTokens !== undefined) data.colorTokens = input.colorTokens as unknown as Prisma.InputJsonValue;
  if (input.tags !== undefined) data.tags = input.tags ?? null;
  if (input.category !== undefined) data.category = input.category ?? null;

  const preset = await prisma.palettePreset.update({
    where: { id },
    data,
  });
  return toOutput(preset);
}

export async function deletePalettePreset(
  id: string,
  accessKeyId?: string | null,
): Promise<{ id: string } | null> {
  const existing = await prisma.palettePreset.findFirst({
    where: { id, accessKeyId: accessKeyId ?? "" },
  });
  if (!existing) return null;

  await prisma.palettePreset.delete({ where: { id } });
  return { id };
}

export async function importPalettePresetByShareCode(
  shareCode: string,
  accessKeyId?: string | null,
): Promise<PalettePresetOutput | null> {
  const source = await getPalettePresetByShareCode(shareCode);
  if (!source) return null;

  return createPalettePreset({
    name: `${source.name}（导入）`,
    description: source.description,
    colorTokens: source.colorTokens,
    tags: source.tags,
    category: source.category,
    accessKeyId: accessKeyId ?? null,
  });
}

export function palettePresetToPaletteOption(preset: PalettePresetOutput): PaletteOption {
  return {
    id: `preset-${preset.id}`,
    name: preset.name,
    description: preset.description ?? preset.tags ?? "自定义配色预设",
    colorTokens: preset.colorTokens,
  };
}
