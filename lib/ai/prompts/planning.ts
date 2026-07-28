import type { ProductAnalysisOutput } from "@/lib/ai/schemas/product-analysis";
import { buildAdLawPromptSection } from "@/lib/ai/ad-law-guard";
import {
  platformLabels,
  styleLabels,
  type PlatformOption,
  type StyleOption,
} from "@/types/domain";
import { contentLanguageNamesForPrompt, normalizeContentLanguage, type ContentLanguage } from "@/lib/utils/content-language";
import { HERO_ANGLE_IDS } from "@/lib/ai/prompts/hero-angles";

export function buildSectionPlanningPrompt(
  analysis: ProductAnalysisOutput,
  style: string,
  platform: string,
  detailSectionCount = 8,
  heroImageCount = 5,
  contentLanguage: ContentLanguage = "zh-CN",
  variants?: Array<{
    id: string;
    name: string;
    description?: string | null;
    keyIngredients?: string[];
    packagingNotes?: string | null;
    differences?: string | null;
  }>,
) {
  const styleLabel = styleLabels[style as StyleOption] ?? style;
  const platformLabel = platformLabels[platform as PlatformOption] ?? platform;
  const targetLanguage = contentLanguageNamesForPrompt[normalizeContentLanguage(contentLanguage)];
  const totalSections = heroImageCount + detailSectionCount;
  const isChinese = normalizeContentLanguage(contentLanguage) === "zh-CN";

  // Planning only needs marketing-safe evidence. Removing raw analysis metadata
  // keeps the request small without changing the facts available to copywriting.
  const verifiedFacts = analysis.factClaims
    .filter((fact) => fact.confidence === "high" && fact.eligibleForMarketing && fact.source !== "analysis_inference")
    .slice(0, 12)
    .map((fact) => ({ claim: fact.claim, evidence: fact.evidence ?? "", source: fact.source }));
  const planningContext = {
    productName: analysis.productName,
    category: analysis.category,
    subcategory: analysis.subcategory,
    styleTags: analysis.styleTags.slice(0, 6),
    targetAudience: analysis.targetAudience.slice(0, 4),
    usageScenarios: analysis.usageScenarios.slice(0, 4),
    coreSellingPoints: analysis.coreSellingPoints.slice(0, 6),
    verifiedFacts,
    differentiationPoints: analysis.differentiationPoints.slice(0, 4),
    suggestedSectionPlan: analysis.suggestedSectionPlan.slice(0, 6),
    nutritionFacts: analysis.nutritionFacts ?? {},
    ingredients: analysis.ingredients ?? [],
    specs: analysis.specs ?? [],
    packagingDescription: analysis.packagingDescription ?? "",
    variants: variants ?? [],
  };

  const adLawSection = buildAdLawPromptSection(
    analysis.adLawCategory || analysis.category,
    analysis.subcategory,
  );

  return [
    "You are a senior e-commerce detail-page strategist and conversion copywriter.",
    `Platform: ${platformLabel} | Style: ${styleLabel} | Copy language: ${targetLanguage}`,
    `Return exactly ${totalSections} sections: first ${heroImageCount} type=hero, then ${detailSectionCount} detail sections. Counts are fixed by the user and must never shrink.`,
    "Return one valid compact JSON object only. Do not output markdown, explanations, alternative candidates, scores, or fields not listed below.",
    "",
    "## Compact JSON contract",
    '{"styleGuide":{"colorPalette":{"background":"#F4EFE6","primary":"#173D2B","secondary":"#E8B23A","accent":"#E95A32","text":"#172019"},"mood":"清新有冲击力","visualSystem":{"lighting":"定向商业主光","colorTemperature":"统一暖中性","contrastLevel":"鲜明焦点对比","textureStyle":"真实材质"}},"sections":[{"id":"hero_01","type":"hero","title":"首屏主视觉","goal":"第一眼建立商品记忆与购买欲","copy":"鲜明的消费者卖点钩子\\n一至两句食欲、场景、利益或事实短句","visualPrompt":"Primary Prompt: 中文场景与摄影指令","visualMode":"poster","headlineAngle":"PRODUCT_MEMORY","proofDevice":"真实商品主视觉","complianceNote":""}]}',
    "",
    "## Allowed section fields",
    "- Required: id, type, title, goal, copy, visualPrompt, visualMode, proofDevice.",
    "- Optional only when useful: complianceNote, headlineAngle.",
    "- Multi-spec only: scope=base|variant|group, variantName, variantNames, groupLayout=row|triangle|scene.",
    "- type: hero, pain_point, selling_points, scenario, detail_closeup, specs, material, comparison, brand_trust, packaging, summary, conversion, gift_scene, origin, nutrition, audience, formula, custom.",
    "- visualMode: poster, lifestyle_scene, studio, macro, data.",
    `- Hero headlineAngle: ${HERO_ANGLE_IDS.join(", ")}. Use each role at most once before repeating.`,
    "",
    "## Legacy commerce copy strategy",
    `- copy is the primary creative output and all of it must be written in ${targetLanguage}. The first line is one memorable shopper-facing headline; follow it with 0-2 short benefit, sensory, scene, or proof lines. Do not write field labels such as 主标题 or 卖点.`,
    "- Follow the proven legacy flow: Grab -> Empathize -> Trust -> Convert. Across the page, move from the strongest purchase hook to sensory or scene desire, visible proof, differentiation, decision support, and conversion.",
    "- Write finished product advertising, not a planning report. Lead with what makes the shopper stop, crave, imagine, trust, or choose this product.",
    "- The first copy line is normally 6-18 Chinese characters and must be product-specific. Anchor it in the category, ingredient, flavor, shape, texture, scene, audience, packaging identity, or a verified fact; a pure scene payoff may lead with a concrete moment or action.",
    "- Hero copy must create immediate memory and desire. Detail copy must lead with a consumer takeaway before its supporting proof. Never use the internal section title as visible copy.",
    "- Do not output mainTitle, subTitle, supportingPoints, titleCandidates, scores, strategy labels, generic slogans, checking instructions, or dense parameter lists. The application derives display fields from copy without rewriting it.",
    "- Reject administrative copy such as 卖点一眼读懂、基础信息清楚、配料看得见、营养信息一览、品牌与产地清楚、包装结构清楚、囤货下单更省心 and close variants. Replace it with a product-specific benefit, appetite, scene, or evidence hook.",
    "- Give each section one distinct commercial job. Do not repeat the same headline or scene; different sections may reuse a verified product fact when it supports a different shopper benefit.",
    "",
    "## Truth and compliance pass",
    "- Never invent product facts. Claims marked inference or not marketing-eligible are forbidden. Exact numbers, ingredients, specifications, packaging words, logos, and certifications must remain unchanged.",
    "- Factual copy must be directly supported by verifiedFacts, nutritionFacts, ingredients, specs, packagingDescription, or explicit user input. Sensory, scene, and emotional hooks do not require a claimSource when they do not assert a hard fact.",
    "- complianceNote is only for a supplied disclosure such as 以包装为准 or 详见包装. It must never become the headline or a selling point.",
    "",
    "## Visual planning rules",
    "- visualPrompt must begin exactly with 'Primary Prompt: ' and all substantive instructions must be Chinese. Keep it concise but concrete: subject, setting, action, camera, depth, lighting, palette role, text safe area, and fidelity constraints.",
    "- Every section must describe a real photographic scene or proof view that can directly drive image generation. Avoid generic 'high-end poster' filler.",
    "- A lifestyle_scene must specify setting, atmosphere, person or hand, physical action, product interaction, foreground/middle/background depth, framing, and lighting.",
    "- When usageScenarios exist and at least 3 hero images are requested, include at least one lifestyle_scene hero based on a supplied scenario.",
    "- Hero images need immediate thumbnail impact through dominant product/food moments, appetizing texture, decisive silhouette, depth, directional movement, or bold controlled contrast. Do not use duplicate products, magnifier insets, pointer lines, fake badges, or UI cards.",
    "- Preserve the real product, package structure, label text direction, food cross-section, ingredients, shape, count, color, and proportions. Packaging scenes must explicitly request the packaging reference rather than redesigning it.",
    "- All sections are one campaign: keep one palette family, color temperature, light quality, material rendering, and photographic grade, while varying composition, crop, lens depth, action, and accent area for impact.",
    "- styleGuide must contain exactly five HEX colors plus concise mood and visualSystem. Use product/packaging colors as the base and one controlled high-impact accent.",
    "",
    "## Structure rules",
    `- Fill exactly ${heroImageCount} distinct hero slots and ${detailSectionCount} distinct detail slots. If hard facts are exhausted, use a truthful sensory, audience, scenario, packaging, or decision angle instead of reducing count or inventing evidence.`,
    "- Data/spec sections keep exact evidence readable; scene sections keep copy secondary to the photographed moment.",
    variants && variants.length > 0
      ? `- MULTI-SPEC: use only these variants: ${variants.map((variant) => variant.name).join("、")}. Distribute useful sections across base, variant, and group scopes. A variant section uses exactly one matching variantName; a group section uses valid variantNames.`
      : "- SINGLE-SPEC: omit scope, variantName, variantNames, and groupLayout.",
    isChinese
      ? "- Chinese marketing copy must obey Advertising Law: no absolute superlatives, medical promises, unsupported certifications, or unverifiable guarantees."
      : "- Marketing copy must obey local advertising law and avoid unsupported absolute or medical claims.",
    ...(isChinese ? [adLawSection] : []),
    "",
    "## Product context",
    JSON.stringify(planningContext),
  ].join("\n");
}
