import { z } from "zod";

export const productAnalysisOutputSchema = z.object({
  productName: z.string(),
  category: z.string(),
  subcategory: z.string(),
  material: z.string(),
  color: z.string(),
  detectedStyle: z.string().optional(),
  styleTags: z.array(z.string()),
  targetAudience: z.array(z.string()),
  usageScenarios: z.array(z.string()),
  coreSellingPoints: z.array(z.string()),
  factClaims: z.array(
    z.object({
      claim: z.string(),
      source: z.enum(["visible_image", "user_input", "structured_data", "analysis_inference"]),
      evidence: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"]),
      confirmed: z.boolean().default(false),
      eligibleForMarketing: z.boolean().default(false),
    }),
  ).default([]),
  differentiationPoints: z.array(z.string()),
  userConcerns: z.array(z.string()),
  recommendedFocusPoints: z.array(z.string()),
  suggestedSectionPlan: z.array(
    z.object({
      type: z.string(),
      title: z.string(),
      goal: z.string(),
    }),
  ),
  adLawCategory: z.string().optional(),
  adLawRisks: z.array(
    z.object({
      field: z.string(),
      risk: z.string(),
      suggestion: z.string(),
    }),
  ).optional(),
  nutritionFacts: z.record(z.string(), z.string()).optional(),
  ingredients: z.array(z.string()).default([]),
  specs: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
    }),
  ).default([]),
  packagingDescription: z.string().optional(),
  variants: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      keyIngredients: z.array(z.string()).default([]),
      packagingNotes: z.string().optional(),
      differences: z.string().optional(),
    }),
  ).default([]),
});

export type ProductAnalysisOutput = z.infer<typeof productAnalysisOutputSchema>;
