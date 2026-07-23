import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";

const COPY_GENERATION_PROMPT = `你是拼多多电商文案专家。请根据用户提供且已明确确认的商品事实，生成 10-20 条高转化、差异化的主图文案。

要求：
1. 每条文案 4-12 个字，适合放在主图上
2. 每条只突出一个有事实依据的卖点或利益点；没有事实依据时使用中性产品描述，不制造紧迫感
3. 文案之间要有明显差异，避免重复
4. 适合中国消费者，口语化、有吸引力
5. 禁止绝对化用语、虚假功效、未经证实的销量/好评/从众、限时限量、认证和竞品贬低
6. 输出 JSON 数组格式，不要 markdown 代码块

输出示例：
["轻盈不粘手","细节纹理清晰","适合日常使用","规格信息清楚"]`;

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
