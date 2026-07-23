import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";

const router = Router();

const ok = <T>(data: T) => ({ success: true as const, data });
const fail = (code: string, message: string, status: number) => ({ success: false as const, error: { code, message, status } });

const SHARE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomShareChar() {
  return SHARE_CODE_ALPHABET[Math.floor(Math.random() * SHARE_CODE_ALPHABET.length)];
}

function generateShareCode() {
  return Array.from({ length: 6 }, randomShareChar).join("");
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

function getAccessKey(req: any): string | undefined {
  const value = req.headers["x-access-key"];
  return typeof value === "string" ? value : undefined;
}

const colorTokensSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  accent: z.string(),
  background: z.string(),
  surface: z.string(),
  text: z.string(),
});

const createSchema = z.object({
  name: z.string().min(1, "预设名称不能为空"),
  description: z.string().optional().nullable(),
  colorTokens: colorTokensSchema,
  tags: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  shareCode: z.string().length(6).optional().nullable(),
});

const importSchema = z.object({
  shareCode: z.string().length(6),
});

// GET /api/palette-presets
router.get("/", async (req, res) => {
  try {
    const key = getAccessKey(req) ?? "";
    const presets = await prisma.palettePreset.findMany({
      where: { key },
      orderBy: { createdAt: "desc" },
    });
    return res.json(ok({ presets }));
  } catch (error: any) {
    return res.status(500).json(fail("INTERNAL_ERROR", error.message || "服务器内部错误", 500));
  }
});

// POST /api/palette-presets
router.post("/", async (req, res) => {
  try {
    const key = getAccessKey(req);
    if (!key) {
      return res.status(401).json(fail("MISSING_KEY", "缺少激活码", 401));
    }

    const parsed = createSchema.parse(req.body);

    let shareCode = parsed.shareCode?.toUpperCase();
    if (shareCode) {
      const existing = await prisma.palettePreset.findUnique({ where: { shareCode } });
      if (existing) shareCode = await generateUniqueShareCode();
    } else {
      shareCode = await generateUniqueShareCode();
    }

    const preset = await prisma.palettePreset.create({
      data: {
        name: parsed.name,
        description: parsed.description ?? null,
        colorTokens: parsed.colorTokens as any,
        tags: parsed.tags ?? null,
        category: parsed.category ?? null,
        shareCode,
        key,
      },
    });

    return res.status(201).json(ok({ preset }));
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(fail("VALIDATION_ERROR", error.issues[0]?.message || "参数错误", 400));
    }
    return res.status(500).json(fail("INTERNAL_ERROR", error.message || "服务器内部错误", 500));
  }
});

// GET /api/palette-presets/:shareCode (public lookup)
router.get("/:shareCode", async (req, res) => {
  try {
    const shareCode = req.params.shareCode.toUpperCase();
    const preset = await prisma.palettePreset.findUnique({ where: { shareCode } });
    if (!preset) {
      return res.status(404).json(fail("NOT_FOUND", "分享码不存在或已失效", 404));
    }
    return res.json(ok({ preset }));
  } catch (error: any) {
    return res.status(500).json(fail("INTERNAL_ERROR", error.message || "服务器内部错误", 500));
  }
});

// POST /api/palette-presets/import
router.post("/import", async (req, res) => {
  try {
    const key = getAccessKey(req);
    if (!key) {
      return res.status(401).json(fail("MISSING_KEY", "缺少激活码", 401));
    }

    const parsed = importSchema.parse(req.body);
    const shareCode = parsed.shareCode.toUpperCase();

    const source = await prisma.palettePreset.findUnique({ where: { shareCode } });
    if (!source) {
      return res.status(404).json(fail("NOT_FOUND", "分享码不存在或已失效", 404));
    }

    const imported = await prisma.palettePreset.create({
      data: {
        name: `${source.name}（导入）`,
        description: source.description,
        colorTokens: source.colorTokens as any,
        tags: source.tags,
        category: source.category,
        shareCode: await generateUniqueShareCode(),
        key,
      },
    });

    return res.status(201).json(ok({ preset: imported }));
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(fail("VALIDATION_ERROR", error.issues[0]?.message || "参数错误", 400));
    }
    return res.status(500).json(fail("INTERNAL_ERROR", error.message || "服务器内部错误", 500));
  }
});

export default router;
