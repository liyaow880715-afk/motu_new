import { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import { z } from "zod";

import { buildSectionPlanningPrompt } from "@/lib/ai/prompts";
import {
  isGenericCommerceHeadline,
  resolveHeroAngle,
  type HeroAngle,
} from "@/lib/ai/prompts/hero-angles";
import { sectionPlanOutputSchema } from "@/lib/ai/schemas/section-plan";
import { prisma } from "@/lib/db/prisma";
import {
  extractProjectColorPalette,
  generatePaletteOptions,
  applyPaletteToStyleGuide,
  type ExtractedColorPalette,
} from "@/lib/services/color-palette-service";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { reconcilePageDocumentAfterLegacyPlanning } from "@/lib/services/page-document-service";
import { hashDocumentValue } from "@/lib/services/page-document-model";
import { completeTask, createTask, failTask, findRecentRunningTask } from "@/lib/services/task-service";
import { normalizeContentLanguage, type ContentLanguage } from "@/lib/utils/content-language";
import type { PaletteOption, PaletteStyle, SectionPlanControls, SectionTypeKey } from "@/types/domain";

type PreviewConfigInput = {
  heroImageCount: number;
  detailSectionCount: number;
  imageAspectRatio: "3:4" | "9:16";
  contentLanguage: ContentLanguage;
  optionalSections: string[];
};

type VisualMode = "poster" | "lifestyle_scene" | "studio" | "macro" | "data";

type TitleDesign = {
  layout: "editorial_left" | "editorial_center" | "split_level" | "minimal_caption";
  alignment: "left" | "center" | "right";
  placement: "top" | "upper_left" | "side";
  emphasis: string;
  lineBreakAfter: string;
  maxLines: number;
  panelStyle: "none" | "soft_band" | "label_strip";
};

type RawPlannedSection = {
  id: string;
  type: string;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  visualMode?: VisualMode;
  headlineAngle?: HeroAngle;
  mainTitle?: string;
  subTitle?: string;
  titleCandidates?: unknown[];
  supportingPoints?: string[];
  complianceNote?: string;
  titleDesign?: Partial<TitleDesign>;
  editableFields: Record<string, unknown>;
  funnelStage?: "attention" | "interest" | "trust" | "decision" | "conversion";
  targetShopper?: string;
  primaryObjection?: string;
  singleClaim?: string;
  claimSource?: string;
  proofDevice?: string;
  desiredAction?: string;
  platformProfile?: string;
  textBudget?: {
    headlineMaxChars?: number;
    sublineMaxChars?: number;
    badgeCount?: number;
    ctaAllowed?: boolean;
  };
};

type CommerceBrief = {
  funnelStage: "attention" | "interest" | "trust" | "decision" | "conversion";
  targetShopper: string;
  primaryObjection: string;
  singleClaim: string;
  claimSource: string;
  proofDevice: string;
  desiredAction: string;
  platformProfile: string;
  textBudget: {
    headlineMaxChars: number;
    sublineMaxChars: number;
    badgeCount: number;
    ctaAllowed: boolean;
  };
};

type NormalizedSection = {
  sectionKey: string;
  type: string;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  editableData: Record<string, unknown>;
  controls: SectionPlanControls;
  order: number;
  variantScope?: "base" | "variant" | "group";
  variantId?: string;
  variantIds?: string[];
  groupLayout?: "row" | "triangle" | "scene";
  planningOrigin?: "ai" | "template_fill";
};

const PLANNING_OUTPUT_TOKENS_PER_SECTION = 520;
const PLANNING_OUTPUT_TOKENS_MIN = 7200;
const PLANNING_OUTPUT_TOKENS_MAX = 12000;

type VariantWithAnalysis = {
  id: string;
  name: string;
  analysis?: Record<string, unknown> | null;
};

function defaultCommerceBrief(type: string): CommerceBrief {
  const isHero = type === "HERO";
  const isConversion = type === "SUMMARY";
  const isTrust = ["DETAIL_CLOSEUP", "MATERIAL", "SPECS", "INGREDIENTS_TABLE", "BRAND_TRUST", "PACKAGING"].includes(type);
  return {
    funnelStage: isHero ? "attention" : isConversion ? "conversion" : isTrust ? "trust" : "interest",
    targetShopper: "正在比较同类商品、需要快速确认购买理由的消费者",
    primaryObjection: isHero ? "第一眼无法判断商品是否值得继续了解" : "缺少足够直观的购买证据",
    singleClaim: "",
    claimSource: "",
    proofDevice: isHero ? "缩略图可识别的商品主体与单一利益点" : "与模块目标匹配的单一视觉证据",
    desiredAction: isConversion ? "形成下单意愿" : "继续浏览并建立信任",
    platformProfile: "按项目电商平台和当前模块位置优化",
    textBudget: {
      headlineMaxChars: 12,
      sublineMaxChars: 16,
      badgeCount: 0,
      ctaAllowed: isConversion,
    },
  };
}

function normalizeCommerceBrief(section: Partial<RawPlannedSection>, type: string): CommerceBrief {
  const fallback = defaultCommerceBrief(type);
  const budget = section.textBudget ?? {};
  return {
    funnelStage: section.funnelStage ?? fallback.funnelStage,
    targetShopper: section.targetShopper?.trim() || fallback.targetShopper,
    primaryObjection: section.primaryObjection?.trim() || fallback.primaryObjection,
    singleClaim: section.singleClaim?.trim() || "",
    claimSource: section.claimSource?.trim() || "",
    proofDevice: section.proofDevice?.trim() || fallback.proofDevice,
    desiredAction: section.desiredAction?.trim() || fallback.desiredAction,
    platformProfile: section.platformProfile?.trim() || fallback.platformProfile,
    textBudget: {
      headlineMaxChars: Math.min(24, Math.max(4, Number(budget.headlineMaxChars ?? fallback.textBudget.headlineMaxChars))),
      sublineMaxChars: Math.min(40, Math.max(0, Number(budget.sublineMaxChars ?? fallback.textBudget.sublineMaxChars))),
      badgeCount: Math.min(2, Math.max(0, Number(budget.badgeCount ?? fallback.textBudget.badgeCount))),
      ctaAllowed: budget.ctaAllowed ?? fallback.textBudget.ctaAllowed,
    },
  };
}

function readVariantAnalysis(variant: VariantWithAnalysis) {
  const metadata = (variant?.analysis ?? {}) as Record<string, unknown>;
  return typeof metadata.analysis === "object" && metadata.analysis !== null
    ? (metadata.analysis as Record<string, unknown>)
    : metadata;
}

function formatSpecsForCopy(specs: unknown): string {
  if (!Array.isArray(specs)) return "";
  return specs
    .filter((item): item is Record<string, string> => typeof item === "object" && item !== null && typeof (item as Record<string, string>).label === "string" && typeof (item as Record<string, string>).value === "string")
    .map((item) => `${item.label}：${item.value}`)
    .join("\n");
}

function formatIngredientsForCopy(ingredients: unknown, nutritionFacts?: unknown): string {
  const lines: string[] = [];
  if (Array.isArray(ingredients) && ingredients.length > 0) {
    lines.push(`配料：${ingredients.join("、")}`);
  }
  if (typeof nutritionFacts === "object" && nutritionFacts !== null) {
    const entries = Object.entries(nutritionFacts as Record<string, string>).filter(([, value]) => Boolean(value));
    if (entries.length > 0) {
      lines.push("营养成分：");
      entries.forEach(([key, value]) => lines.push(`  ${key}：${value}`));
    }
  }
  return lines.join("\n");
}

type SectionCopyInput = Pick<NormalizedSection, "type" | "title" | "goal" | "copy" | "visualPrompt" | "variantScope" | "variantId" | "variantIds">;

const OPTIONAL_SECTION_IDS = ["ingredients_table", "white_bg_product", "specs"] as const;

const previewConfigSchema = z.object({
  heroImageCount: z.number().int().min(3).max(5),
  detailSectionCount: z.number().int().min(4).max(10),
  imageAspectRatio: z.enum(["3:4", "9:16"]).default("9:16"),
  contentLanguage: z.enum(["zh-CN", "en-US", "ja-JP", "ko-KR"]).default("zh-CN"),
  optionalSections: z.array(z.enum(OPTIONAL_SECTION_IDS)).default([]),
});

const previewDecisionSchema = z.object({
  heroImageCount: z.number().int().min(3).max(5),
  detailSectionCount: z.number().int().min(4).max(10),
  reason: z.string().default(""),
});

function buildDefaultStyleGuide(style: string) {
  const normalized = style?.toLowerCase() ?? "";
  const styleKey = normalized === "premium" ? "luxury" : normalized;

  const palettes: Record<string, { background: string; primary: string; secondary: string; accent: string; text: string }> = {
    minimal: { background: "#F8F8F8", primary: "#1A1A1A", secondary: "#888888", accent: "#B0B0B0", text: "#111111" },
    luxury: { background: "#0F0F0F", primary: "#E8DCC4", secondary: "#A89F91", accent: "#C9A227", text: "#FFFFFF" },
    cute: { background: "#FFF5F7", primary: "#FF6B9D", secondary: "#FFB8D0", accent: "#FFD93D", text: "#3D1F2B" },
    tech: { background: "#0A1628", primary: "#E0E7FF", secondary: "#7AA2F7", accent: "#00D9FF", text: "#FFFFFF" },
    natural: { background: "#F5F0E8", primary: "#2D4A3E", secondary: "#8B9D83", accent: "#C4A35A", text: "#1A1A1A" },
    vintage: { background: "#EDE6D6", primary: "#4A3B2A", secondary: "#8C7B66", accent: "#B85C38", text: "#2B2218" },
    sporty: { background: "#F2F2F2", primary: "#111111", secondary: "#4A4A4A", accent: "#FF3B30", text: "#111111" },
  };

  const palette = palettes[styleKey] ?? palettes.minimal;

  const visualSystems: Record<string, { lighting: string; shadowStyle: string; textureStyle: string; compositionGrid: string; typographyScale: string; badgeStyle: string; iconStyle: string; productAngle: string; productSizeRatio: string; productPosition: string }> = {
    minimal: {
      lighting: "soft diffused studio light, no harsh shadows",
      shadowStyle: "very subtle 4px soft drop shadow",
      textureStyle: "clean flat surfaces, no visible texture",
      compositionGrid: "1080x1920, 80px margins, product occupies 50-60% of frame height",
      typographyScale: "headline 68px bold, subheadline 40px medium, body 30px regular, CTA 36px bold",
      badgeStyle: "compact corner label or slim label strip, thin border, never a large floating container",
      iconStyle: "thin 1.5px stroke monochrome line icons",
      productAngle: "straight-on front 3/4 view, slightly angled to show depth",
      productSizeRatio: "product takes 50-60% of vertical frame, never smaller than 40%",
      productPosition: "centered horizontally, anchored in lower-middle or center of frame",
    },
    luxury: {
      lighting: "dramatic low-key side light with soft rim highlight",
      shadowStyle: "deep soft shadows with gradual falloff",
      textureStyle: "rich material textures: velvet, marble, brushed metal",
      compositionGrid: "1080x1920, 72px margins, product occupies 45-55% of frame height with generous negative space",
      typographyScale: "headline 76px elegant serif or high-contrast sans, subheadline 42px light, body 30px regular, CTA 34px medium",
      badgeStyle: "small foil-stamped rectangular seal with fine border, kept subordinate to the headline",
      iconStyle: "refined 1px stroke icons in gold or cream",
      productAngle: "elegant 3/4 view or straight-on with subtle rotation, emphasizing craftsmanship",
      productSizeRatio: "product takes 45-55% of vertical frame, balanced with negative space",
      productPosition: "centered or slightly above center, surrounded by generous negative space",
    },
    cute: {
      lighting: "bright even front light, friendly and airy",
      shadowStyle: "soft pastel-colored shadows, rounded shapes",
      textureStyle: "smooth matte surfaces with subtle rounded patterns",
      compositionGrid: "1080x1920, 64px margins, product occupies 55-65% of frame height",
      typographyScale: "headline 72px rounded bold, subheadline 44px rounded medium, body 32px regular, CTA 38px bold",
      badgeStyle: "small playful sticker accent, never a full-width pill or headline container",
      iconStyle: "filled rounded icons with 2px outline",
      productAngle: "friendly front-facing or slight 3/4 tilt, approachable and playful",
      productSizeRatio: "product takes 55-65% of vertical frame, feels close and huggable",
      productPosition: "centered, often slightly low with decorative elements around",
    },
    tech: {
      lighting: "cool directional top light with subtle neon rim glow",
      shadowStyle: "sharp tech shadows with 12px blur",
      textureStyle: "dark carbon fiber, brushed aluminum, subtle grid lines",
      compositionGrid: "1080x1920, 76px margins, product occupies 50-60% of frame height",
      typographyScale: "headline 74px geometric bold, subheadline 40px medium, body 30px regular, CTA 36px bold",
      badgeStyle: "compact angular technical label with restrained glow",
      iconStyle: "sharp 2px stroke tech icons",
      productAngle: "clean straight-on or precise 3/4 view, emphasizing technical precision",
      productSizeRatio: "product takes 50-60% of vertical frame, sharp and defined",
      productPosition: "centered or slightly right, with tech specs/copy on the opposite side",
    },
    natural: {
      lighting: "warm natural daylight from upper left, soft and organic",
      shadowStyle: "soft organic shadows with natural falloff",
      textureStyle: "kraft paper, linen, wood grain, subtle botanical accents",
      compositionGrid: "1080x1920, 72px margins, product occupies 50-60% of frame height",
      typographyScale: "headline 70px friendly serif or soft sans, subheadline 42px medium, body 32px regular, CTA 36px bold",
      badgeStyle: "hand-stamped or kraft-label style badge",
      iconStyle: "organic hand-drawn style 2px stroke icons",
      productAngle: "natural angle showing real usage, slightly above eye level",
      productSizeRatio: "product takes 50-60% of vertical frame, grounded and approachable",
      productPosition: "centered or slightly lower, grounded with natural props around",
    },
    vintage: {
      lighting: "warm golden hour light with soft vignette",
      shadowStyle: "warm brown-tinged soft shadows",
      textureStyle: "aged paper, faded film grain, subtle dust texture",
      compositionGrid: "1080x1920, 68px margins, product occupies 50-60% of frame height",
      typographyScale: "headline 72px vintage serif, subheadline 40px medium, body 30px regular, CTA 36px bold",
      badgeStyle: "retro seal or ribbon badge with ornamental border",
      iconStyle: "vintage etched 2px stroke icons",
      productAngle: "classic angled still-life view, reminiscent of vintage product photography",
      productSizeRatio: "product takes 50-60% of vertical frame, timeless proportions",
      productPosition: "centered with classic still-life arrangement, slightly low",
    },
    sporty: {
      lighting: "high-energy directional side light, strong contrast",
      shadowStyle: "bold dynamic shadows with 10px blur",
      textureStyle: "athletic mesh, rubber, carbon fiber accents",
      compositionGrid: "1080x1920, 64px margins, product occupies 55-65% of frame height, dynamic diagonal energy",
      typographyScale: "headline 78px bold italic sans, subheadline 44px bold, body 32px regular, CTA 40px bold",
      badgeStyle: "angular dynamic badge with speed lines",
      iconStyle: "bold 2.5px stroke action icons",
      productAngle: "dynamic 3/4 action angle, suggesting movement and energy",
      productSizeRatio: "product takes 55-65% of vertical frame, bold and dominant",
      productPosition: "centered with dynamic diagonal orientation, breaking the grid slightly",
    },
  };

  const toneProfiles: Record<string, { colorTemperature: string; exposure: string; contrastLevel: string; paletteRatio: string }> = {
    minimal: {
      colorTemperature: "neutral daylight, approximately 5200K",
      exposure: "bright mid-key exposure with protected white highlights",
      contrastLevel: "medium contrast, clean blacks, soft highlight roll-off",
      paletteRatio: "70% background/base, 20% primary/support, maximum 10% accent",
    },
    luxury: {
      colorTemperature: "warm-neutral studio grade, approximately 4300K",
      exposure: "controlled low-key exposure with protected metallic highlights",
      contrastLevel: "high contrast, dense but detailed shadows, soft highlight roll-off",
      paletteRatio: "70% background/base, 20% primary/support, maximum 10% accent",
    },
    cute: {
      colorTemperature: "clean neutral-warm daylight, approximately 5600K",
      exposure: "bright high-key exposure without clipped pastel highlights",
      contrastLevel: "medium-soft contrast with a clear product silhouette",
      paletteRatio: "70% background/base, 20% primary/support, maximum 10% accent",
    },
    tech: {
      colorTemperature: "cool studio grade, approximately 6500K",
      exposure: "controlled mid-low exposure with crisp edge highlights",
      contrastLevel: "high contrast, deep clean blacks, restrained glow",
      paletteRatio: "70% background/base, 20% primary/support, maximum 10% accent",
    },
    natural: {
      colorTemperature: "warm natural daylight, approximately 5200K",
      exposure: "bright natural mid-key exposure with retained texture",
      contrastLevel: "medium contrast with organic shadow falloff",
      paletteRatio: "70% background/base, 20% primary/support, maximum 10% accent",
    },
    vintage: {
      colorTemperature: "warm tungsten-daylight mix, approximately 4000K",
      exposure: "balanced mid-key exposure with gently muted highlights",
      contrastLevel: "medium contrast with lifted, warm shadow detail",
      paletteRatio: "70% background/base, 20% primary/support, maximum 10% accent",
    },
    sporty: {
      colorTemperature: "neutral-cool daylight, approximately 5600K",
      exposure: "punchy mid-key exposure with protected specular highlights",
      contrastLevel: "high contrast with decisive shadows and crisp separation",
      paletteRatio: "70% background/base, 20% primary/support, maximum 10% accent",
    },
  };

  const fonts: Record<string, { headingStyle: string; bodyStyle: string; headingFont: string; bodyFont: string }> = {
    minimal: { headingStyle: "bold sans-serif", bodyStyle: "clean sans-serif", headingFont: "Helvetica Neue / PingFang SC Bold", bodyFont: "PingFang SC Regular / Source Han Sans" },
    luxury: { headingStyle: "elegant high-contrast serif", bodyStyle: "refined light sans-serif", headingFont: "Didot / Bodoni / Noto Serif SC Bold", bodyFont: "Optima / Noto Serif SC Regular" },
    cute: { headingStyle: "rounded bold sans-serif", bodyStyle: "rounded friendly sans-serif", headingFont: "Varela Round / ZCOOL KuaiLe", bodyFont: "Nunito / PingFang SC Regular" },
    tech: { headingStyle: "geometric bold sans-serif", bodyStyle: "clean tech sans-serif", headingFont: "Eurostile / Orbitron / PingFang SC Bold", bodyFont: "Roboto / PingFang SC Regular" },
    natural: { headingStyle: "friendly soft serif", bodyStyle: "warm organic sans-serif", headingFont: "Georgia / Songti SC Bold", bodyFont: "Lato / PingFang SC Regular" },
    vintage: { headingStyle: "classic serif with slight distress", bodyStyle: "warm serif", headingFont: "Trajan / Noto Serif SC Bold", bodyFont: "Garamond / Noto Serif SC Regular" },
    sporty: { headingStyle: "bold italic sans-serif", bodyStyle: "bold dynamic sans-serif", headingFont: "Impact / Bebas Neue / PingFang SC Bold", bodyFont: "DIN / PingFang SC Regular" },
  };

  return {
    colorPalette: palette,
    typography: fonts[styleKey] ?? fonts.minimal,
    mood: styleKey === "luxury" ? "premium calm" : styleKey === "tech" ? "futuristic clean" : "clean commercial",
    visualSystem: {
      ...(visualSystems[styleKey] ?? visualSystems.minimal),
      ...(toneProfiles[styleKey] ?? toneProfiles.minimal),
    },
  };
}

type AiStyleGuideInput = {
  colorPalette?: { background?: string; primary?: string; secondary?: string; accent?: string; text?: string };
  typography?: { headingStyle?: string; bodyStyle?: string; headingFont?: string; bodyFont?: string };
  mood?: string;
  visualSystem?: Record<string, string>;
};

async function buildProjectStyleGuide(
  projectId: string,
  style: string,
  aiStyleGuide?: AiStyleGuideInput,
) {
  const defaults = buildDefaultStyleGuide(style);
  const baseStyleGuide = aiStyleGuide ?? defaults;
  const suppliedPalette = baseStyleGuide.colorPalette ?? {};

  if (aiStyleGuide) {
    return {
      ...baseStyleGuide,
      colorPalette: { ...defaults.colorPalette, ...suppliedPalette },
      typography: { ...defaults.typography, ...baseStyleGuide.typography },
      visualSystem: { ...defaults.visualSystem, ...baseStyleGuide.visualSystem },
    };
  }

  try {
    const extractedPalette = await extractProjectColorPalette(projectId);
    return {
      ...baseStyleGuide,
      colorPalette: {
        ...defaults.colorPalette,
        ...baseStyleGuide.colorPalette,
        // Extracted colors are more faithful to the real product
        ...(extractedPalette.background ? { background: extractedPalette.background } : {}),
        ...(extractedPalette.primary ? { primary: extractedPalette.primary } : {}),
        ...(extractedPalette.secondary ? { secondary: extractedPalette.secondary } : {}),
        ...(extractedPalette.accent ? { accent: extractedPalette.accent } : {}),
        ...(extractedPalette.text ? { text: extractedPalette.text } : {}),
      },
      typography: {
        ...defaults.typography,
        ...baseStyleGuide.typography,
      },
      visualSystem: {
        ...defaults.visualSystem,
        ...baseStyleGuide.visualSystem,
      },
    };
  } catch (error) {
    console.error("[ColorPalette] Failed to extract from project assets, using base palette:", error);
    return {
      ...baseStyleGuide,
      colorPalette: { ...defaults.colorPalette, ...baseStyleGuide.colorPalette },
      typography: { ...defaults.typography, ...baseStyleGuide.typography },
      visualSystem: { ...defaults.visualSystem, ...baseStyleGuide.visualSystem },
    };
  }
}

const heroFallbackSections: Array<{
  id: string;
  type: SectionTypeKey;
  visualMode?: VisualMode;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  editableFields: Record<string, unknown>;
}> = [
  {
    id: "hero_01",
    type: "hero",
    title: "第一屏主视觉",
    goal: "快速建立商品记忆点，突出第一眼吸引力。",
    copy: "用一张完成度很高的主视觉图，把商品核心价值和气质一次讲清楚。",
    visualPrompt:
      "Primary Prompt: 生成一张 1:1 电商头图主视觉，商品主体清晰突出，使用具有层次的商业布光和干净背景；在真实商品不变形的前提下强化第一眼视觉冲击力，并为精炼中文标题预留清晰安全区。",
    editableFields: {
      tone: "高级质感",
      compositionHint: "居中构图",
    },
  },
  {
    id: "hero_02",
    type: "hero",
    title: "核心卖点头图",
    goal: "用一张强转化头图把最值得买的理由直接讲透。",
    copy: "把商品最强卖点直接做进画面标题和图内短句里，让用户第一时间知道为什么值得买。",
    visualPrompt:
      "Primary Prompt: 生成一张 1:1 核心卖点头图，以真实商品为视觉中心，用明确构图和高对比层次强化最重要的购买理由；预留中文主标题与一条事实卖点的位置，避免信息堆叠和通用棚拍感。",
    editableFields: {
      tone: "转化导向",
      compositionHint: "主体 + 卖点文案同屏",
    },
  },
  {
    id: "hero_03",
    visualMode: "lifestyle_scene",
    type: "hero",
    title: "场景氛围头图",
    goal: "让用户快速代入使用场景和生活方式气质。",
    copy: "通过场景化构图和图内标题文案，让商品与生活方式、使用时刻建立直接关联。",
    visualPrompt:
      "Primary Prompt: 生成一张 1:1 生活方式场景头图，把商品放入明确、可信且具有购买代入感的真实环境；由人物或手部完成一个自然动作，建立前中后景和环境光层次，同时保持商品为主角并预留中文场景标题安全区。",
    editableFields: {
      tone: "氛围感",
      compositionHint: "场景化构图",
      mainTitle: "",
      subTitle: "",
    },
  },
  {
    id: "hero_04",
    type: "hero",
    title: "细节信任头图",
    goal: "用品质、工艺或材质细节建立第一屏信任感。",
    copy: "通过近景细节和简洁文案，让用户第一眼感知品质感、工艺感和完成度。",
    visualPrompt:
      "Primary Prompt: 生成一张 1:1 品质细节头图，以近景或微距视角突出真实材质、纹理、工艺和边缘质感；使用克制但有冲击力的侧光与轮廓光，预留中文品质标题位置，不改变商品结构和包装细节。",
    editableFields: {
      tone: "品质背书",
      compositionHint: "细节近景",
    },
  },
  {
    id: "hero_05",
    type: "hero",
    title: "差异化亮点头图",
    goal: "突出相对竞品或常规选择的差异化优势。",
    copy: "围绕核心差异化特点，用更直接的对比式表达完成最后一张头图收口。",
    visualPrompt:
      "Primary Prompt: 生成一张 1:1 差异化亮点头图，以真实商品和可验证优势为核心，使用清晰的对比式构图突出购买理由；安排中文对比标题与优势短句的阅读层级，避免虚构竞品、参数或夸张徽章。",
    editableFields: {
      tone: "差异化强调",
      compositionHint: "对比式信息布局",
    },
  },
];

const detailFallbackSections: Array<{
  id: string;
  type: SectionTypeKey;
  visualMode?: VisualMode;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  editableFields: Record<string, unknown>;
}> = [
  {
    id: "selling_points_01",
    type: "selling_points",
    title: "核心卖点速览",
    goal: "让用户快速理解最值得购买的理由。",
    copy: "用图内标题、卖点短句和对比式信息，把购买理由在一屏内讲清楚。",
    visualPrompt:
      "Primary Prompt: 生成一张竖版核心卖点详情图，清晰展示真实商品，并用有节奏的空间分区呈现中文卖点标题和事实短句；保持视觉焦点集中、层次明确，避免卡片堆叠和无依据功能标签。",
    editableFields: {
      sellingPoints: [],
      tone: "转化导向",
      compositionHint: "卖点信息分区排版",
    },
  },
  {
    id: "detail_closeup_01",
    type: "detail_closeup",
    title: "细节特写",
    goal: "强化材质、工艺与真实质感。",
    copy: "通过近景放大，把材质、边缘和工艺细节讲透。",
    visualPrompt:
      "Primary Prompt: 生成一张竖版细节特写详情图，以微距视角突出商品真实纹理、边缘、表面光泽和做工；使用方向明确的质感光线与浅景深，并为中文短标题和工艺说明保留不遮挡主体的安全区。",
    editableFields: {
      tone: "细节说明",
      compositionHint: "近景微距",
    },
  },
  {
    id: "scenario_01",
    visualMode: "lifestyle_scene",
    type: "scenario",
    title: "场景使用展示",
    goal: "让用户更容易代入真实使用场景。",
    copy: "把商品放进真实场景里，提升想象空间和购买欲望。",
    visualPrompt:
      "Primary Prompt: 生成一张竖版生活方式场景详情图，在明确真实环境中展示人物或手部自然使用商品的瞬间；建立前景、中景和背景层次，保持商品为主角，并为中文场景标题和使用价值说明预留真实负空间。",
    editableFields: {
      tone: "生活方式",
      compositionHint: "场景化展示",
      mainTitle: "",
      subTitle: "",
    },
  },
  {
    id: "specs_01",
    type: "specs",
    title: "规格信息说明",
    goal: "把参数、尺寸和适配信息讲清楚。",
    copy: "通过结构化图文版式，让规格信息一眼看懂。",
    visualPrompt:
      "Primary Prompt: 生成一张竖版规格参数详情图，真实商品与尺寸线、规格表和中文说明形成清晰的信息层级；保证移动端可读性和留白，所有尺寸与数值必须来自已提供资料，禁止补写或猜测。",
    editableFields: {
      tone: "专业说明",
      compositionHint: "参数表格式",
    },
  },
  {
    id: "material_01",
    type: "material",
    title: "材质工艺说明",
    goal: "补充专业感与品质背书。",
    copy: "把用户不容易从外观看懂的材质和工艺价值解释清楚。",
    visualPrompt:
      "Primary Prompt: 生成一张竖版材质工艺详情图，通过真实纹理特写、结构关系和光泽变化呈现品质细节；构图具有专业说明感，并为中文短标题和事实价值说明安排清晰阅读顺序，不虚构材料或工艺。",
    editableFields: {
      tone: "专业背书",
      compositionHint: "结构与纹理并重",
    },
  },
  {
    id: "comparison_01",
    type: "comparison",
    title: "差异化对比",
    goal: "清楚说明为什么值得选这款商品。",
    copy: "用优势对比和价值提炼，帮助用户更快完成决策。",
    visualPrompt:
      "Primary Prompt: 生成一张竖版差异化对比详情图，以真实商品和已验证事实为依据，通过左右或上下关系清晰呈现优势差异；设计中文对比标题与信息层级，不虚构竞品形象、数据或结论。",
    editableFields: {
      tone: "价值对比",
      compositionHint: "左右或上下对比版式",
    },
  },
  {
    id: "brand_trust_01",
    type: "brand_trust",
    title: "品牌与信任背书",
    goal: "提升品牌感和成交信任感。",
    copy: "通过品牌理念、工艺标准或服务承诺，增加下单安心感。",
    visualPrompt:
      "Primary Prompt: 生成一张竖版品牌信任详情图，以真实商品、包装或品牌资料为视觉依据，使用克制专业的构图呈现中文品牌理念、工艺标准或服务说明；保持内容可信，不虚构认证、奖项和承诺。",
    editableFields: {
      tone: "信任建立",
      compositionHint: "品牌叙事排版",
    },
  },
  {
    id: "summary_01",
    type: "summary",
    title: "购买理由总结",
    goal: "形成最后一轮转化推动。",
    copy: "通过总结式收口，帮助用户更快完成购买决策。",
    visualPrompt:
      "Primary Prompt: 生成一张竖版购买理由总结图，以真实商品作为稳定视觉中心，集中呈现中文总结标题和最关键的事实购买理由；画面有明确收束感与高级留白，行动引导克制，不使用按钮式 CTA。",
    editableFields: {
      tone: "收口转化",
      compositionHint: "稳定收束",
    },
  },
];

const sectionTypeMap: Record<string, string> = {
  hero: "HERO",
  pain_point: "SCENARIO",
  selling_points: "SELLING_POINTS",
  scenario: "SCENARIO",
  detail_closeup: "DETAIL_CLOSEUP",
  specs: "SPECS",
  material: "MATERIAL",
  comparison: "COMPARISON",
  gift_scene: "GIFT_SCENE",
  brand_trust: "BRAND_TRUST",
  packaging: "PACKAGING",
  ingredients_table: "INGREDIENTS_TABLE",
  white_bg_product: "WHITE_BG_PRODUCT",
  summary: "SUMMARY",
  formula: "SELLING_POINTS",
  origin: "MATERIAL",
  nutrition: "INGREDIENTS_TABLE",
  ingredients: "INGREDIENTS_TABLE",
  white_bg: "WHITE_BG_PRODUCT",
  audience: "BRAND_TRUST",
  conversion: "SUMMARY",
  custom: "CUSTOM",
};

function normalizeSectionType(type: string) {
  const normalized = type.trim().toLowerCase();
  return sectionTypeMap[normalized] ?? "CUSTOM";
}

function ensureChinesePrimaryPrompt(prompt: string, sectionTitle: string) {
  const trimmed = prompt.trim();
  const primaryOnly = trimmed
    .split(/\n\s*(?:English Prompt|英文提示)\s*[:：]/i)[0]
    .replace(/^\s*(?:Primary Prompt|中文提示|中文 Prompt)\s*[:：]\s*/i, "")
    .trim();
  const chineseCharacterCount = primaryOnly.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinWordCount = primaryOnly.match(/[A-Za-z][A-Za-z-]*/g)?.length ?? 0;
  const isChineseDominant =
    chineseCharacterCount >= 12 && latinWordCount <= Math.max(8, Math.floor(chineseCharacterCount / 3));
  const primaryPrompt = isChineseDominant
    ? primaryOnly
    : `为“${sectionTitle}”生成一张高完成度电商视觉图。突出真实商品主体、核心购买理由和清晰层次，明确光线方向、镜头角度、前中后景、色彩关系与中文标题安全区；画面适合移动端浏览，避免通用棚拍、空洞装饰和遮挡商品。`;

  return `Primary Prompt: ${primaryPrompt}`;
}

function resolveVisualMode(
  sectionType: string,
  explicitMode: unknown,
  sceneContext: string,
): VisualMode {
  if (["poster", "lifestyle_scene", "studio", "macro", "data"].includes(String(explicitMode))) {
    return explicitMode as VisualMode;
  }

  if (["SCENARIO", "GIFT_SCENE", "ORIGIN", "AUDIENCE"].includes(sectionType)) {
    return "lifestyle_scene";
  }

  if (sectionType === "HERO" && /(场景|生活方式|使用情境|lifestyle|usage scene|use scene|in-context)/i.test(sceneContext)) {
    return "lifestyle_scene";
  }

  if (["DETAIL_CLOSEUP", "MATERIAL"].includes(sectionType)) {
    return "macro";
  }
  if (["SPECS", "INGREDIENTS_TABLE", "COMPARISON"].includes(sectionType)) {
    return "data";
  }
  if (["PACKAGING", "WHITE_BG_PRODUCT"].includes(sectionType)) {
    return "studio";
  }

  return "poster";
}

function normalizeTitleDesign(
  sectionType: string,
  visualMode: VisualMode,
  rawValue: unknown,
): TitleDesign {
  const raw = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue as Record<string, unknown>
    : {};
  const isLifestyleScene = visualMode === "lifestyle_scene";
  const isDataSection = visualMode === "data" || ["SPECS", "INGREDIENTS_TABLE", "COMPARISON"].includes(sectionType);
  const layouts = ["editorial_left", "editorial_center", "split_level", "minimal_caption"];
  const alignments = ["left", "center", "right"];
  const placements = ["top", "upper_left", "side"];
  const panelStyles = ["none", "soft_band", "label_strip"];

  const defaultLayout = isLifestyleScene ? "minimal_caption" : isDataSection ? "split_level" : "editorial_left";
  const layout = layouts.includes(String(raw.layout)) ? String(raw.layout) : defaultLayout;
  const alignment = alignments.includes(String(raw.alignment)) ? String(raw.alignment) : "left";
  const placement = placements.includes(String(raw.placement)) ? String(raw.placement) : "upper_left";
  const requestedPanelStyle = panelStyles.includes(String(raw.panelStyle)) ? String(raw.panelStyle) : "none";
  const requestedMaxLines = Number(raw.maxLines ?? (isLifestyleScene ? 1 : 2));

  return {
    layout: layout as TitleDesign["layout"],
    alignment: alignment as TitleDesign["alignment"],
    placement: placement as TitleDesign["placement"],
    emphasis: typeof raw.emphasis === "string" ? raw.emphasis.trim() : "",
    lineBreakAfter: typeof raw.lineBreakAfter === "string" ? raw.lineBreakAfter.trim() : "",
    maxLines: Number.isFinite(requestedMaxLines)
      ? Math.min(3, Math.max(1, Math.round(requestedMaxLines)))
      : isLifestyleScene
        ? 1
        : 2,
    panelStyle: (isLifestyleScene || !isDataSection ? "none" : requestedPanelStyle) as TitleDesign["panelStyle"],
  };
}

function ensureVisualModePrompt(
  sectionType: string,
  visualMode: VisualMode,
  prompt: string,
  sectionTitle: string,
) {
  const normalized = ensureChinesePrimaryPrompt(prompt, sectionTitle);
  if (visualMode !== "lifestyle_scene") {
    return normalized;
  }

  return [
    normalized,
    "生活场景要求：在明确的真实环境中呈现一个可拍摄的生活瞬间，由人物或手部与商品完成一个可信动作；建立前景、中景、背景层次，使用自然透视、接触阴影和环境光。为一条简洁的消费者利益标题及可选事实说明保留真实负空间。不要使用居中棚拍包装、纯色平面背景、夸张数字、徽章、CTA 按钮或不透明信息卡。",
  ].join("\n");
}

function normalizeEditableFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readEditableString(editableFields: Record<string, unknown>, key: string) {
  const value = editableFields[key];
  return typeof value === "string" ? value.trim() : "";
}

function cleanHeadlineCandidate(value: string) {
  return value
    .replace(/^(?:主标题|标题|headline|副标题|subline|卖点)\s*[：:]\s*/i, "")
    .replace(/^[\s\-•·]+/, "")
    .trim();
}

function isDisclaimerHeadline(value: string) {
  return /(以.*为准|详见包装|包装(?:标示|标注)(?:信息)?为准|仅供参考|具体信息(?:以.*为准|详见.*))/i.test(value);
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function resolvePlanningAnalysis(normalizedResult: unknown, rawResult: unknown): Record<string, unknown> {
  const normalized = readJsonRecord(normalizedResult);
  const rawContainer = readJsonRecord(rawResult);
  const legacyStructured = {
    ...readJsonRecord(rawContainer.data),
    ...readJsonRecord(rawContainer.parsed),
    ...readJsonRecord(rawContainer.raw),
  };
  return {
    ...rawContainer,
    ...legacyStructured,
    ...normalized,
  };
}

function selectPlannedMainTitle(
  section: RawPlannedSection,
  editableFields: Record<string, unknown>,
  type: string,
  factClaims: string[],
  usedHeadlineKeys: Set<string>,
) {
  const copyCandidates = section.copy
    .split(/[\n；;|]/)
    .map(cleanHeadlineCandidate)
    .filter(Boolean);
  const explicit = section.mainTitle?.trim() || readEditableString(editableFields, "mainTitle");
  const candidates = [...copyCandidates, explicit, cleanHeadlineCandidate(section.title)].filter(Boolean);
  const selected = candidates.find((candidate) => {
    const headlineKey = normalizeFactValue(candidate);
    const numbers = candidate.match(/\d+(?:\.\d+)?%?/g) ?? [];
    const numbersAreSupported = numbers.every((number) => factClaims.some((fact) => fact.includes(number)));
    return (
    [...candidate].length >= (type === "HERO" ? 4 : 2) &&
    [...candidate].length <= 18 &&
    !isDisclaimerHeadline(candidate) &&
    !isGenericCommerceHeadline(candidate) &&
    numbersAreSupported &&
    !usedHeadlineKeys.has(headlineKey)
    );
  }) ?? "";
  if (selected) usedHeadlineKeys.add(normalizeFactValue(selected));
  return selected;
}

function selectPlannedSubTitle(
  section: RawPlannedSection,
  editableFields: Record<string, unknown>,
  mainTitle: string,
  factClaims: string[],
) {
  const explicit = section.subTitle?.trim() || readEditableString(editableFields, "subTitle");
  const copyCandidates = section.copy
    .split(/[\n；;|]/)
    .map(cleanHeadlineCandidate)
    .filter(Boolean);
  const candidates = [explicit, ...copyCandidates].filter(Boolean);
  return candidates.find((candidate) => {
    const numbers = candidate.match(/\d+(?:\.\d+)?%?/g) ?? [];
    return candidate !== mainTitle &&
      [...candidate].length <= 32 &&
      !isDisclaimerHeadline(candidate) &&
      !isRedundantVisibleCopy(candidate, mainTitle) &&
      numbers.every((number) => factClaims.some((fact) => fact.includes(number)));
  }) ?? "";
}

function readPlanningFactClaims(analysis: Record<string, unknown>): string[] {
  const factClaims = Array.isArray(analysis.factClaims) ? analysis.factClaims : [];
  const verifiedClaims = factClaims.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const claim = item as Record<string, unknown>;
    if (claim.source === "analysis_inference" || claim.confidence !== "high" || claim.eligibleForMarketing !== true) {
      return [];
    }
    return typeof claim.claim === "string" && claim.claim.trim() ? [claim.claim.trim()] : [];
  });
  const specs = Array.isArray(analysis.specs)
    ? analysis.specs.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const spec = item as Record<string, unknown>;
        return typeof spec.label === "string" && typeof spec.value === "string"
          ? [`${spec.label}：${spec.value}`]
          : [];
      })
    : [];
  const ingredients = Array.isArray(analysis.ingredients) && analysis.ingredients.length > 0
    ? [`配料：${analysis.ingredients.filter((item): item is string => typeof item === "string").join("、")}`]
    : [];
  const nutrition = analysis.nutritionFacts && typeof analysis.nutritionFacts === "object"
    ? Object.entries(analysis.nutritionFacts as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1]))
        .map(([label, value]) => `${label}：${value}`)
    : [];
  return Array.from(new Set([...verifiedClaims, ...specs, ...ingredients, ...nutrition]));
}

