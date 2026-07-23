import { z } from "zod";

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const sectionPlanItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  goal: z.string(),
  mainTitle: z.string().optional(),
  subTitle: z.string().optional(),
  layout: z.string().optional(),
  visualDescription: z.string().optional(),
  copy: z.string(),
  visualPrompt: z.string(),
  funnelStage: z.enum(["attention", "interest", "trust", "decision", "conversion"]).optional(),
  targetShopper: z.string().optional(),
  primaryObjection: z.string().optional(),
  singleClaim: z.string().optional(),
  claimSource: z.string().optional(),
  proofDevice: z.string().optional(),
  desiredAction: z.string().optional(),
  platformProfile: z.string().optional(),
  textBudget: z
    .object({
      headlineMaxChars: z.number().int().min(4).max(24).default(12),
      sublineMaxChars: z.number().int().min(0).max(40).default(16),
      badgeCount: z.number().int().min(0).max(2).default(1),
      ctaAllowed: z.boolean().default(false),
    })
    .optional(),
  negativePrompt: z.string().optional(),
  scope: z
    .enum(["base", "variant", "group"])
    .optional()
    .or(z.string().transform((value) => {
      const normalized = value.toLowerCase();
      if (["base", "variant", "group"].includes(normalized)) return normalized as "base" | "variant" | "group";
      return undefined;
    })),
  variantName: z.string().optional(),
  variantNames: z.array(z.string()).optional().or(
    z.string().transform((value) =>
      value
        .split(/[,，/|]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ),
  colorScheme: z
    .object({
      background: hexColorSchema.optional(),
      primary: hexColorSchema.optional(),
      secondary: hexColorSchema.optional(),
      accent: hexColorSchema.optional(),
      text: hexColorSchema.optional(),
    })
    .optional(),
  whitespaceRatio: z.number().optional(),
  editableFields: z.record(z.string(), z.any()).default({}),
});

const colorPaletteSchema = z.object({
  background: hexColorSchema.optional(),
  primary: hexColorSchema.optional(),
  secondary: hexColorSchema.optional(),
  accent: hexColorSchema.optional(),
  text: hexColorSchema.optional(),
});

const visualSystemSchema = z.object({
  lighting: z.string().optional(),
  shadowStyle: z.string().optional(),
  textureStyle: z.string().optional(),
  compositionGrid: z.string().optional(),
  typographyScale: z.string().optional(),
  badgeStyle: z.string().optional(),
  iconStyle: z.string().optional(),
  productAngle: z.string().optional(),
  productSizeRatio: z.string().optional(),
  productPosition: z.string().optional(),
});

const styleGuideSchema = z.object({
  colorPalette: colorPaletteSchema.optional(),
  typography: z
    .object({
      headingStyle: z.string().optional(),
      bodyStyle: z.string().optional(),
      headingFont: z.string().optional(),
      bodyFont: z.string().optional(),
    })
    .optional(),
  mood: z.string().optional(),
  visualSystem: visualSystemSchema.optional(),
});

export const sectionPlanOutputSchema = z
  .union([
    z.object({
      sections: z.array(sectionPlanItemSchema),
      styleGuide: styleGuideSchema.optional(),
    }),
    z.array(sectionPlanItemSchema),
    z.object({
      data: z.object({
        sections: z.array(sectionPlanItemSchema),
        styleGuide: styleGuideSchema.optional(),
      }),
    }),
    z.object({
      result: z.object({
        sections: z.array(sectionPlanItemSchema),
        styleGuide: styleGuideSchema.optional(),
      }),
    }),
  ])
  .transform((value) => {
    if (Array.isArray(value)) {
      return { sections: value, styleGuide: undefined };
    }
    if ("sections" in value) {
      return { sections: value.sections, styleGuide: value.styleGuide };
    }
    if ("data" in value) {
      return { sections: value.data.sections, styleGuide: value.data.styleGuide };
    }
    return { sections: value.result.sections, styleGuide: value.result.styleGuide };
  });

export type SectionPlanOutput = z.infer<typeof sectionPlanOutputSchema>;
