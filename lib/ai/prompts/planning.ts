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
import { HERO_ANGLE_IDS } from "@/lib/ai/prompts/hero-angles";

const sectionTypeGuide = Object.entries(sectionTypeLabels)
  .map(([key, label]) => `${key}=${label}`)
  .join(", ");

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

  const planningContext = {
    productName: analysis.productName,
    category: analysis.category,
    subcategory: analysis.subcategory,
    styleTags: analysis.styleTags.slice(0, 6),
    targetAudience: analysis.targetAudience.slice(0, 4),
    usageScenarios: analysis.usageScenarios.slice(0, 4),
    coreSellingPoints: analysis.coreSellingPoints.slice(0, 6),
    factClaims: ((analysis as ProductAnalysisOutput & { factClaims?: unknown[] }).factClaims ?? []).slice(0, 12),
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

  const isChinese = normalizeContentLanguage(contentLanguage) === "zh-CN";

  return [
    "You are a senior e-commerce detail-page strategist.",
    `Platform: ${platformLabel} | Style: ${styleLabel} | Language: ${targetLanguage}`,
    `Plan up to ${totalSections} core sections: up to ${heroImageCount} hero images + up to ${detailSectionCount} detail sections.`,
    "Return fewer sections when the supplied evidence cannot support another distinct shopper objection, purchase hook, scene, or proof device. Never pad the plan with filler.",
    "Return strict JSON only. No markdown.",
    "",
    "## Output format:",
    '{"styleGuide":{"colorPalette":{"background":"#F4EFE6","primary":"#173D2B","secondary":"#E8B23A","accent":"#E95A32","text":"#172019"},"typography":{"headingStyle":"中文商业展示字","bodyStyle":"清晰无衬线","headingFont":"PingFang SC Bold","bodyFont":"PingFang SC Regular"},"mood":"清新有冲击力","visualSystem":{"lighting":"定向商业主光","colorTemperature":"统一暖中性","exposure":"主体明亮且高光受控","contrastLevel":"鲜明焦点对比","paletteRatio":"品牌色主导、强调色克制扩展","shadowStyle":"自然接触阴影","textureStyle":"真实材质"}},"sections":[{"id":"hero_01","type":"hero","title":"内部模块名","goal":"消费者反应","copy":"成图文案","titleCandidates":[{"headline":"购买钩子","subline":"事实副线","evidenceKey":"事实原文或空","productSpecificityScore":82,"conversionScore":86,"factGroundingScore":90,"thumbnailReadabilityScore":88}],"supportingPoints":[],"complianceNote":"","visualPrompt":"Primary Prompt: 中文场景与摄影指令","visualMode":"poster","headlineAngle":"CORE_BENEFIT","titleDesign":{"layout":"editorial_left","alignment":"left","placement":"upper_left","maxLines":2,"panelStyle":"none"},"funnelStage":"attention","targetShopper":"具体人群","primaryObjection":"单一顾虑","singleClaim":"单一事实或空","claimSource":"事实原文或空","proofDevice":"视觉证据","desiredAction":"下一认知","platformProfile":"投放位置","textBudget":{"headlineMaxChars":14,"sublineMaxChars":22,"badgeCount":0,"ctaAllowed":false}}]}',
    "",
    "## Section types:",
    "hero, pain_point, selling_points, scenario, detail_closeup, specs, material, comparison, brand_trust, packaging, summary, conversion, gift_scene, origin, nutrition, audience, formula, custom",
    "",
    "## Each section fields (keep concise):",
    "- id: unique string",
    "- type: section type",
    `- title: a short internal section name in ${targetLanguage}; it helps editors identify the module and does not need to be rendered literally`,
    "- goal: one sentence describing the intended shopper response and visual selling idea",
    `- copy: the actual in-image commercial copy in ${targetLanguage}: one concise headline plus 1-3 short selling points or a restrained CTA when useful. Write it from the real product benefit, usage desire, quality proof, or differentiating reason to buy`,
    `- mainTitle: the exact strongest in-image headline in ${targetLanguage}; normally 6-14 Chinese characters, concise and commercial. It may be benefit-led, sensory, scene-led, emotional, or proof-led as long as it fits the actual product`,
    `- subTitle: optional short support line in ${targetLanguage}. It may explain the benefit or provide a reason-to-believe; any factual claim, number, ingredient, process, or specification must quote supplied evidence exactly`,
    "- titleCandidates: exactly 3 genuinely different compact candidates. Each candidate contains only headline, optional subline, evidenceKey, and four 0-100 scores. Do not repeat scene, compliance, emphasis, line-break, or layout fields inside candidates; those belong to the section. evidenceKey is the exact primary verified fact used by that candidate, or empty for scene/sensory/emotional hooks.",
    `- supportingPoints: 0-3 exact short supporting lines in ${targetLanguage}. Do not repeat the selected headline or subline and do not add facts outside the supplied evidence.`,
    `- complianceNote: optional exact disclosure in ${targetLanguage}, such as 以包装为准 or 详见包装; use only when the supplied evidence requires it, never invent one`,
    `- visualPrompt: a detailed Chinese image-generation prompt. It MUST begin with "Primary Prompt: " and all substantive instructions MUST be written in Chinese. Do not add an English Prompt. Keep essential photography terms such as 85mm, macro, rim light, depth of field, or top-down only as short parenthetical supplements when useful.`,
    "- visualMode: one of poster, lifestyle_scene, studio, macro, data. Use lifestyle_scene for any scene-driven hero, scenario, audience, origin, or gift-use image.",
    `- headlineAngle: for hero sections choose the closest commercial role from ${HERO_ANGLE_IDS.join(", ")}; use it only to diversify selling jobs, never as a rigid writing template`,
    "- titleDesign: lightweight typography art direction. Suggest layout, alignment, placement, one optional emphasis phrase, and an optional semantic line break, but let the image model adapt scale and rhythm to the final composition.",
    "- funnelStage: one of attention, interest, trust, decision, conversion",
    "- targetShopper: one concrete shopper segment, not a broad demographic list",
    "- primaryObjection: the single purchase concern this section resolves",
    "- singleClaim: one concise claim supported by the supplied product facts",
    "- claimSource: quote the supplied fact or field that supports singleClaim; leave both fields empty when no verified claim exists",
    "- proofDevice: the visual evidence used to prove the claim (macro detail, usage demonstration, side-by-side SKU view, exact spec callout, etc.)",
    "- desiredAction: the one next action or belief this section should create",
    `- platformProfile: use ${platformLabel} and describe the placement context`,
    "- textBudget: prefer one headline, one optional subline, and no more than 1-3 short supporting points. CTA is normally reserved for conversion sections. Avoid filling the image with small text.",
    "",
    "## Rules:",
    `- Return 3-${heroImageCount} hero sections first, followed by 4-${detailSectionCount} detail sections. Aim for ${heroImageCount} + ${Math.min(detailSectionCount, 8)} when evidence is rich; reduce instead of repeating facts or inventing filler.`,
    `- All user-facing copy (titles, bullets, headlines, CTAs) must be written in ${targetLanguage}.`,
    "- visualPrompt must use Chinese to describe concrete lighting, angle, composition, color treatment, scene action, depth, and text placement.",
    "- Keep visualPrompt under 100 words total",
    "- Follow the proven legacy copy strategy: use core product benefits to attract attention, scene and sensory value to create desire, visible quality proof to build trust, and real differentiation to give a reason to choose. Do not turn internal strategy labels into consumer-facing copy.",
    "- Write like an experienced e-commerce creative director, not a product analyst. Favor a memorable selling phrase with natural spoken rhythm; avoid empty slogans, raw module names, administrative instructions, and dense parameter listings as the main headline.",
    "- For nutrition, specs, ingredients, packaging, and comparison sections, never make the shopper's checking action the headline. Reject phrases such as 清楚核对, 信息要看清, 配料清楚, 搭配明白, 数据可查, 按标签操作, or 看包装再下单. Lead with the most useful verified takeaway, ingredient character, taste/craft cue, storage/use benefit, or product-family choice; keep dense evidence in supporting copy.",
    "- Keep the title specific to the actual category, flavor, material, form, action, or shopper situation when natural, but do not force every headline into the same feature-to-benefit sentence template.",
    "- Across the page, avoid exact headline repetition and repeated opening phrases. Vary title rhythm, scene, camera, scale, and proof style so the page feels like one campaign rather than one template copied many times.",
    "- Allocate primary evidence across the page before writing. The same verified number, ingredient, process, specification, or claim may be supporting copy elsewhere, but it may be the main headline/evidenceKey of only one section.",
    "- For every titleCandidates array, score product specificity, conversion hook, fact grounding, and thumbnail readability independently. Do not give all candidates the same scores. mainTitle/subTitle must repeat the highest-quality candidate only for backward compatibility.",
    "- The section title, headline, selling points, supporting copy, and CTA should be visually designed inside the image as finished commercial artwork. Use expressive hierarchy, scale contrast, spacing, and category-appropriate typography; do not leave a blank template for later DOM text.",
    "- mainTitle, subTitle, supporting points, and CTA must have clear roles. Do not repeat the same sentence or number in multiple text elements. Preserve any requested line break only when it improves natural reading.",
    "- Disclaimers such as '以包装标示为准' must never become mainTitle, subTitle, or promotional copy. Preserve a supplied disclaimer verbatim only in complianceNote for one unobtrusive bottom-corner rendering.",
    "- Keep titleDesign.panelStyle=none by default. Use a restrained band or label strip only when it clearly improves legibility in data/spec sections; never make the headline look like an app dialog or form field.",
    "- Reserve readable space for copy without forcing every image into the same upper-left layout. Text must not cover the product identity, package label, hands, food cross-section, or the demonstrated action.",
    "- For visualMode=lifestyle_scene, visualPrompt MUST define a concrete setting, time or atmosphere, person/hand, physical action, product interaction, foreground/middle/background depth, camera framing, and lighting. It must describe a photographed moment, not a poster layout.",
    "- For visualMode=lifestyle_scene, write a concise scene or sensory headline that strengthens the photographed moment. Let the title feel integrated with the environment instead of forcing a poster grid; keep factual support secondary and use natural negative space.",
    "- A lifestyle scene may change product scale and position to fit the action. Preserve product identity and page-level color grading, but do not reuse the fixed poster grid from other sections.",
    "- When usageScenarios are available and at least 3 hero images are requested, include at least one hero section with visualMode=lifestyle_scene based on a supplied usage scenario.",
    "- Give hero images distinct commercial jobs: product memory, strongest benefit, lived-in usage moment, quality/trust, and differentiation. Do not repeat the same studio composition with different copy.",
    "- Visual flow: Grab → Empathize → Trust → Convert",
    "- Each section must resolve ONE shopper objection with ONE shopper-facing idea and ONE scene or proof device. A lifestyle image may lead with an experiential benefit; factual support stays secondary. Do not combine unrelated selling points.",
    "- Claims marked as analysis_inference or not eligibleForMarketing in the context must never be used as singleClaim or marketing copy.",
    "- Hero sections must have immediate thumbnail impact: a dominant product or food moment, decisive silhouette, appetizing texture, strong light-and-dark separation, spatial depth, directional movement, or a bold but controlled brand-color contrast. Use typography as part of the visual energy, not as a tiny caption.",
    "- Hero proof must use one clear view of the real product. Do not request magnifiers, circular insets, duplicate label crops, duplicate products, pointer lines, or comparison cards. Reserve macro crops and detail callouts for macro, detail, or data sections only.",
    `- CRITICAL: Never exceed ${heroImageCount} hero sections or ${detailSectionCount} detail sections. Do not leave a slot empty, use a generic placeholder, repeat a primary evidenceKey, or invent a module merely to hit the maximum. For multi-spec products, distribute only useful slots across base, variant, and group scopes.`,
    "- CRITICAL: All sections must feel like one campaign. Keep the same brand palette family, color temperature, material rendering, and overall photographic grade, while allowing each section to vary composition, crop, lens depth, light intensity, foreground action, and accent-color area for stronger visual impact.",
    "- styleGuide.colorPalette: provide exactly 5 HEX colors (background, primary, secondary, accent, text). These colors must be harmonious and suitable for the product category and chosen style. They will be reused for every section image to guarantee page-level consistency.",
    "- styleGuide.mood: one short phrase describing the overall atmosphere (e.g. premium calm, energetic youthful, minimalist clean).",
    "- styleGuide.visualSystem: define one recognizable campaign grade for all sections. Include lighting, colorTemperature, exposure, contrastLevel, palette roles, shadowStyle, textureStyle, and typography character. Do not impose one fixed grid, one product-size ratio, or a strict 70/20/10 formula on every image; consistency comes from color family, light quality, and material treatment, while impact comes from composition and contrast.",
    isChinese
      ? "- ALL marketing copy (title, bullets, headlines) must comply with Chinese Advertising Law: no absolute superlatives (最, 第一, 顶级, 最佳, 唯一, 根治, 治愈, 100%, etc.), no false medical claims, no unverified certifications."
      : "- ALL marketing copy must comply with local advertising law: avoid unverifiable absolute claims, false medical/health claims, and unsupported certifications.",
    "- If nutritionFacts data is provided in the context, use those exact values in the copy for specs/nutrition sections. Do not estimate, round, or invent numbers. If data is missing, omit specific numbers rather than guessing.",
    "- If ingredients are provided, include them exactly in any ingredient-related section copy. Do not invent or omit ingredients.",
    "- If specs are provided, use the exact label/value pairs in specs sections. Do not alter numeric values or units.",
    "- If packagingDescription is provided and a packaging section is generated, use it to guide the visual style but do not invent logos, text, or certifications not described.",
    variants && variants.length > 0
      ? [
          `- This product has ${variants.length} variant(s): ${variants.map((v) => `${v.name} (${v.description || "no description"})`).join(", ")}. This is a MULTI-SPEC plan.`,
          `- For multi-spec products, every section must include an additional "scope" field set to "base", "variant", or "group".`,
          `  - scope="base": common content shared by all variants (e.g. brand trust, overall summary). Do NOT include variant names in the copy.`,
          `  - scope="variant": content that should feature exactly ONE variant. Include "variantName" matching one of the known variant names, and tailor the title/copy/goal/visualPrompt to that variant's description, keyIngredients, differences, and packagingNotes.`,
          `  - scope="group": content that shows multiple variants side-by-side (e.g. comparison, specs grid). Include "variantNames" as an ordered array of variant names, and make sure the copy lists each variant distinctly.`,
          `- Variant-specific sections MUST use the corresponding variant's facts from the context. Do not reuse the same generic copy across variants.`,
        ].join("\n")
      : `- This is a SINGLE-SPEC plan. Do NOT output "scope", "variantName", or "variantNames" fields. All copy should describe the single product.`,
    ...(isChinese ? [adLawSection] : []),
    "",
    "## Context:",
    JSON.stringify(planningContext),
  ].join("\n");
}