function normalizeFactValue(value: string) {
  return value.replace(/[\s，。！？、,!?：:；;（）()\[\]\-—_]/g, "").toLowerCase();
}

function factValuesOverlap(left: string, right: string) {
  const normalizedLeft = normalizeFactValue(left);
  const normalizedRight = normalizeFactValue(right);
  return Boolean(normalizedLeft && normalizedRight) && (
    normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
  );
}

function isRedundantVisibleCopy(value: string, lockedValue: string) {
  const normalized = normalizeFactValue(value);
  const normalizedLocked = normalizeFactValue(lockedValue);
  if (!normalized || !normalizedLocked) return false;
  if (normalized === normalizedLocked || normalizedLocked.includes(normalized)) return true;
  return normalized.includes(normalizedLocked) && normalized.length - normalizedLocked.length <= 4;
}

function resolveVerifiedCopyClaim(section: RawPlannedSection, visibleCopy: string, factClaims: string[]) {
  const requested = section.singleClaim?.trim() ?? "";
  if (requested && factClaims.some((fact) => factValuesOverlap(fact, requested))) {
    return factClaims.find((fact) => factValuesOverlap(fact, requested)) ?? requested;
  }
  return factClaims.find((fact) => factValuesOverlap(visibleCopy, fact)) ?? "";
}

