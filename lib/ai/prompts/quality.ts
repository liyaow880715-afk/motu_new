export interface QualityScoreInput {
  sectionType: string;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  prompt: string;
  aspectRatio: string;
}

export function buildImageQualityScorePrompt(input: QualityScoreInput): string {
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
    "",
    "=== Full generation prompt used ===",
    input.prompt || "(not available)",
    "",
    "=== Scoring criteria (0-100 each) ===",
    "",
    "1. overallScore: Overall commercial quality. Would this image be usable as a finished marketplace visual without further edits?",
    "2. colorConsistencyScore: Are colors cohesive, harmonious, and consistent across the whole image? Does the palette support the product mood? Is the product color faithful and not artificially shifted?",
    "3. promptAlignmentScore: Does the image match the generation prompt? Are the requested scene, subject, style, props, lighting, and atmosphere present? Are there unexpected or missing elements?",
    "4. copyAlignmentScore: Does any text/copy inside the image match the expected section copy? Is the title/selling point/CTA present, spelled correctly, and relevant to the section goal? Score 0 if text is gibberish, garbled, or completely unrelated.",
    "5. compositionScore: Is the visual hierarchy clear? Is the product the hero? Is text legible and well placed? Are margins safe and nothing important is cropped?",
    "6. typographyScore: Are embedded texts rendered as real, readable characters in the expected language? No mirrored/gibberish glyphs, no truncated words, no overlapping lines.",
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
      analysis: "string",
    }, null, 2),
  ].join("\n");
}
