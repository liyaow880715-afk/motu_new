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
  detailSectionCount = 6,
  heroImageCount = 4,
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
    `Generate ${totalSections} sections total: ${heroImageCount} hero images + ${detailSectionCount} detail sections.`,
    "Return strict JSON only. No markdown.",
    "",
    "## Output format:",
    '{"styleGuide": {"colorPalette": {"background":"#F5F5F5","primary":"#1A1A1A","secondary":"#666666","accent":"#D4A574","text":"#111111"}, "typography": {"headingStyle":"editorial display sans-serif with strong weight contrast","bodyStyle":"clean sans-serif","headingFont":"PingFang SC Bold","bodyFont":"PingFang SC Regular"}, "mood":"premium calm", "visualSystem": {"lighting":"soft diffused top-left key light","colorTemperature":"neutral-warm 5200K","exposure":"bright mid-key with protected highlights","contrastLevel":"medium-high with clean blacks and soft highlight roll-off","paletteRatio":"70% background/base, 20% primary/support, maximum 10% accent","shadowStyle":"soft drop shadows with 8px blur","textureStyle":"matte paper texture, subtle grain","compositionGrid":"1080x1920, 72px margins, product 55% of frame height","typographyScale":"headline 72px bold, subheadline 42px medium, body 32px regular, CTA 38px bold","badgeStyle":"compact corner label or slim label strip; never an oversized pill or floating card","iconStyle":"thin-line icons, 2px stroke, monochrome"}}, "sections": [{"id":"...","type":"...","title":"...","goal":"...","mainTitle":"...","subTitle":"...","complianceNote":"...","visualPrompt":"...","visualMode":"poster","headlineAngle":"PRODUCT_MEMORY","titleDesign":{"layout":"split_level","alignment":"left","placement":"upper_left","emphasis":"...","lineBreakAfter":"...","maxLines":2,"panelStyle":"none"},"funnelStage":"attention|interest|trust|decision|conversion","targetShopper":"...","primaryObjection":"...","singleClaim":"...","claimSource":"...","proofDevice":"...","desiredAction":"...","platformProfile":"...","textBudget":{"headlineMaxChars":12,"sublineMaxChars":16,"badgeCount":0,"ctaAllowed":false}}]}',
    "",
    "## Section types:",
    "hero, pain_point, selling_points, scenario, detail_closeup, specs, material, comparison, brand_trust, packaging, summary, conversion, gift_scene, origin, nutrition, audience, formula, custom",
    "",
    "## Each section fields (keep concise):",
    "- id: unique string",
    "- type: section type",
    `- title: section name in ${targetLanguage}`,
    "- goal: 1-sentence design purpose",
    `- copy: marketing copy (main title + key bullets) in ${targetLanguage}`,
    `- mainTitle: the exact in-image headline in ${targetLanguage}; target 6-10 Chinese characters and never exceed textBudget.headlineMaxChars`,
    `- subTitle: optional factual reason-to-believe in ${targetLanguage}; it must directly reuse one supplied fact not already expressed by mainTitle, never paraphrase mainTitle, and stay empty when no new fact is available`,
    `- complianceNote: optional exact disclosure in ${targetLanguage}, such as 以包装为准 or 详见包装; use only when the supplied evidence requires it, never invent one`,
    "- visualPrompt: detailed image-generation prompt (photography/composition terms, 30-50 words, vertical mobile composition). Keep it in English or bilingual; the visual direction is what matters.",
    "- visualMode: one of poster, lifestyle_scene, studio, macro, data. Use lifestyle_scene for any scene-driven hero, scenario, audience, origin, or gift-use image.",
    `- headlineAngle: for hero sections use one of ${HERO_ANGLE_IDS.join(", ")}; omit it for detail sections`,
    "- titleDesign: section-level typography art direction with layout (editorial_left, editorial_center, split_level, minimal_caption), alignment (left, center, right), placement (top, upper_left, side), emphasis (one exact 2-6 character phrase from mainTitle), optional lineBreakAfter (an exact substring ending line 1), maxLines (1-3), and panelStyle (none, soft_band, label_strip).",
    "- funnelStage: one of attention, interest, trust, decision, conversion",
    "- targetShopper: one concrete shopper segment, not a broad demographic list",
    "- primaryObjection: the single purchase concern this section resolves",
    "- singleClaim: one concise claim supported by the supplied product facts",
    "- claimSource: quote the supplied fact or field that supports singleClaim; leave both fields empty when no verified claim exists",
    "- proofDevice: the visual evidence used to prove the claim (macro detail, usage demonstration, side-by-side SKU view, exact spec callout, etc.)",
    "- desiredAction: the one next action or belief this section should create",
    `- platformProfile: use ${platformLabel} and describe the placement context`,
    "- textBudget: keep the default to one headline, one optional subline, zero badges, and no CTA except conversion sections. Use badgeCount=1 only for a distinct verified trust signal that is not repeated anywhere else.",
    "",
    "## Rules:",
    "- First " + heroImageCount + " sections must be type=hero",
    "- Remaining " + detailSectionCount + " sections are detail sections",
    `- All user-facing copy (titles, bullets, headlines, CTAs) must be written in ${targetLanguage}.`,
    "- visualPrompt should emphasize concrete visual instructions: lighting, angle, composition, color treatment, and text placement.",
    "- Keep visualPrompt under 100 words total",
    "- Before returning each hero, silently draft 3 substantially different headline candidates and score them by product specificity 30%, conversion appeal 25%, fact grounding 25%, and thumbnail readability 20%. Return only the highest-scoring candidate as mainTitle.",
    "- Apply the competitor-substitution test: if a headline can be moved unchanged to mineral water, coffee, skincare, or an unrelated product, reject it. Every hero headline must contain a concrete product/category/flavor/material/form/action/fact anchor.",
    "- Reject generic slogans and close paraphrases such as 这一刻刚好需要它, 正当时, 融入日常, 好体验, 自然呈现, 品质之选, 悦享, 美好生活, 随心享, 不负美好, or 为生活加分.",
    `- Assign hero headlineAngle by commercial job in this order: ${HERO_ANGLE_IDS.map((angle, index) => `hero ${index + 1}=${angle}`).join(", ")}. If fewer heroes are requested, keep the earliest jobs but ensure one scene payoff when a lifestyle hero is present. If more slots share an angle, vary the concrete proof and syntax.`,
    "- Across the hero set, do not repeat the same opening phrase, sentence template, consumer payoff, factual proof, or subTitle. Read all hero titles together before returning JSON and rewrite collisions.",
    "- For every hero subTitle, quote one distinct item from the supplied fact whitelist verbatim. If that fact is already expressed by mainTitle, or no new verified fact exists, return an empty subTitle. A synonym or paraphrase of mainTitle is not support.",
    "- Every section must use one intentional, compact title lockup. Prefer editorial_left or split_level for posters and minimal_caption or editorial_left for lifestyle scenes. Use semantic line breaks, keep Chinese headlines to at most 2 lines by default, and never split a number from its unit or comparison sign.",
    "- mainTitle, subTitle, badge, and CTA must have distinct roles. Never repeat the same claim or number across two text elements. titleDesign.emphasis must occur verbatim inside mainTitle and should be rendered at roughly 1.25-1.35x the surrounding headline scale.",
    "- Copy hierarchy depends on headlineAngle: PRODUCT_MEMORY names a recognizable product anchor; CORE_BENEFIT translates the strongest verified feature into consumer value; SCENE_PAYOFF leads with a concrete moment plus sensory/use payoff; QUALITY_PROOF may lead with an exact verified packaging/spec/material fact; DIFFERENTIATION pairs a verified distinctive fact with a reason to choose.",
    "- Verified packaging facts and percentages may appear in mainTitle only for CORE_BENEFIT, QUALITY_PROOF, or DIFFERENTIATION when claimSource quotes the supplied evidence. Disclaimers such as '以包装标示为准' must never become mainTitle, subTitle, or promotional copy; when the supplied evidence requires one, preserve it verbatim in complianceNote for a single unobtrusive bottom-corner rendering.",
    "- Keep titleDesign.panelStyle=none for hero, poster, studio, and macro sections unless contrast truly requires a restrained band. Reserve soft_band or label_strip for controlled data/spec modules. Never request a huge white rounded rectangle, pill, UI card, dialog, or button behind a headline.",
    "- Reserve a dedicated title safe zone away from the product silhouette, packaging label, logo, hands, and visual proof. Text and its background must never cover product identity or the demonstrated action.",
    "- For visualMode=lifestyle_scene, visualPrompt MUST define a concrete setting, time or atmosphere, person/hand, physical action, product interaction, foreground/middle/background depth, camera framing, and lighting. It must describe a photographed moment, not a poster layout.",
    "- For visualMode=lifestyle_scene, use headlineAngle=SCENE_PAYOFF and write one concise title combining the actual occasion/action with a product-specific sensory or use payoff. Never replace that scene payoff with ordering, stocking, logistics, net-content, numeric, specification, packaging, or label language; verified facts belong in the optional subTitle. Use titleDesign.layout=minimal_caption or editorial_left with panelStyle=none. Keep copy in genuine negative space; do not request badges, CTA buttons, oversized percentage callouts, opaque information cards, flat solid-color backdrops, or centered studio packshots.",
    "- A lifestyle scene may change product scale and position to fit the action. Preserve product identity and page-level color grading, but do not reuse the fixed poster grid from other sections.",
    "- When usageScenarios are available and at least 3 hero images are requested, include at least one hero section with visualMode=lifestyle_scene based on a supplied usage scenario.",
    "- Give hero images distinct commercial jobs: product memory, strongest benefit, lived-in usage moment, quality/trust, and differentiation. Do not repeat the same studio composition with different copy.",
    "- Visual flow: Grab → Empathize → Trust → Convert",
    "- Each section must resolve ONE shopper objection with ONE shopper-facing idea and ONE scene or proof device. A lifestyle image may lead with an experiential benefit; factual support stays secondary. Do not combine unrelated selling points.",
    "- Claims marked as analysis_inference or not eligibleForMarketing in the context must never be used as singleClaim or marketing copy.",
    "- Hero sections should remain recognizable at thumbnail size. Create impact with dominant product scale, decisive light/dark separation, spatial depth or directional movement, and one accent color, never with oversized text, badges, pills, cards, or decorative color blocks.",
    "- Hero proof must use one clear view of the real product. Do not request magnifiers, circular insets, duplicate label crops, duplicate products, pointer lines, or comparison cards. Reserve macro crops and detail callouts for macro, detail, or data sections only.",
    `- CRITICAL: You must return EXACTLY ${heroImageCount} hero sections and ${detailSectionCount} detail sections. Do not return fewer. For multi-spec products, distribute these slots across base, variant, and group scopes so the TOTAL count matches the requested numbers. Do not leave any slot empty or use a generic placeholder.`,
    "- CRITICAL: All sections must share the SAME unified color palette and tone lock. Keep color temperature, key-light direction, exposure baseline, contrast level, shadow density, material treatment, and highlight roll-off consistent. Create visual impact by varying scene, camera height, crop, lens depth, foreground, human action, and product placement rather than changing the grade.",
    "- styleGuide.colorPalette: provide exactly 5 HEX colors (background, primary, secondary, accent, text). These colors must be harmonious and suitable for the product category and chosen style. They will be reused for every section image to guarantee page-level consistency.",
    "- styleGuide.mood: one short phrase describing the overall atmosphere (e.g. premium calm, energetic youthful, minimalist clean).",
    "- styleGuide.visualSystem: define one project-wide grading system that ALL sections follow. Include lighting, colorTemperature, exposure, contrastLevel, paletteRatio, shadowStyle, textureStyle, compositionGrid, typographyScale, badgeStyle, iconStyle, productAngle, productSizeRatio, and productPosition. Use a stable 70/20/10 color-area ratio (background/base, primary/support, accent maximum). Treat compositionGrid/productPosition as poster guidance only; lifestyle scenes may recompose freely while retaining the same grade.",
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