function normalizeSupportingPoints(
  section: RawPlannedSection,
  mainTitle: string,
  subTitle: string,
  factClaims: string[],
) {
  const candidates = Array.isArray(section.supportingPoints) && section.supportingPoints.length > 0
    ? section.supportingPoints
    : section.copy.split(/[\n；;|]/);
  const hasSupportedNumbers = (value: string) => {
    const numbers = value.match(/\d+(?:\.\d+)?%?/g) ?? [];
    return numbers.length === 0 || numbers.every((number) => factClaims.some((fact) => fact.includes(number)));
  };
  return Array.from(new Set(candidates
    .map(cleanHeadlineCandidate)
    .filter((value) => value && !isDisclaimerHeadline(value))
    .filter((value) => !isRedundantVisibleCopy(value, mainTitle) && !isRedundantVisibleCopy(value, subTitle))
    .filter(hasSupportedNumbers)))
    .slice(0, 3);
}

function alignTitleDesignWithHeadline(design: TitleDesign, headline: string): TitleDesign {
  return {
    ...design,
    emphasis:
      design.emphasis &&
      [...design.emphasis].length >= 2 &&
      [...design.emphasis].length <= 6 &&
      headline.includes(design.emphasis)
        ? design.emphasis
        : "",
    lineBreakAfter:
      design.lineBreakAfter &&
      headline.includes(design.lineBreakAfter) &&
      !headline.endsWith(design.lineBreakAfter)
        ? design.lineBreakAfter
        : "",
  };
}

