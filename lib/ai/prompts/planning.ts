import type { ProductAnalysisOutput } from "@/lib/ai/schemas/product-analysis";
import { buildAdLawPromptSection } from "@/lib/ai/ad-law-guard";
import {
  platformLabels,
  sectionTypeLabels,
  styleLabels,
  type PlatformOption,
  type StyleOption,
} from "@/types/domain";
import { contentLanguageNamesForPrompt, normalizeContentLanguage, type ContentLanguage } from "@/lib/utils/content-language";

const sectionTypeGuide = Object.entries(sectionTypeLabels)
  .map(([key, label]) => `${key}=${label}`)
  .join(", ");

export function buildSectionPlanningPrompt(
  analysis: ProductAnalysisOutput,
  style: string,
  platform: string,
  detailSectionCount = 6,
  heroImageCount = 4,
  contentLanguage: ContentLanguage = "zh-CN",
) {
  const styleLabel = styleLabels[style as StyleOption] ?? style;
  const platformLabel = platformLabels[platform as PlatformOption] ?? platform;
  const targetLanguage = contentLanguageNamesForPrompt[normalizeContentLanguage(contentLanguage)];
  const totalSections = heroImageCount + detailSectionCount;

  const planningContext = {
    productName: analysis.productName,
    category: analysis.category,
    subcategory: analysis.subcategory,
    styleTags: analysis.styleTags.slice(0, 6),
    targetAudience: analysis.targetAudience.slice(0, 4),
    usageScenarios: analysis.usageScenarios.slice(0, 4),
    coreSellingPoints: analysis.coreSellingPoints.slice(0, 6),
    differentiationPoints: analysis.differentiationPoints.slice(0, 4),
    suggestedSectionPlan: analysis.suggestedSectionPlan.slice(0, 6),
    nutritionFacts: analysis.nutritionFacts ?? {},
  };

  const adLawSection = buildAdLawPromptSection(
    analysis.adLawCategory || analysis.category,
    analysis.subcategory,
  );

  return [
    "You are a senior e-commerce detail-page strategist.",
    `Platform: ${platformLabel} | Style: ${styleLabel} | Language: ${targetLanguage}`,
    `Generate ${totalSections} sections total: ${heroImageCount} hero images + ${detailSectionCount} detail sections.`,
    "Return strict JSON only. No markdown.",
    "",
    "## Output format:",
    '{"styleGuide": {"colorPalette": {"background":"#F5F5F5","primary":"#1A1A1A","secondary":"#666666","accent":"#D4A574","text":"#111111"}, "typography": {"headingStyle":"bold sans-serif","bodyStyle":"clean sans-serif"}, "mood":"premium calm"}, "sections": [{"id":"...","type":"...","title":"...","goal":"...","copy":"...","visualPrompt":"..."}]}',
    "",
    "## Section types:",
    "hero, pain_point, selling_points, scenario, detail_closeup, specs, material, comparison, brand_trust, summary, conversion, gift_scene, origin, nutrition, audience, formula, custom",
    "",
    "## Each section fields (keep concise):",
    "- id: unique string",
    "- type: section type",
    "- title: Chinese section name",
    "- goal: 1-sentence design purpose",
    "- copy: marketing copy (main title + key bullets, Chinese)",
    "- visualPrompt: bilingual prompt with Chinese visual direction + English Prompt (30-50 words, photography terms, vertical 9:16 mobile composition)",
    "",
    "## Rules:",
    "- First " + heroImageCount + " sections must be type=hero",
    "- Remaining " + detailSectionCount + " sections are detail sections",
    "- All copy in Simplified Chinese",
    "- visualPrompt format: '中文提示：... English Prompt: ...'",
    "- Keep visualPrompt under 100 words total",
    "- Visual flow: Grab → Empathize → Trust → Convert",
    "- CRITICAL: All sections must share the SAME unified color palette defined in styleGuide.colorPalette. Do not let each section use a random different palette. Each section may emphasize different colors from the palette, but the overall hue family must stay consistent across the whole detail page.",
    "- styleGuide.colorPalette: provide exactly 5 HEX colors (background, primary, secondary, accent, text). These colors must be harmonious and suitable for the product category and chosen style. They will be reused for every section image to guarantee page-level consistency.",
    "- styleGuide.mood: one short phrase describing the overall atmosphere (e.g. premium calm, energetic youthful, minimalist clean).",
    "- ALL marketing copy (title, bullets, headlines) must comply with Chinese Advertising Law: no absolute superlatives (最, 第一, 顶级, 最佳, 唯一, 根治, 治愈, 100%, etc.), no false medical claims, no unverified certifications.",
    "- If nutritionFacts data is provided in the context, use those exact values in the copy for specs/nutrition sections. Do not estimate, round, or invent numbers. If data is missing, omit specific numbers rather than guessing.",
    adLawSection,
    "",
    "## Context:",
    JSON.stringify(planningContext),
  ].join("\n");
}
