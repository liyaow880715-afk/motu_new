export interface QualityScoreColorPalette {
  background?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  text?: string;
}

export interface QualityScoreInput {
  sectionType: string;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  prompt: string;
  aspectRatio: string;
  targetLanguage?: string;
  colorPalette?: QualityScoreColorPalette;
  visualSystem?: string;
  productReferenceImageUrl?: string;
  labelReferenceImageUrl?: string;
  packagingReferenceImageUrl?: string;
  toneAnchorImageUrl?: string;
  previousImageUrl?: string;
}

export function buildImageQualityScorePrompt(input: QualityScoreInput): string {
  let nextImageIndex = 2;
  const imageIndex = {
    product: input.productReferenceImageUrl ? nextImageIndex++ : null,
    label: input.labelReferenceImageUrl ? nextImageIndex++ : null,
    packaging: input.packagingReferenceImageUrl ? nextImageIndex++ : null,
    toneAnchor: input.toneAnchorImageUrl ? nextImageIndex++ : null,
    previous: input.previousImageUrl ? nextImageIndex++ : null,
  };
  const paletteLines = input.colorPalette
    ? [
        "=== Project unified color palette ===",
        `Background: ${input.colorPalette.background ?? "n/a"}`,
        `Primary: ${input.colorPalette.primary ?? "n/a"}`,
        `Secondary: ${input.colorPalette.secondary ?? "n/a"}`,
        `Accent: ${input.colorPalette.accent ?? "n/a"}`,
        `Text: ${input.colorPalette.text ?? "n/a"}`,
        "Score colorConsistencyScore lower if the generated image introduces a new hue family that conflicts with this palette or shifts the product color unnaturally.",
        "Score colorConsistencyScore lower if the background/canvas clearly deviates from the Background color above.",
        "For scenario/audience/gift_scene sections, score colorConsistencyScore lower if the environmental props/tabletop/backdrop use large areas of off-palette warm wood, sepia, or unrelated environmental colors.",
      ]
    : [];

  const visualSystemLines = input.visualSystem
    ? ["=== Project unified visual system ===", input.visualSystem, "Score promptAlignmentScore lower if lighting, shadow style, texture, or typography treatment clearly contradict this system."]
    : [];

  const productRefLines = input.productReferenceImageUrl
    ? [
        `Image 1 is the generated image under review. Image ${imageIndex.product} is the photographed physical product and highest-priority identity reference.`,
        `Use Image ${imageIndex.product} to judge whether the physical product identity, material, color, proportions, label layout, and key details are faithfully preserved.`,
      ]
    : [];
  const labelRefLines = input.labelReferenceImageUrl
    ? [
        `Image ${imageIndex.label} is the photographed physical label reference.`,
        "Use it to judge whether visible label artwork and printed text were preserved rather than recomposed. Existing words printed on the real label are product artwork, not newly added marketing copy; do not penalize their mere presence, but penalize altered, fabricated, or promoted versions.",
      ]
    : [];
  const packagingRefLines = input.packagingReferenceImageUrl
    ? [
        `Image ${imageIndex.packaging} is the real packaging reference. Follow the generation prompt to determine whether it should be visible.`,
        "When the prompt says the physical product outranks conflicting outer-packaging content, judge the carton by structural fidelity while penalizing copied conflicting branding, claims, or alternate bottle geometry.",
      ]
    : [];
  const toneAnchorLines = input.toneAnchorImageUrl
    ? [
        `Image ${imageIndex.toneAnchor} is the approved page tone anchor.`,
        `Compare Image 1 with Image ${imageIndex.toneAnchor} for color temperature, main-light direction, black level, highlight roll-off, shadow density, material response, and dominant/accent color area. Penalize visible campaign-grade drift in colorConsistencyScore even when Image 1 looks attractive alone.`,
      ]
    : [];
  const previousImageLines = input.previousImageUrl
    ? [
        `Image ${imageIndex.previous} is the immediately previous page section.`,
        `Judge whether Image 1 follows Image ${imageIndex.previous} without an abrupt warm/cool, bright/dark, black-level, or dominant-hue jump. Composition and scene should differ; color grading and light character should remain continuous.`,
      ]
    : [];

  return [
    "You are a senior visual-quality evaluator for AI-generated e-commerce images.",
    "Analyze the attached generated image and score it on the criteria below.",
    "Be critical but fair: a marketplace-ready image should score high; obvious defects should score low.",
    "",
    "=== Generation context ===",
    `Section type: ${input.sectionType}`,
    `Section title: ${input.title}`,
    `Section goal: ${input.goal}`,
    `Section copy / expected text content: ${input.copy || "(none provided)"}`,
    `Visual prompt guidance: ${input.visualPrompt || "(none provided)"}`,
    `Target aspect ratio: ${input.aspectRatio}`,
    input.targetLanguage ? `Target language for any embedded text: ${input.targetLanguage}` : "",
    "",
    ...paletteLines,
    "",
    ...visualSystemLines,
    "",
    ...productRefLines,
    ...labelRefLines,
    ...packagingRefLines,
    ...toneAnchorLines,
    ...previousImageLines,
    "",
    "=== Full generation prompt used ===",
    input.prompt || "(not available)",
    "",
    "=== Scoring criteria (0-100 each) ===",
    "",
    "1. overallScore: Overall commercial quality. Would this image be usable as a finished marketplace visual without further edits?",
    "2. colorConsistencyScore: Are colors cohesive, harmonious, and consistent across the whole image? Does the background/canvas match the project's Background color? Are primary/secondary/accent roles correctly assigned? Is the product color faithful and not artificially shifted? For scenario sections, are environmental colors kept within the palette instead of introducing off-palette wood/sepia/environmental tones?",
    "3. promptAlignmentScore: Does the image match the generation prompt? Are the requested scene, subject, style, props, lighting, and atmosphere present? Are there unexpected or missing elements?",
    "4. copyAlignmentScore: Does any text/copy inside the image match the expected section copy? Is the title/selling point/CTA present, spelled correctly, and relevant to the section goal? Score 0 if text is gibberish, garbled, or completely unrelated.",
    "5. compositionScore: Is the visual hierarchy clear? Is the product the hero? Is text legible and well placed? Are margins safe and nothing important is cropped?",
    "6. typographyScore: Are embedded texts rendered as real, readable characters in the expected language? No mirrored/gibberish glyphs, no truncated words, no overlapping lines.",
    "7. productFidelityScore: Is the product identity, silhouette, material, color, proportions, logo placement, and key details faithful to the reference image?",
    "8. packagingFidelityScore: Follow the section prompt. For non-packaging sections that forbid an outer carton, score unexpected cartons or box props low and treat their correct absence as compliant. For packaging sections, judge carton structure against the outer-packaging reference but product identity against the physical product reference. Do not reward invented barcodes, nutrition tables, licenses, certifications, or conflicting carton claims.",
    "9. factualityScore: Does the visual communicate only claims supported by the input facts and prompt? Penalize invented numbers, reviews, rankings, efficacy, urgency, or guarantees.",
    "10. complianceScore: Is the image suitable for e-commerce advertising without misleading claims, prohibited certification language, fake social proof, watermarks, or deceptive comparison?",
    "11. thumbnailScore: At mobile thumbnail size, can a shopper identify the product and the single selling point immediately?",
    "12. ocrScore: Are all required words legible and accurately rendered in the target language, with no hallucinated fine print?",
    "",
    "=== Output rules ===",
    "Return one strict JSON object only. No markdown fences, no commentary.",
    "All scores must be integers between 0 and 100.",
    "Keep analysis concise (2-4 sentences) and actionable.",
    "",
    "Target JSON shape:",
    JSON.stringify({
      overallScore: 0,
      colorConsistencyScore: 0,
      promptAlignmentScore: 0,
      copyAlignmentScore: 0,
      compositionScore: 0,
      typographyScore: 0,
      productFidelityScore: 0,
      packagingFidelityScore: 0,
      factualityScore: 0,
      complianceScore: 0,
      thumbnailScore: 0,
      ocrScore: 0,
      analysis: "string",
    }, null, 2),
  ].join("\n");
}