function readPreviewConfig(snapshot: unknown): PreviewConfigInput {
  const raw = ((snapshot as Record<string, unknown> | null) ?? {}).previewConfig;
  const rawOptional = (raw as Record<string, unknown> | null)?.optionalSections;
  return previewConfigSchema.parse({
    heroImageCount: Number((raw as Record<string, unknown> | null)?.heroImageCount ?? 5),
    detailSectionCount: Number((raw as Record<string, unknown> | null)?.detailSectionCount ?? 8),
    imageAspectRatio: ((raw as Record<string, unknown> | null)?.imageAspectRatio ?? "9:16") as "3:4" | "9:16",
    contentLanguage: normalizeContentLanguage((raw as Record<string, unknown> | null)?.contentLanguage),
    optionalSections: Array.isArray(rawOptional) ? rawOptional : [],
  });
}

function readPreviewMeta(snapshot: unknown) {
  const raw = ((snapshot as Record<string, unknown> | null) ?? {}).previewConfig as Record<string, unknown> | null;
  return {
    imageAspectRatio: raw?.imageAspectRatio === "3:4" ? "3:4" : "9:16",
    contentLanguage: normalizeContentLanguage(raw?.contentLanguage),
  } as const;
}

function isOptionalDetailSection(section: { type: string; sectionKey: string }) {
  return section.type !== "HERO" && section.sectionKey.startsWith("detail_optional_");
}

async function normalizeProjectSections(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          type: true,
          sectionKey: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  let heroCursor = 0;
  let detailCursor = 0;

  await prisma.$transaction(
    project.sections.map((section, index) => {
      const isHero = section.type === "HERO";
      const isOptionalDetail = isOptionalDetailSection(section);

      if (isHero) {
        heroCursor += 1;
      } else if (!isOptionalDetail) {
        detailCursor += 1;
      }

      // Preserve variant/group/optional suffixes so multi-spec and optional
      // module identities are not lost when reordering or editing.
      let nextKey = section.sectionKey;
      if (!isOptionalDetail) {
        if (isHero) {
          const suffix = section.sectionKey.replace(/^hero_\d+/, "");
          nextKey = `hero_${String(heroCursor).padStart(2, "0")}${suffix}`;
        } else {
          const suffix = section.sectionKey.replace(/^detail_\d+_[a-z0-9_]+/, "");
          nextKey = `detail_${String(detailCursor).padStart(2, "0")}_${section.type.toLowerCase()}${suffix}`;
        }
      }

      return prisma.pageSection.update({
        where: { id: section.id },
        data: {
          order: index,
          sectionKey: nextKey,
        },
      });
    }),
  );

  const currentSnapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
  const currentPreviewMeta = readPreviewMeta(project.modelSnapshot);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      modelSnapshot: {
        ...currentSnapshot,
        previewConfig: {
          ...(currentSnapshot.previewConfig as Record<string, unknown> | null),
          heroImageCount: heroCursor,
          detailSectionCount: detailCursor,
          imageAspectRatio: currentPreviewMeta.imageAspectRatio,
          contentLanguage: currentPreviewMeta.contentLanguage,
        },
      } as Prisma.InputJsonValue,
    },
  });
}

async function assertSectionMutationAllowed(projectId: string, options: { addingType?: string; deletingSectionId?: string; updatingSectionId?: string; nextType?: string }) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          type: true,
          sectionKey: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  let heroCount = project.sections.filter((section) => section.type === "HERO").length;
  // Optional 1:1 modules are not counted toward the core detail section limits.
  let detailCount = project.sections.filter((section) => section.type !== "HERO" && !isOptionalDetailSection(section)).length;

  if (options.addingType) {
    if (normalizeSectionType(options.addingType) === "HERO") {
      if (heroCount >= 5) {
        throw new Error("头图最多保留 5 张，请先删除或改成详情页后再新增。");
      }
      heroCount += 1;
    } else {
      if (detailCount >= 10) {
        throw new Error("详情页最多保留 10 张，请先删除或改成头图后再新增。");
      }
      detailCount += 1;
    }
  }

  if (options.deletingSectionId) {
    const target = project.sections.find((section) => section.id === options.deletingSectionId);
    if (!target) {
      throw new Error("Section not found.");
    }

    if (target.type === "HERO") {
      if (heroCount <= 3) {
        throw new Error("头图至少保留 3 张，不能继续删除。");
      }
      heroCount -= 1;
    } else if (!isOptionalDetailSection(target)) {
      if (detailCount <= 4) {
        throw new Error("详情页至少保留 4 张，不能继续删除。");
      }
      detailCount -= 1;
    }
  }

  if (options.updatingSectionId && options.nextType) {
    const target = project.sections.find((section) => section.id === options.updatingSectionId);
    if (!target) {
      throw new Error("Section not found.");
    }

    const currentType = target.type;
    const nextType = normalizeSectionType(options.nextType);
    const targetIsOptionalDetail = currentType !== "HERO" && isOptionalDetailSection(target);

    if (currentType !== nextType) {
      if (currentType === "HERO" && nextType !== "HERO") {
        if (heroCount <= 3) {
          throw new Error("头图至少保留 3 张，不能把当前头图改成详情页。");
        }
        if (detailCount >= 10) {
          throw new Error("详情页最多保留 10 张，请先删除多余详情页后再转换。");
        }
      }

      if (currentType !== "HERO" && nextType === "HERO") {
        // Converting an optional detail to hero does not reduce core detail count.
        if (!targetIsOptionalDetail && detailCount <= 4) {
          throw new Error("详情页至少保留 4 张，不能把当前详情页改成头图。");
        }
        if (heroCount >= 5) {
          throw new Error("头图最多保留 5 张，请先删除多余头图后再转换。");
        }
      }
    }
  }
}

