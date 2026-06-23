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

  const isChinese = normalizeContentLanguage(contentLanguage) === "zh-CN";

  return [
    "You are a senior e-commerce detail-page strategist.",
    `Platform: ${platformLabel} | Style: ${styleLabel} | Language: ${targetLanguage}`,
    `Generate ${totalSections} sections total: ${heroImageCount} hero images + ${detailSectionCount} detail sections.`,
    "Return strict JSON only. No markdown.",
    "",
    "## Output format:",
    '{"styleGuide": {"colorPalette": {"background":"#F5F5F5","primary":"#1A1A1A","secondary":"#666666","accent":"#D4A574","text":"#111111"}, "typography": {"headingStyle":"bold sans-serif","bodyStyle":"clean sans-serif","headingFont":"PingFang SC Bold","bodyFont":"PingFang SC Regular"}, "mood":"premium calm", "visualSystem": {"lighting":"soft diffused top-left key light","shadowStyle":"soft drop shadows with 8px blur","textureStyle":"matte paper texture, subtle grain","compositionGrid":"1080x1920, 72px margins, product 55% of frame height","typographyScale":"headline 72px bold, subheadline 42px medium, body 32px regular, CTA 38px bold","badgeStyle":"rounded pill with 1px stroke, small all-caps label","iconStyle":"thin-line icons, 2px stroke, monochrome"}}, "sections": [{"id":"...","type":"...","title":"...","goal":"...","copy":"...","visualPrompt":"..."}]}',
    "",
    "## Section types:",
    "hero, pain_point, selling_points, scenario, detail_closeup, specs, material, comparison, brand_trust, summary, conversion, gift_scene, origin, nutrition, audience, formula, custom",
    "",
    "## Each section fields (keep concise):",
    "- id: unique string",
    "- type: section type",
    `- title: section name in ${targetLanguage}`,
    "- goal: 1-sentence design purpose",
    `- copy: marketing copy (main title + key bullets) in ${targetLanguage}`,
    "- visualPrompt: detailed image-generation prompt (photography/composition terms, 30-50 words, vertical mobile composition). Keep it in English or bilingual; the visual direction is what matters.",
    "",
    "## Rules:",
    "- First " + heroImageCount + " sections must be type=hero",
    "- Remaining " + detailSectionCount + " sections are detail sections",
    `- All user-facing copy (titles, bullets, headlines, CTAs) must be written in ${targetLanguage}.`,
    "- visualPrompt should emphasize concrete visual instructions: lighting, angle, composition, color treatment, and text placement.",
    "- Keep visualPrompt under 100 words total",
    "- Visual flow: Grab → Empathize → Trust → Convert",
    "- CRITICAL: All sections must share the SAME unified color palette defined in styleGuide.colorPalette. Do not let each section use a random different palette. Each section may emphasize different colors from the palette, but the overall hue family must stay consistent across the whole detail page.",
    "- styleGuide.colorPalette: provide exactly 5 HEX colors (background, primary, secondary, accent, text). These colors must be harmonious and suitable for the product category and chosen style. They will be reused for every section image to guarantee page-level consistency.",
    "- styleGuide.mood: one short phrase describing the overall atmosphere (e.g. premium calm, energetic youthful, minimalist clean).",
    "- styleGuide.visualSystem: define a single unified visual system that ALL sections must follow. Include: lighting, shadowStyle, textureStyle, compositionGrid, typographyScale, badgeStyle, iconStyle, productAngle, productSizeRatio, productPosition. Be specific and actionable (e.g. 'soft top-left key light', '72px safe margins', 'headline 72px bold', 'product 55% of frame height'). This is the key to making the whole detail page feel like one cohesive design system.",
    isChinese
      ? "- ALL marketing copy (title, bullets, headlines) must comply with Chinese Advertising Law: no absolute superlatives (最, 第一, 顶级, 最佳, 唯一, 根治, 治愈, 100%, etc.), no false medical claims, no unverified certifications."
      : "- ALL marketing copy must comply with local advertising law: avoid unverifiable absolute claims, false medical/health claims, and unsupported certifications.",
    "- If nutritionFacts data is provided in the context, use those exact values in the copy for specs/nutrition sections. Do not estimate, round, or invent numbers. If data is missing, omit specific numbers rather than guessing.",
    ...(isChinese ? [adLawSection] : []),
    "",
    "## Context:",
    JSON.stringify(planningContext),
  ].join("\n");
}
