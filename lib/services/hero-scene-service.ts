import { prisma } from "@/lib/db/prisma";

const DEFAULT_SCENES = [
  {
    name: "白底简约",
    category: "standard",
    scenePrompt: "纯白背景，柔和影棚光，产品居中，干净极简，适合电商主图",
    aspectRatio: "1:1",
    sortOrder: 0,
    isDefault: true,
  },
  {
    name: "生活家居",
    category: "lifestyle",
    scenePrompt: "温馨的居家场景，木质桌面或沙发背景，自然窗光，生活气息浓厚",
    aspectRatio: "1:1",
    sortOrder: 1,
    isDefault: true,
  },
  {
    name: "户外自然",
    category: "lifestyle",
    scenePrompt: "户外自然场景，草地或绿植背景，阳光明亮，清新自然",
    aspectRatio: "1:1",
    sortOrder: 2,
    isDefault: true,
  },
  {
    name: "礼盒开箱",
    category: "promotion",
    scenePrompt: "精美礼盒开箱场景，丝带装饰，仪式感强，适合送礼主题",
    aspectRatio: "1:1",
    sortOrder: 3,
    isDefault: true,
  },
  {
    name: "科技感",
    category: "style",
    scenePrompt: "深色科技背景，蓝色冷光，电路纹理，未来感强烈",
    aspectRatio: "1:1",
    sortOrder: 4,
    isDefault: true,
  },
  {
    name: "节日氛围",
    category: "promotion",
    scenePrompt: "喜庆节日场景，红色金色装饰，灯笼或礼物元素，促销感强",
    aspectRatio: "1:1",
    sortOrder: 5,
    isDefault: true,
  },
  {
    name: "运动活力",
    category: "lifestyle",
    scenePrompt: "运动场景，健身房或跑道背景，动感光线，年轻活力",
    aspectRatio: "1:1",
    sortOrder: 6,
    isDefault: true,
  },
  {
    name: "暗黑高级",
    category: "style",
    scenePrompt: "黑色高级背景，聚光灯打在产品上，金属光泽，高端质感",
    aspectRatio: "1:1",
    sortOrder: 7,
    isDefault: true,
  },
];

export async function ensureDefaultScenes() {
  const existingCount = await prisma.heroSceneLibrary.count({ where: { isDefault: true } });
  if (existingCount > 0) return;

  await prisma.heroSceneLibrary.createMany({
    data: DEFAULT_SCENES,
  });
}

export async function createScene(input: {
  name: string;
  category?: string;
  scenePrompt: string;
  aspectRatio?: string;
  sortOrder?: number;
  isDefault?: boolean;
  accessKeyId?: string | null;
}) {
  const accessKeyId = input.accessKeyId ?? null;
  return prisma.heroSceneLibrary.create({
    data: {
      name: input.name,
      category: input.category ?? "general",
      scenePrompt: input.scenePrompt,
      aspectRatio: input.aspectRatio ?? "1:1",
      sortOrder: input.sortOrder ?? 0,
      isDefault: accessKeyId ? false : (input.isDefault ?? false),
      accessKeyId,
    },
  });
}

export async function getAllScenes(category?: string, accessKeyId: string | null = null) {
  return prisma.heroSceneLibrary.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(accessKeyId ? { OR: [{ isDefault: true }, { accessKeyId }] } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

export async function getSceneById(id: string, accessKeyId: string | null = null) {
  return prisma.heroSceneLibrary.findFirst({
    where: {
      id,
      ...(accessKeyId ? { OR: [{ isDefault: true }, { accessKeyId }] } : {}),
    },
  });
}

export async function updateScene(
  id: string,
  input: Partial<{
    name: string;
    category: string;
    scenePrompt: string;
    aspectRatio: string;
    sortOrder: number;
    isDefault: boolean;
  }>,
  accessKeyId: string | null = null,
) {
  const existing = await prisma.heroSceneLibrary.findFirst({
    where: { id, ...(accessKeyId ? { accessKeyId } : {}) },
    select: { id: true },
  });
  if (!existing) throw new Error("Scene not found.");
  return prisma.heroSceneLibrary.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.scenePrompt !== undefined && { scenePrompt: input.scenePrompt }),
      ...(input.aspectRatio !== undefined && { aspectRatio: input.aspectRatio }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isDefault !== undefined && !accessKeyId && { isDefault: input.isDefault }),
    },
  });
}

export async function deleteScene(id: string, accessKeyId: string | null = null) {
  const existing = await prisma.heroSceneLibrary.findFirst({
    where: { id, ...(accessKeyId ? { accessKeyId } : {}) },
    select: { id: true },
  });
  if (!existing) return null;
  return prisma.heroSceneLibrary.delete({ where: { id } });
}