function buildPreviewDecisionPrompt(analysis: Record<string, unknown>, contentLanguage: ContentLanguage) {
  const context = {
    productName: analysis.productName,
    category: analysis.category,
    subcategory: analysis.subcategory,
    styleTags: Array.isArray(analysis.styleTags) ? analysis.styleTags.slice(0, 6) : [],
    usageScenarios: Array.isArray(analysis.usageScenarios) ? analysis.usageScenarios.slice(0, 6) : [],
    coreSellingPoints: Array.isArray(analysis.coreSellingPoints) ? analysis.coreSellingPoints.slice(0, 8) : [],
    differentiationPoints: Array.isArray(analysis.differentiationPoints)
      ? analysis.differentiationPoints.slice(0, 6)
      : [],
    suggestedSectionPlan: Array.isArray(analysis.suggestedSectionPlan) ? analysis.suggestedSectionPlan.slice(0, 8) : [],
  };

  return [
    "You are a senior e-commerce creative strategist deciding the right image count plan for a product detail page.",
    "Return strict JSON only.",
    "heroImageCount must be an integer between 3 and 5.",
    "detailSectionCount must be an integer between 4 and 10.",
    `The target content language for the final page is ${contentLanguage}.`,
    "Hero images should be enough to cover distinct first-screen communication angles such as hero visual, selling point emphasis, scenario mood, trust, or differentiation.",
    "Detail sections should be enough to fully explain selling points, craftsmanship, specs, trust, and use cases without becoming repetitive.",
    "For a product with enough distinct evidence, prefer 5 hero images and 8 detail sections. Use 9-10 detail sections only when each extra section has a unique verified fact or shopper objection.",
    "If the product is simple or verified evidence is exhausted, reduce quantity. Never increase quantity by repeating the same number, ingredient, specification, claim, or summary in another module.",
    "",
    "Product context:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function resolveDefaultIncludePackaging(type: string): boolean {
  const normalized = type.trim().toUpperCase();
  return normalized === "PACKAGING" || normalized === "GIFT_SCENE";
}

const PACKAGING_VISUAL_CUES =
  /包装|包装袋|枕式包装|包装正面|包装标签|包材|袋装|盒装|瓶身标签|净含量|条形码|包装识别|包装组合/;

function resolvePlannedIncludePackaging(type: string, ...contextParts: Array<string | undefined>): boolean {
  if (resolveDefaultIncludePackaging(type)) return true;
  return PACKAGING_VISUAL_CUES.test(contextParts.filter(Boolean).join(" "));
}

function compactFallbackProductAnchor(productName: string) {
  const normalized = productName
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s*\d+(?:\.\d+)?\s*(?:克|g|kg|毫升|ml|只|袋|盒|瓶|包|件|个)?(?:\s*[/／]\s*\S+)?/gi, "")
    .replace(/[，,：:。；;].*$/g, "")
    .trim();
  if (!normalized) return "商品";
  return normalized.length <= 10 ? normalized : normalized.slice(-10);
}

function buildFallbackHeadline(productName: string, factClaims: string[], index: number, hero: boolean) {
  const anchor = compactFallbackProductAnchor(productName);
  const fact = factClaims
    .filter((claim) => !isDisclaimerHeadline(claim))
    .map((claim) => claim.replace(/^(?:核心卖点|差异点|规格|配料|成分)\s*[：:]/, "").trim())
    .find((claim) => [...claim].length >= 4 && [...claim].length <= 16);
  const factHook = fact ? cleanHeadlineCandidate(fact).slice(0, 12) : "";
  const heroHooks = [
    `${anchor}一口鲜香`,
    `${anchor}上桌就想吃`,
    `${anchor}看得见的好料`,
    `${anchor}这一口有记忆`,
    `${anchor}选它有理由`,
  ];
  const detailHooks = [
    `${anchor}的好吃细节`,
    `${anchor}真实配料`,
    `${anchor}口感看得见`,
    `${anchor}规格说清楚`,
    `${anchor}放心看细节`,
  ];
  return factHook || (hero ? heroHooks[index % heroHooks.length] : detailHooks[index % detailHooks.length]);
}

function buildFallbackDetail(index: number, productName = "", factClaims: string[] = []) {
  const template = detailFallbackSections[index % detailFallbackSections.length];
  const type = normalizeSectionType(template.type);
  const mainTitle = buildFallbackHeadline(productName, factClaims, index, false);
  const copy = [mainTitle, template.copy].filter(Boolean).join("\n");
  const visualMode = resolveVisualMode(
    type,
    template.visualMode,
    `${template.title} ${template.goal} ${template.visualPrompt}`,
  );
  const titleDesign = normalizeTitleDesign(type, visualMode, template.editableFields.titleDesign);
  const controls = { includePackaging: resolveDefaultIncludePackaging(type) };
  return {
    sectionKey: "",
    order: 0,
    type,
    title: template.title,
    goal: template.goal,
    copy,
    visualPrompt: ensureVisualModePrompt(type, visualMode, template.visualPrompt, template.title),
    controls,
    variantScope: "base" as const,
    variantId: undefined,
    variantIds: undefined,
    groupLayout: undefined,
    editableData: {
      ...template.editableFields,
      controls,
      variantScope: "base" as const,
      variantId: undefined,
      variantIds: undefined,
      groupLayout: undefined,
      headlineAngle: undefined,
      mainTitle,
      subTitle: readEditableString(template.editableFields, "subTitle"),
      supportingPoints: [],
      selectedTitleCandidate: null,
      primaryEvidenceKey: "",
      complianceNote: readEditableString(template.editableFields, "complianceNote"),
      layout: "",
      visualDescription: "",
      negativePrompt: "",
      visualMode,
      titleDesign,
      colorScheme: null,
      whitespaceRatio: 35,
      commerceBrief: defaultCommerceBrief(type),
      planningOrigin: "template_fill",
    },
    planningOrigin: "template_fill" as const,
  };
}

function buildFallbackHero(index: number, productName = "", factClaims: string[] = []) {
  const template = heroFallbackSections[index % heroFallbackSections.length];
  const visualMode = resolveVisualMode(
    "HERO",
    template.visualMode,
    `${template.title} ${template.goal} ${template.visualPrompt}`,
  );
  const mainTitle = buildFallbackHeadline(productName, factClaims, index, true);
  const titleDesign = alignTitleDesignWithHeadline(
    normalizeTitleDesign("HERO", visualMode, template.editableFields.titleDesign),
    mainTitle,
  );
  const controls = { includePackaging: false };
  return {
    sectionKey: "",
    order: 0,
    type: "HERO",
    title: template.title,
    goal: template.goal,
    copy: [mainTitle, template.copy].filter(Boolean).join("\n"),
    visualPrompt: ensureVisualModePrompt("HERO", visualMode, template.visualPrompt, template.title),
    controls,
    variantScope: "base" as const,
    variantId: undefined,
    variantIds: undefined,
    groupLayout: undefined,
    editableData: {
      ...template.editableFields,
      controls,
      variantScope: "base" as const,
      variantId: undefined,
      variantIds: undefined,
      groupLayout: undefined,
      headlineAngle: resolveHeroAngle(undefined, index),
      mainTitle,
      subTitle: readEditableString(template.editableFields, "subTitle"),
      supportingPoints: [],
      selectedTitleCandidate: null,
      primaryEvidenceKey: "",
      complianceNote: readEditableString(template.editableFields, "complianceNote"),
      layout: "",
      visualDescription: "",
      negativePrompt: "",
      visualMode,
      titleDesign,
      colorScheme: null,
      whitespaceRatio: 35,
      commerceBrief: defaultCommerceBrief("HERO"),
      planningOrigin: "template_fill",
    },
    planningOrigin: "template_fill" as const,
  };
}

function resolveDefaultGroupLayout(sectionType: string): "row" | "triangle" | "scene" {
  if (sectionType === "SCENARIO") return "scene";
  return "row";
}

function resolveSectionVariantScope(
  section: RawPlannedSection,
  variants: { id: string; name: string }[],
): {
  variantScope: "base" | "variant" | "group";
  variantId?: string;
  variantIds?: string[];
  groupLayout?: "row" | "triangle" | "scene";
} {
  const rawScope = (section as Record<string, unknown>).scope as string | undefined;
  const rawVariantName = (section as Record<string, unknown>).variantName as string | undefined;
  const rawVariantNames = (section as Record<string, unknown>).variantNames as string[] | undefined;
  const rawGroupLayout = (section as Record<string, unknown>).groupLayout as "row" | "triangle" | "scene" | undefined;

  if (rawScope === "variant" || rawVariantName) {
    const name = rawVariantName || variants.find((v) => section.title.includes(v.name))?.name;
    const matched = variants.find((v) => v.name === name);
    if (matched) {
      return { variantScope: "variant", variantId: matched.id };
    }
  }

  if (rawScope === "group" || rawVariantNames || section.type === "COMPARISON" || section.type === "SPECS") {
    const names = rawVariantNames ?? variants.map((v) => v.name);
    const ids = names
      .map((name) => variants.find((v) => v.name === name)?.id)
      .filter((id): id is string => Boolean(id));
    return {
      variantScope: "group",
      variantIds: ids.length > 0 ? ids : variants.map((v) => v.id),
      groupLayout: rawGroupLayout || resolveDefaultGroupLayout(section.type),
    };
  }

  return { variantScope: "base" };
}

