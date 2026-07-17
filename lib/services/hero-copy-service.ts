import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";

const COPY_GENERATION_PROMPT = `你是拼多多电商文案专家。请根据用户提供的商品信息，生成 10-20 条高转化、差异化的主图文案。

要求：
1. 每条文案 4-12 个字，适合放在主图上
2. 突出卖点、利益点或紧迫感
3. 文案之间要有明显差异，避免重复
4. 适合中国消费者，口语化、有吸引力
5. 输出 JSON 数组格式，不要 markdown 代码块

输出示例：
["限时特惠","买一送一","工厂直发","到手即用","好评如潮","四季通用","网红同款","超值套装"]`;

export async function createCopyLibrary(input: {
  name: string;
  category?: string;
  copies?: string[];
}) {
  return prisma.heroCopyLibrary.create({
    data: {
      name: input.name,
      category: input.category ?? "general",
      copies: input.copies ?? [],
    },
  });
}

export async function getAllCopyLibraries(category?: string) {
  return prisma.heroCopyLibrary.findMany({
    where: category ? { category } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function getCopyLibraryById(id: string) {
  return prisma.heroCopyLibrary.findUnique({ where: { id } });
}

export async function updateCopyLibrary(
  id: string,
  input: Partial<{ name: string; category: string; copies: string[] }>,
) {
  return prisma.heroCopyLibrary.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.copies !== undefined && { copies: input.copies }),
    },
  });
}

export async function deleteCopyLibrary(id: string) {
  return prisma.heroCopyLibrary.delete({ where: { id } });
}

export async function generateCopiesWithAI(productName: string, productDescription?: string): Promise<string[]> {
  const { adapter, provider } = await getProviderAdapter("text");
  const model = provider.models[0]?.modelId ?? "";

  const userPrompt = [
    `商品名称：${productName}`,
    productDescription ? `商品描述：${productDescription}` : "",
    "请生成 10-20 条适合放在拼多多主图上的卖点文案，输出 JSON 数组。",
  ].filter(Boolean).join("\n");

  const result = await adapter.generateText({
    model,
    systemPrompt: COPY_GENERATION_PROMPT,
    userPrompt,
    timeoutMs: 120000,
  });

  let parsed: string[] = [];
  try {
    const cleaned = result.text.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
    parsed = JSON.parse(cleaned) as string[];
  } catch {
    const match = result.text.match(/\[[\s\S]*\]/);
    if (match) {
      parsed = JSON.parse(match[0]) as string[];
    }
  }

  return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim() !== "") : [];
}