function buildNormalizedSections(
  rawSections: RawPlannedSection[],
  heroImageCount: number,
  detailSectionCount: number,
  variants: { id: string; name: string }[] = [],
  factClaims: string[] = [],
  productName = "",
): NormalizedSection[] {
  const isMulti = variants.length > 0;
  let heroAngleIndex = 0;
  const usedHeadlineKeys = new Set<string>();
  const normalizedAll: NormalizedSection[] = rawSections.map((section, index) => {
    const editableFields = normalizeEditableFields(section.editableFields);
    const type = normalizeSectionType(section.type);
    const headlineAngle = type === "HERO"
      ? resolveHeroAngle(section.headlineAngle ?? editableFields.headlineAngle, heroAngleIndex++)
      : undefined;
    const mainTitle = selectPlannedMainTitle(section, editableFields, type, factClaims, usedHeadlineKeys);
    const rawSubTitle = section.subTitle?.trim() || readEditableString(editableFields, "subTitle");
    const subTitle = selectPlannedSubTitle(section, editableFields, mainTitle, factClaims);
    const rawMainTitle = section.mainTitle?.trim() || readEditableString(editableFields, "mainTitle");
    const explicitComplianceNote = section.complianceNote?.trim() || readEditableString(editableFields, "complianceNote");
    const complianceNote = [explicitComplianceNote, rawSubTitle, rawMainTitle]
      .find((candidate): candidate is string => Boolean(candidate) && isDisclaimerHeadline(candidate!)) ?? "";
    const normalizedCommerceBrief = normalizeCommerceBrief(section, type);
    const visualMode = resolveVisualMode(
      type,
      section.visualMode,
      `${section.title} ${section.goal} ${section.visualPrompt}`,
    );
    const requestedTitleDesign = (section.titleDesign ?? editableFields.titleDesign ?? {}) as Record<string, unknown>;
    const titleDesign = alignTitleDesignWithHeadline(
      normalizeTitleDesign(
        type,
        visualMode,
        {
          ...requestedTitleDesign,
          emphasis: requestedTitleDesign.emphasis,
          lineBreakAfter: requestedTitleDesign.lineBreakAfter,
        },
      ),
      mainTitle,
    );
    const scope = isMulti ? resolveSectionVariantScope(section, variants) : { variantScope: "base" as const };
    const normalizedVisualPrompt = ensureVisualModePrompt(
      type,
      visualMode,
      section.visualPrompt || "",
      section.title || `模块 ${index + 1}`,
    );
    const supportingPoints = normalizeSupportingPoints(section, mainTitle, subTitle, factClaims);
    const compactCopy = section.copy.trim() || [mainTitle, subTitle, ...supportingPoints].filter(Boolean).join("\n");
    const verifiedCopyClaim = resolveVerifiedCopyClaim(section, compactCopy, factClaims);
    const commerceBrief = {
      ...normalizedCommerceBrief,
      singleClaim: verifiedCopyClaim,
      claimSource: verifiedCopyClaim,
    };
    const includePackaging = resolvePlannedIncludePackaging(
      type,
      section.title,
      section.goal,
      normalizedVisualPrompt,
      commerceBrief.proofDevice,
    );
    const baseSection: SectionCopyInput = {
      type,
      title: section.title || `模块 ${index + 1}`,
      goal: section.goal || "突出商品卖点",
      copy: compactCopy,
      visualPrompt: normalizedVisualPrompt,
      variantScope: scope.variantScope,
      variantId: scope.variantId,
      variantIds: scope.variantIds,
    };
    return {
      sectionKey: "",
      order: index,
      ...baseSection,
      controls: { includePackaging },
      groupLayout: scope.groupLayout,
      editableData: {
        ...editableFields,
        controls: { includePackaging },
        variantScope: scope.variantScope,
        variantId: scope.variantId,
        variantIds: scope.variantIds,
        groupLayout: scope.groupLayout,
        headlineAngle,
        mainTitle,
        subTitle,
        supportingPoints,
        selectedTitleCandidate: null,
        primaryEvidenceKey: verifiedCopyClaim,
        complianceNote,
        layout: (section as Record<string, unknown>).layout || "",
        visualDescription: (section as Record<string, unknown>).visualDescription || "",
        negativePrompt: (section as Record<string, unknown>).negativePrompt || "",
        visualMode,
        titleDesign,
        colorScheme: (section as Record<string, unknown>).colorScheme || null,
        whitespaceRatio: (section as Record<string, unknown>).whitespaceRatio || 35,
        commerceBrief,
        planningOrigin: "ai",
      },
      planningOrigin: "ai" as const,
    };
  });

  // Keep every structurally usable AI item. A missing or generic headline is
  // repaired by the local copy normalizer; dropping the whole item here made
  // Kimi's otherwise useful partial response look like a template-only plan.
  const normalized = rawSections.length > 0
    ? normalizedAll.filter((_, index) => {
        const raw = rawSections[index];
        return Boolean(raw && [raw.title, raw.goal, raw.copy, raw.visualPrompt].some((value) => typeof value === "string" && value.trim()));
      })
    : normalizedAll;

  // The count is an explicit user-facing delivery requirement. Preserve every valid
  // AI section, then deterministically fill only a malformed or missing slot so a
  // planner response can never silently shrink the requested page structure.
  let finalHeroes = normalized.filter((section) => section.type === "HERO").slice(0, heroImageCount);
  while (finalHeroes.length < heroImageCount) {
    const fallback = buildFallbackHero(finalHeroes.length, productName, factClaims);
    finalHeroes.push(fallback);
  }

  const plannedDetails = normalized.filter((section) => section.type !== "HERO").slice(0, detailSectionCount);
  const closingDetails = plannedDetails.filter((section) => ["SUMMARY", "CONVERSION"].includes(section.type));
  let finalDetails = [
    ...plannedDetails.filter((section) => !["SUMMARY", "CONVERSION"].includes(section.type)),
    ...closingDetails,
  ];
  while (finalDetails.length < detailSectionCount) {
    const fallback = buildFallbackDetail(finalDetails.length, productName, factClaims);
    finalDetails.push(fallback);
  }

  return [...finalHeroes, ...finalDetails].map((section, index) => {
    const base = {
      ...section,
      order: index,
    };
    if (section.type === "HERO") {
      const suffix = section.variantScope && section.variantScope !== "base" ? `_${section.variantScope}` : "";
      return {
        ...base,
        sectionKey: `hero_${String(index + 1).padStart(2, "0")}${suffix}${section.variantId ? `_${section.variantId.slice(0, 6)}` : ""}`,
      };
    }

    const detailIndex = index + 1 - finalHeroes.length;
    const suffix = section.variantScope && section.variantScope !== "base" ? `_${section.variantScope}` : "";
    return {
      ...base,
      sectionKey: `detail_${String(detailIndex).padStart(2, "0")}_${section.type.toLowerCase()}${suffix}${section.variantId ? `_${section.variantId.slice(0, 6)}` : ""}`,
    };
  });
}

function buildFallbackPlanFromTemplates(
  heroImageCount: number,
  detailSectionCount: number,
  variants: { id: string; name: string }[] = [],
  productName = "",
  factClaims: string[] = [],
) {
  return buildNormalizedSections([], heroImageCount, detailSectionCount, variants, factClaims, productName);
}

/**
 * 可选 1:1 模块：成分配料表 / 白底商品图 / 规格图。
 * 这些模块不参与 AI 规划计数，勾选后确定性追加到详情页末尾。
 */
const OPTIONAL_SECTION_DEFINITIONS: Record<
  (typeof OPTIONAL_SECTION_IDS)[number],
  { type: string; title: string; goal: string; copy: string; visualPrompt: string; includePackaging: boolean }
> = {
  ingredients_table: {
    type: "INGREDIENTS_TABLE",
    title: "成分配料表",
    goal: "清晰展示成分表与配料表，建立成分信任",
    copy: "成分表与配料表清晰陈列，数据以商品实际信息为准。",
    visualPrompt:
      "1:1 方形构图，浅色干净背景，居中排版成分表与配料表表格，字体清晰易读，表格线简洁，产品小图或包装角标点缀，不要虚构任何数值。",
    includePackaging: false,
  },
  white_bg_product: {
    type: "WHITE_BG_PRODUCT",
    title: "白底商品图",
    goal: "纯白背景展示商品主图与包装组合",
    copy: "纯白背景，商品主体与包装组合展示。",
    visualPrompt:
      "1:1 方形纯白背景（#FFFFFF），商品主体与真实包装组合展示，包装严格参照上传的包装参考图，柔和自然阴影，无文字、无装饰、无杂色，电商白底主图风格。",
    includePackaging: true,
  },
  specs: {
    type: "SPECS",
    title: "规格图",
    goal: "用 1:1 版图清晰展示产品规格参数",
    copy: "规格参数清晰展示，数据以商品实际信息为准。",
    visualPrompt:
      "1:1 方形构图，浅色极简背景，规格参数以卡片或表格形式整齐排列，配商品主体图，版面干净，数据区域醒目，不要虚构任何尺寸或数值。",
    includePackaging: false,
  },
};

function appendOptionalSections(
  sections: NormalizedSection[],
  optionalSections: string[],
  variants: { id: string; name: string }[] = [],
  variantsWithAnalysis: VariantWithAnalysis[] = [],
  baseAnalysis: Record<string, unknown> = {},
  hasPackagingReference = false,
): NormalizedSection[] {
  if (!optionalSections.length) return sections;

  const existingTypes = new Set(sections.map((section) => section.type));
  const appended: NormalizedSection[] = [];
  let order = sections.length;

  const perVariantIds = new Set<typeof OPTIONAL_SECTION_IDS[number]>(["ingredients_table", "specs", "white_bg_product"]);

  for (const id of OPTIONAL_SECTION_IDS) {
    if (!optionalSections.includes(id)) continue;
    const definition = OPTIONAL_SECTION_DEFINITIONS[id];
    if (!definition) continue;

    const hasEvidence = (analysis: Record<string, unknown>) => {
      if (id === "specs") return Array.isArray(analysis.specs) && analysis.specs.length > 0;
      if (id === "ingredients_table") {
        return (Array.isArray(analysis.ingredients) && analysis.ingredients.length > 0) ||
          (analysis.nutritionFacts &&
            typeof analysis.nutritionFacts === "object" &&
            Object.keys(analysis.nutritionFacts as object).length > 0);
      }
      return true;
    };
    const includePackaging = definition.includePackaging && hasPackagingReference;
    const optionalVisualPrompt = id === "white_bg_product" && !includePackaging
      ? "1:1 方形纯白背景（#FFFFFF），只展示真实商品主体，柔和自然阴影，无文字、无装饰、无杂色；禁止生成参考图中不存在的纸箱、礼盒、外袋或任何外包装。"
      : definition.visualPrompt;

    const controls = {
      includePackaging,
      aspectRatio: "1:1",
    } as unknown as SectionPlanControls;

    if (variants.length > 0 && perVariantIds.has(id)) {
      for (const variant of variants) {
        const variantAnalysis = variantsWithAnalysis.find((v) => v.id === variant.id);
        const analysis = variantAnalysis ? readVariantAnalysis(variantAnalysis) : {};
        if (!hasEvidence(analysis)) continue;
        let variantCopy = id === "white_bg_product" && !includePackaging
          ? "纯白背景，仅展示真实商品主体，不生成外包装。"
          : definition.copy;
        if (id === "specs") {
          const specsText = formatSpecsForCopy(analysis.specs);
          if (specsText) variantCopy = `${variant.name} 规格参数：\n${specsText}\n\n${definition.copy}`;
        }
        if (id === "ingredients_table") {
          const ingredientsText = formatIngredientsForCopy(analysis.ingredients, analysis.nutritionFacts);
          if (ingredientsText) variantCopy = `${variant.name} 配料与营养成分：\n${ingredientsText}\n\n${definition.copy}`;
        }
        if (id === "white_bg_product") {
          const notes = typeof analysis.packagingNotes === "string" ? analysis.packagingNotes : undefined;
          if (notes) variantCopy = `${variant.name} 包装说明：${notes}\n\n${definition.copy}`;
        }
        appended.push({
          sectionKey: `detail_optional_${id}_${variant.id.slice(0, 8)}`,
          type: definition.type,
          title: `${variant.name} - ${definition.title}`,
          goal: `${definition.goal}（${variant.name}）`,
          copy: variantCopy,
          visualPrompt: ensureChinesePrimaryPrompt(optionalVisualPrompt, `${variant.name} - ${definition.title}`),
          controls,
          variantScope: "variant",
          variantId: variant.id,
          editableData: {
            controls,
            variantScope: "variant",
            variantId: variant.id,
            mainTitle: "",
            subTitle: "",
            supportingPoints: [],
            layout: "",
            visualDescription: "",
            negativePrompt: "",
            colorScheme: null,
            whitespaceRatio: 40,
            commerceBrief: defaultCommerceBrief(definition.type),
          },
          order: order++,
        });
      }
      continue;
    }

    if (existingTypes.has(definition.type)) continue;
    if (!hasEvidence(baseAnalysis)) continue;

    appended.push({
      sectionKey: `detail_optional_${id}`,
      type: definition.type,
      title: definition.title,
      goal: definition.goal,
      copy: id === "white_bg_product" && !includePackaging
        ? "纯白背景，仅展示真实商品主体，不生成外包装。"
        : definition.copy,
      visualPrompt: ensureChinesePrimaryPrompt(optionalVisualPrompt, definition.title),
      controls,
      editableData: {
        controls,
        mainTitle: "",
        subTitle: "",
        supportingPoints: [],
        layout: "",
        visualDescription: "",
        negativePrompt: "",
        colorScheme: null,
        whitespaceRatio: 40,
        commerceBrief: defaultCommerceBrief(definition.type),
      },
      order: order++,
    });
  }

  return [...sections, ...appended];
}

function ensureUniqueSectionKeys(sections: NormalizedSection[]): NormalizedSection[] {
  const seen = new Map<string, number>();
  return sections.map((section) => {
    let key = section.sectionKey || `unknown_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (seen.has(key)) {
      const count = seen.get(key)! + 1;
      seen.set(key, count);
      const newKey = `${key}_${count}`;
      console.warn(`[ensureUniqueSectionKeys] Duplicate sectionKey detected: ${key} -> renamed to ${newKey}`);
      key = newKey;
    } else {
      seen.set(key, 0);
    }
    return { ...section, sectionKey: key };
  });
}

function planningOutputTokenBudget(heroImageCount: number, detailSectionCount: number) {
  const totalSections = Math.max(1, heroImageCount + detailSectionCount);
  return Math.min(
    PLANNING_OUTPUT_TOKENS_MAX,
    Math.max(PLANNING_OUTPUT_TOKENS_MIN, totalSections * PLANNING_OUTPUT_TOKENS_PER_SECTION),
  );
}

function buildPlanningRecoveryPrompt(prompt: string, heroImageCount: number, detailSectionCount: number) {
  return [
    prompt,
    "",
    "## Recovery pass",
    `The previous response contained no usable sections. Return exactly ${heroImageCount + detailSectionCount} compact sections now: ${heroImageCount} hero items followed by ${detailSectionCount} detail items.`,
    "Use only id, type, title, goal, copy, visualPrompt, visualMode, proofDevice, and minimal multi-spec fields.",
    "Omit styleGuide if needed to finish all sections. Never return an empty sections array. Close the JSON object before any extra text.",
  ].join("\n");
}

function planningDiagnostics(params: {
  mode: "ai" | "template_fill" | "template_plan";
  model: string;
  requestedSectionCount: number;
  aiSectionCount: number;
  templateFillCount: number;
  maxOutputTokens: number;
  fallbackReason?: string | null;
}) {
  return {
    ...params,
    recordedAt: new Date().toISOString(),
  };
}

function compactPlanningFallbackReason(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown planning error";
  if (message.includes("AI returned empty parsed result")) {
    return "Kimi returned no usable sections after the recovery pass.";
  }
  if (message.includes("Structured output parse failed")) {
    return "Kimi output remained incomplete or malformed after structured-output repair.";
  }
  return message.replace(/\s+/g, " ").slice(0, 280);
}

function shouldFallbackToTemplatePlan(error: unknown) {
  if (error instanceof z.ZodError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;

  // Provider/infrastructure errors should NOT silently fall back to template planning.
  if (
    /provider request failed|timed out|timeout|network|quota|billing|spending limit|unauthorized|forbidden|no available endpoint/i.test(
      message,
    )
  ) {
    return false;
  }

  // JSON/schema/parse errors and any message mentioning sections should fall back.
  return (
    /"sections"|expected array|invalid input: expected array|received undefined|section|invalid enum|expected .*\|.*received|unexpected token|invalid json|parse|malformed|cannot read.*sections/i.test(
      message,
    ) || message.includes("AI returned empty parsed result")
  );
}

async function decidePreviewConfigWithAi(projectId: string, preferredModelId?: string | null) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      analysis: true,
      variants: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!project?.analysis) {
    throw new Error("请先完成商品分析，再进行页面规划。");
  }

  const { provider, adapter } = await getProviderAdapter("text");
  const model =
    preferredModelId ??
    provider.models.find((item) => item.isDefaultPlanning)?.modelId ??
    provider.models.find((item) => (item.capabilities as Record<string, boolean>).structured_output)?.modelId ??
    provider.models.find((item) => (item.capabilities as Record<string, boolean>).text)?.modelId ??
    provider.models[0]?.modelId;

  if (!model) {
    throw new Error("当前没有可用的文案规划模型。");
  }

  const currentPreviewConfig = readPreviewConfig(project.modelSnapshot);
  const planningAnalysis = resolvePlanningAnalysis(
    project.analysis.normalizedResult,
    project.analysis.rawResult,
  );
  const prompt = buildPreviewDecisionPrompt(
    planningAnalysis,
    currentPreviewConfig.contentLanguage,
  );
  const result = await adapter.generateStructured({
    model,
    systemPrompt: "Return strict JSON only.",
    userPrompt: prompt,
    schema: previewDecisionSchema,
    reasoningEffort: "low",
    maxOutputTokens: 1200,
    timeoutMs: 300000,
    monitor: {
      projectId,
      operation: "preview_count_planning",
    },
  });

  const current = readPreviewConfig(project.modelSnapshot);
  const decided = previewConfigSchema.parse({
    heroImageCount: result.parsed.heroImageCount,
    detailSectionCount: result.parsed.detailSectionCount,
    imageAspectRatio: current.imageAspectRatio,
    contentLanguage: current.contentLanguage,
    optionalSections: current.optionalSections,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      modelSnapshot: {
        ...(project.modelSnapshot as Record<string, unknown> | null),
        previewConfig: decided,
        previewConfigSource: "ai",
        previewConfigReason: result.parsed.reason,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    previewConfig: decided,
    reason: result.parsed.reason,
  };
}

export async function planSections(
  projectId: string,
  options?: {
    modelId?: string | null;
    previewConfig?: PreviewConfigInput | null;
    autoDecideCounts?: boolean;
    paletteStyle?: PaletteStyle;
    idempotencyKey?: string | null;
  },
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      analysis: true,
      assets: { select: { type: true } },
      variants: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!project?.analysis) {
    throw new Error("请先完成商品分析，再进行页面规划。");
  }

  const paletteStyle =
    options?.paletteStyle ??
    ((project.modelSnapshot as Record<string, unknown> | null)?.paletteStyle as PaletteStyle | undefined) ??
    "safe";

  const { provider, adapter } = await getProviderAdapter("text");
  const model =
    options?.modelId ??
    provider.models.find((item) => item.isDefaultPlanning)?.modelId ??
    provider.models.find((item) => (item.capabilities as Record<string, boolean>).structured_output)?.modelId ??
    provider.models.find((item) => (item.capabilities as Record<string, boolean>).text)?.modelId ??
    provider.models[0]?.modelId;

  if (!model) {
    throw new Error("当前没有可用的文案规划模型。");
  }

  const existingTask = options?.idempotencyKey ? null : await findRecentRunningTask({
    projectId,
    taskType: "PLAN",
    maxAgeMinutes: 10,
  });
  if (existingTask) {
    throw new Error("当前页面规划仍在进行中，请等待这一轮完成后再试。");
  }

  let previewConfig =
    options?.previewConfig != null ? previewConfigSchema.parse(options.previewConfig) : readPreviewConfig(project.modelSnapshot);
  let previewDecisionReason = "";

  if (options?.autoDecideCounts) {
    const decision = await decidePreviewConfigWithAi(projectId, model);
    previewConfig = decision.previewConfig;
    previewDecisionReason = decision.reason;
  }

  const task = await createTask({
    projectId,
    taskType: "PLAN",
    idempotencyKey: options?.idempotencyKey,
    inputPayload: { model, previewConfig, autoDecideCounts: Boolean(options?.autoDecideCounts) },
  });

  const variantInfos = project.variants.map((variant) => ({ id: variant.id, name: variant.name }));
  const variantsWithAnalysis: VariantWithAnalysis[] = project.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    analysis: (variant.metadata ?? {}) as Record<string, unknown>,
  }));
  const planningAnalysis = resolvePlanningAnalysis(
    project.analysis.normalizedResult,
    project.analysis.rawResult,
  );
  const planningFactClaims = readPlanningFactClaims(planningAnalysis);

  try {
    const variantSummaries = project.variants.map((variant) => {
      const metadata = (variant.metadata ?? {}) as Record<string, unknown>;
      const analysis =
        typeof metadata.analysis === "object" && metadata.analysis !== null
          ? (metadata.analysis as Record<string, unknown>)
          : {};
      return {
        id: variant.id,
        name: variant.name,
        description: typeof analysis.description === "string" ? analysis.description : undefined,
        keyIngredients: Array.isArray(analysis.keyIngredients) ? (analysis.keyIngredients as string[]) : undefined,
        packagingNotes: typeof analysis.packagingNotes === "string" ? analysis.packagingNotes : undefined,
        differences: typeof analysis.differences === "string" ? analysis.differences : undefined,
      };
    });

    const prompt = buildSectionPlanningPrompt(
      planningAnalysis as never,
      project.style,
      project.platform,
      previewConfig.detailSectionCount,
      previewConfig.heroImageCount,
      previewConfig.contentLanguage,
      variantSummaries,
    );

    const maxOutputTokens = planningOutputTokenBudget(
      previewConfig.heroImageCount,
      previewConfig.detailSectionCount,
    );
    let result = await adapter.generateStructured({
      model,
      systemPrompt: "Return strict compact JSON only. Keep every section complete and do not add omitted optional fields.",
      userPrompt: prompt,
      schema: sectionPlanOutputSchema,
      reasoningEffort: "low",
      maxOutputTokens,
      timeoutMs: 300000,
      monitor: {
        projectId,
        operation: "section_planning",
      }
    });

    let rawSections = Array.isArray(result.parsed.sections) ? result.parsed.sections : [];
    if (rawSections.length === 0) {
      result = await adapter.generateStructured({
        model,
        systemPrompt: "Return strict compact JSON only. Complete every requested section before closing the object.",
        userPrompt: buildPlanningRecoveryPrompt(
          prompt,
          previewConfig.heroImageCount,
          previewConfig.detailSectionCount,
        ),
        schema: sectionPlanOutputSchema,
        reasoningEffort: "low",
        maxOutputTokens,
        timeoutMs: 300000,
        monitor: {
          projectId,
          operation: "section_planning_empty_retry",
        },
      });
      rawSections = Array.isArray(result.parsed.sections) ? result.parsed.sections : [];
    }
    if (rawSections.length === 0) throw new Error("AI returned empty parsed result");
    const sections = buildNormalizedSections(
      rawSections,
      previewConfig.heroImageCount,
      previewConfig.detailSectionCount,
      variantInfos,
      planningFactClaims,
      typeof planningAnalysis.productName === "string" ? planningAnalysis.productName : "",
    );
    const aiSectionCount = sections.filter((section) => section.planningOrigin === "ai").length;
    const templateFillCount = sections.length - aiSectionCount;
    const fallbackMode = templateFillCount > 0 ? "template_fill" as const : undefined;
    const diagnostics = planningDiagnostics({
      mode: fallbackMode ?? "ai",
      model,
      requestedSectionCount: previewConfig.heroImageCount + previewConfig.detailSectionCount,
      aiSectionCount,
      templateFillCount,
      maxOutputTokens,
    });

    // Never let an incomplete model response overwrite the quantity selected in
    // analysis. buildNormalizedSections() makes the stored structure match this
    // configuration before it reaches the planner UI.
    const effectivePreviewConfig = previewConfig;

    let sectionsWithOptional = appendOptionalSections(
      sections,
      effectivePreviewConfig.optionalSections,
      variantInfos,
      variantsWithAnalysis,
      planningAnalysis,
      project.assets.some((asset) => asset.type === "PACKAGING"),
    );
    sectionsWithOptional = ensureUniqueSectionKeys(sectionsWithOptional);

    const aiStyleGuide = (result.parsed.styleGuide ?? buildDefaultStyleGuide(project.style)) as AiStyleGuideInput;
    const baseStyleGuide = await buildProjectStyleGuide(projectId, project.style, aiStyleGuide);

    // Generate 3-5 palette options seeded by product analysis and detected style.
    // The heavy style-anchor image is deferred until the first section generation.
    let paletteOptions: PaletteOption[] = [];
    let selectedPalette: PaletteOption | undefined;
    try {
      const analysis = planningAnalysis;
      paletteOptions = await generatePaletteOptions({
        projectId,
        detectedStyle: [analysis.detectedStyle, analysis.category, analysis.subcategory]
          .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          .join(" ") || project.style,
        styleTags: Array.isArray(analysis?.styleTags) ? (analysis.styleTags as string[]) : undefined,
        projectStyle: project.style,
        extractedPalette: baseStyleGuide.colorPalette as ExtractedColorPalette | undefined,
        style: paletteStyle,
      });
      selectedPalette = paletteOptions[0];
    } catch (error) {
      console.error("[PaletteOptions] Failed to generate palette options:", error);
    }

    const styleGuide = {
      ...(selectedPalette ? applyPaletteToStyleGuide(baseStyleGuide, selectedPalette, paletteStyle) : baseStyleGuide),
      paletteStyle,
    };

    await prisma.pageSection.deleteMany({ where: { projectId } });

    await prisma.pageSection.createMany({
      data: sectionsWithOptional.map((section) => ({
        projectId,
        sectionKey: section.sectionKey,
        type: section.type as never,
        title: section.title,
        goal: section.goal,
        copy: section.copy,
        visualPrompt: section.visualPrompt,
        order: section.order,
        editableData: {
          ...section.editableData,
          controls: section.controls,
          planningOrigin: section.planningOrigin ?? "ai",
        } as unknown as Prisma.InputJsonValue,
      })),
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "PLANNED",
        paletteOptions: paletteOptions as unknown as Prisma.InputJsonValue,
        selectedPaletteId: selectedPalette?.id ?? null,
        modelSnapshot: {
          ...(project.modelSnapshot as Record<string, unknown> | null),
          planningModelId: model,
          previewConfig: effectivePreviewConfig,
          previewConfigSource: options?.autoDecideCounts ? "ai" : "manual",
          previewConfigReason: previewDecisionReason,
          styleGuide: styleGuide as unknown as Prisma.InputJsonValue,
          paletteOptions: paletteOptions as unknown as Prisma.InputJsonValue,
          selectedPaletteId: selectedPalette?.id,
          paletteStyle,
          planningDiagnostics: diagnostics,
          moduleTemplates: {},
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const saved = await prisma.pageSection.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    });
    await reconcilePageDocumentAfterLegacyPlanning(projectId);
    await completeTask(task.id, {
      sections: saved,
      previewConfig: effectivePreviewConfig,
      previewDecisionReason,
      planningDiagnostics: diagnostics,
      ...(fallbackMode ? { fallbackMode } : {}),
    });
    return {
      sections: saved,
      previewConfig: effectivePreviewConfig,
      previewDecisionReason,
      planningDiagnostics: diagnostics,
      ...(fallbackMode ? { fallbackMode } : {}),
    };
  } catch (error) {
    if (shouldFallbackToTemplatePlan(error)) {
      try {
        const fallbackReason = compactPlanningFallbackReason(error);
        const diagnostics = planningDiagnostics({
          mode: "template_plan",
          model,
          requestedSectionCount: previewConfig.heroImageCount + previewConfig.detailSectionCount,
          aiSectionCount: 0,
          templateFillCount: previewConfig.heroImageCount + previewConfig.detailSectionCount,
          maxOutputTokens: planningOutputTokenBudget(
            previewConfig.heroImageCount,
            previewConfig.detailSectionCount,
          ),
          fallbackReason,
        });
        await prisma.pageSection.deleteMany({ where: { projectId } });
        let fallbackSections = appendOptionalSections(
          buildFallbackPlanFromTemplates(
            previewConfig.heroImageCount,
            previewConfig.detailSectionCount,
            variantInfos,
            typeof planningAnalysis.productName === "string" ? planningAnalysis.productName : "",
            planningFactClaims,
          ),
          previewConfig.optionalSections,
          variantInfos,
          variantsWithAnalysis,
          planningAnalysis,
          project.assets.some((asset) => asset.type === "PACKAGING"),
        );
        fallbackSections = ensureUniqueSectionKeys(fallbackSections);
        await prisma.pageSection.createMany({
          data: fallbackSections.map((section) => ({
            projectId,
            sectionKey: section.sectionKey,
            type: section.type as never,
            title: section.title,
            goal: section.goal,
            copy: section.copy,
            visualPrompt: section.visualPrompt,
            order: section.order,
            editableData: {
              ...section.editableData,
              controls: section.controls,
              planningOrigin: "template_plan",
            } as unknown as Prisma.InputJsonValue,
          })),
        });

        const fallbackStyleGuide = await buildProjectStyleGuide(projectId, project.style);
        let fallbackPaletteOptions: PaletteOption[] = [];
        let fallbackSelectedPalette: PaletteOption | undefined;
        try {
          fallbackPaletteOptions = await generatePaletteOptions({
            projectId,
            detectedStyle: [planningAnalysis.detectedStyle, planningAnalysis.category, planningAnalysis.subcategory]
              .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
              .join(" "),
            styleTags: Array.isArray(planningAnalysis.styleTags) ? planningAnalysis.styleTags as string[] : undefined,
            projectStyle: project.style,
            extractedPalette: fallbackStyleGuide.colorPalette as ExtractedColorPalette | undefined,
            style: paletteStyle,
          });
          fallbackSelectedPalette = fallbackPaletteOptions[0];
        } catch (error) {
          console.error("[PaletteOptions] Failed to generate fallback palette options:", error);
        }

        const finalFallbackStyleGuide = {
          ...(fallbackSelectedPalette ? applyPaletteToStyleGuide(fallbackStyleGuide, fallbackSelectedPalette, paletteStyle) : fallbackStyleGuide),
          paletteStyle,
        };

        await prisma.project.update({
          where: { id: projectId },
          data: {
            status: "PLANNED",
            paletteOptions: fallbackPaletteOptions as unknown as Prisma.InputJsonValue,
            selectedPaletteId: fallbackSelectedPalette?.id ?? null,
            modelSnapshot: {
              ...(project.modelSnapshot as Record<string, unknown> | null),
              planningModelId: model,
              previewConfig,
              previewConfigSource: options?.autoDecideCounts ? "ai" : "manual",
              previewConfigReason: `${previewDecisionReason ? `${previewDecisionReason}；` : ""}AI 返回结构不完整，已自动切换为模板规划。`,
              styleGuide: finalFallbackStyleGuide as unknown as Prisma.InputJsonValue,
              paletteOptions: fallbackPaletteOptions as unknown as Prisma.InputJsonValue,
              selectedPaletteId: fallbackSelectedPalette?.id,
              paletteStyle,
              planningDiagnostics: diagnostics,
              moduleTemplates: {},
            } as unknown as Prisma.InputJsonValue,
          },
        });

        const saved = await prisma.pageSection.findMany({
          where: { projectId },
          orderBy: { order: "asc" },
        });
        await reconcilePageDocumentAfterLegacyPlanning(projectId);

        await completeTask(task.id, {
          sections: saved,
          previewConfig,
          previewDecisionReason,
          fallbackMode: "template_plan",
          planningDiagnostics: diagnostics,
        });

        return {
          sections: saved,
          previewConfig,
          previewDecisionReason,
          fallbackMode: "template_plan" as const,
          planningDiagnostics: diagnostics,
        };
      } catch (fallbackError) {
        const originalMessage = error instanceof Error ? error.message : "未知错误";
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "未知错误";
        console.error("[PlanFallback] Original error:", error);
        console.error("[PlanFallback] Fallback error:", fallbackError);
        const detail = `AI 规划失败，且模板规划回退也失败。原始错误：${originalMessage}；回退错误：${fallbackMessage}`;
        await failTask(task.id, detail);
        throw new Error(detail);
      }
    }

    const message =
      error instanceof Error
        ? error.message.includes("timed out")
          ? "页面规划请求超时，请稍后重试，或在 AI 配置里改用更快的规划模型。"
          : error.message
        : "页面规划失败";
    await failTask(task.id, message);
    throw new Error(message);
  }
}

export async function createSection(
  projectId: string,
  input: {
    type: string;
    title: string;
    goal: string;
    copy: string;
    visualPrompt: string;
    editableFields?: Record<string, unknown>;
  },
) {
  await assertSectionMutationAllowed(projectId, { addingType: input.type });
  const count = await prisma.pageSection.count({ where: { projectId } });
  const type = normalizeSectionType(input.type);
  const visualMode = resolveVisualMode(
    type,
    input.editableFields?.visualMode,
    `${input.title} ${input.goal} ${input.visualPrompt}`,
  );
  const mainTitle = readEditableString(input.editableFields ?? {}, "mainTitle");
  const titleDesign = alignTitleDesignWithHeadline(
    normalizeTitleDesign(type, visualMode, input.editableFields?.titleDesign),
    mainTitle,
  );
  const heroCount = type === "HERO"
    ? await prisma.pageSection.count({ where: { projectId, type: "HERO" } })
    : 0;
  const created = await prisma.pageSection.create({
    data: {
      projectId,
      sectionKey:
        type === "HERO"
          ? `hero_${String(count + 1).padStart(2, "0")}`
          : `detail_${String(count + 1).padStart(2, "0")}_${nanoid(6)}`,
      type: type as never,
      title: input.title,
      goal: input.goal,
      copy: input.copy,
      visualPrompt: ensureVisualModePrompt(type, visualMode, input.visualPrompt, input.title),
      order: count,
      editableData: {
        ...(input.editableFields ?? {}),
        visualMode,
        headlineAngle: type === "HERO"
          ? resolveHeroAngle(input.editableFields?.headlineAngle, heroCount)
          : undefined,
        titleDesign,
        controls: { includePackaging: resolveDefaultIncludePackaging(type) },
      } as unknown as Prisma.InputJsonValue,
    },
  });
  await normalizeProjectSections(projectId);
  await reconcilePageDocumentAfterLegacyPlanning(projectId);
  return created;
}

export async function updateSection(sectionId: string, input: Record<string, unknown>) {
  const current = await prisma.pageSection.findUnique({
    where: { id: sectionId },
    select: {
      projectId: true,
      type: true,
      title: true,
      goal: true,
      copy: true,
      visualPrompt: true,
      editableData: true,
    },
  });

  if (!current) {
    throw new Error("Section not found.");
  }

  if ("type" in input && typeof input.type === "string") {
    await assertSectionMutationAllowed(current.projectId, {
      updatingSectionId: sectionId,
      nextType: input.type,
    });
  }

  const payload = { ...input } as Record<string, unknown>;
  if ("visualPrompt" in payload && typeof payload.visualPrompt === "string") {
    payload.visualPrompt = ensureChinesePrimaryPrompt(payload.visualPrompt, String(payload.title ?? "当前模块"));
  }
  if ("type" in payload && typeof payload.type === "string") {
    payload.type = normalizeSectionType(payload.type) as never;
  }
  if ("type" in payload && typeof payload.type === "string" && !("controls" in (payload.editableData as Record<string, unknown> ?? {}))) {
    const nextType = payload.type as string;
    payload.editableData = {
      ...((payload.editableData ?? {}) as Record<string, unknown>),
      controls: { includePackaging: resolveDefaultIncludePackaging(nextType) },
    };
  }
  if ("editableData" in payload) {
    const incoming = (payload.editableData ?? {}) as Record<string, unknown>;
    const existing = (current.editableData ?? {}) as Record<string, unknown>;
    payload.editableData = { ...existing, ...incoming } as unknown as Prisma.InputJsonValue;
  }

  const nextSectionContent = {
    type: String(payload.type ?? current.type),
    title: String(payload.title ?? current.title),
    goal: String(payload.goal ?? current.goal),
    copy: String(payload.copy ?? current.copy),
    visualPrompt: String(payload.visualPrompt ?? current.visualPrompt),
    editableData: payload.editableData ?? current.editableData ?? null,
  };
  const currentSectionContent = {
    type: String(current.type),
    title: current.title,
    goal: current.goal,
    copy: current.copy,
    visualPrompt: current.visualPrompt,
    editableData: current.editableData ?? null,
  };
  const contentChanged = hashDocumentValue(nextSectionContent) !== hashDocumentValue(currentSectionContent);

  // A section image is a snapshot of its prompt/copy/references. Once the
  // blueprint content changes, keeping it as the current output makes the UI
  // and subsequent generation look like the edit was ignored. Preserve the
  // asset/version history, but require a fresh image for the edited section.
  if (contentChanged) {
    payload.status = "IDLE";
    payload.currentImageAssetId = null;
  }

  const updated = await prisma.pageSection.update({
    where: { id: sectionId },
    data: payload,
  });
  await normalizeProjectSections(current.projectId);

  if (contentChanged) {
    const project = await prisma.project.findUnique({
      where: { id: current.projectId },
      select: { modelSnapshot: true },
    });
    const snapshot = (project?.modelSnapshot as Record<string, unknown> | null) ?? {};
    const styleGuide = (snapshot.styleGuide as Record<string, unknown> | null) ?? {};
    if (
      styleGuide.anchorKind === "approved_section_tone_anchor_v1" &&
      styleGuide.anchorSectionId === sectionId
    ) {
      await prisma.project.update({
        where: { id: current.projectId },
        data: {
          modelSnapshot: {
            ...snapshot,
            styleGuide: {
              ...styleGuide,
              anchorKind: null,
              anchorImageAssetId: null,
              anchorSectionId: null,
              anchorApprovedAt: null,
            },
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  await reconcilePageDocumentAfterLegacyPlanning(current.projectId);
  return updated;
}

export async function deleteSection(sectionId: string) {
  const current = await prisma.pageSection.findUnique({
    where: { id: sectionId },
    select: { projectId: true },
  });

  if (!current) {
    throw new Error("Section not found.");
  }

  await assertSectionMutationAllowed(current.projectId, { deletingSectionId: sectionId });
  const deleted = await prisma.pageSection.delete({
    where: { id: sectionId },
  });
  await normalizeProjectSections(current.projectId);
  await reconcilePageDocumentAfterLegacyPlanning(current.projectId);
  return deleted;
}

export async function reorderSections(projectId: string, orderedSectionIds: string[]) {
  await prisma.$transaction(
    orderedSectionIds.map((sectionId, index) =>
      prisma.pageSection.update({
        where: { id: sectionId },
        data: { order: index },
      }),
    ),
  );

  await normalizeProjectSections(projectId);

  await reconcilePageDocumentAfterLegacyPlanning(projectId);

  return prisma.pageSection.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
}
