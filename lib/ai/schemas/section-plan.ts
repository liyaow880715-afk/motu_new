import { z } from "zod";

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const titleDesignSchema = z.object({
  layout: z.enum(["editorial_left", "editorial_center", "split_level", "minimal_caption"]),
  alignment: z.enum(["left", "center", "right"]),
  placement: z.enum(["top", "upper_left", "side"]),
  emphasis: z.string().optional(),
  lineBreakAfter: z.string().optional(),
  maxLines: z.number().int().min(1).max(3),
  panelStyle: z.enum(["none", "soft_band", "label_strip"]),
}).optional().catch(undefined);

const titleCandidateSchema = z.object({
  headline: z.string(),
  subline: z.string().optional().default(""),
  complianceNote: z.string().optional().default(""),
  sceneDirective: z.string().optional().default(""),
  emphasis: z.string().optional().default(""),
  lineBreakAfter: z.string().optional().default(""),
  evidenceKey: z.string().optional().default(""),
  productSpecificityScore: z.coerce.number().min(0).max(100).catch(0),
  conversionScore: z.coerce.number().min(0).max(100).catch(0),
  factGroundingScore: z.coerce.number().min(0).max(100).catch(0),
  thumbnailReadabilityScore: z.coerce.number().min(0).max(100).catch(0),
});

const sectionPlanItemSchema = z.object({
  id: z.coerce.string().optional().default(""),
  type: z.coerce.string().optional().default("custom"),
  title: z.coerce.string().optional().default(""),
  goal: z.coerce.string().optional().default(""),
  mainTitle: z.string().optional(),
  subTitle: z.string().optional(),
  titleCandidates: z.array(titleCandidateSchema).max(3).optional().catch(undefined),
  supportingPoints: z.array(z.string()).max(3).optional().catch(undefined),
  complianceNote: z.string().optional(),
  layout: z.string().optional(),
  visualDescription: z.string().optional(),
  copy: z.coerce.string().optional().default(""),
  visualPrompt: z.coerce.string().optional().default(""),
  visualMode: z.enum(["poster", "lifestyle_scene", "studio", "macro", "data"]).optional().catch(undefined),
  headlineAngle: z.enum(["PRODUCT_MEMORY", "CORE_BENEFIT", "SCENE_PAYOFF", "QUALITY_PROOF", "DIFFERENTIATION"]).optional().catch(undefined),
  titleDesign: titleDesignSchema,
  funnelStage: z.enum(["attention", "interest", "trust", "decision", "conversion"]).optional().catch(undefined),
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
      badgeCount: z.number().int().min(0).max(2).default(0),
      ctaAllowed: z.boolean().default(false),
    })
    .optional()
    .catch(undefined),
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
      background: hexColorSchema.optional().catch(undefined),
      primary: hexColorSchema.optional().catch(undefined),
      secondary: hexColorSchema.optional().catch(undefined),
      accent: hexColorSchema.optional().catch(undefined),
      text: hexColorSchema.optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  whitespaceRatio: z.coerce.number().optional().catch(undefined),
  editableFields: z.record(z.string(), z.any()).default({}),
}).passthrough();

const colorPaletteSchema = z.object({
  background: hexColorSchema.optional().catch(undefined),
  primary: hexColorSchema.optional().catch(undefined),
  secondary: hexColorSchema.optional().catch(undefined),
  accent: hexColorSchema.optional().catch(undefined),
  text: hexColorSchema.optional().catch(undefined),
});

const visualSystemSchema = z.object({
  lighting: z.string().optional(),
  colorTemperature: z.string().optional(),
  mainLightDirection: z.string().optional(),
  exposure: z.string().optional(),
  blackLevel: z.string().optional(),
  contrastLevel: z.string().optional(),
  paletteRatio: z.string().optional(),
  accentRatio: z.string().optional(),
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
}).optional().catch(undefined);

export const sectionPlanOutputSchema = z
  .union([
    z.object({
      sections: z.array(sectionPlanItemSchema),
      styleGuide: styleGuideSchema,
    }).passthrough(),
    z.array(sectionPlanItemSchema),
    z.object({
      data: z.object({
        sections: z.array(sectionPlanItemSchema),
        styleGuide: styleGuideSchema,
      }).passthrough(),
    }).passthrough(),
    z.object({
      result: z.object({
        sections: z.array(sectionPlanItemSchema),
        styleGuide: styleGuideSchema,
      }).passthrough(),
    }).passthrough(),
    z.object({
      output: z.object({
        sections: z.array(sectionPlanItemSchema),
        styleGuide: styleGuideSchema,
      }).passthrough(),
    }).passthrough(),
  ])
  .transform((value) => {
    if (Array.isArray(value)) {
      return { sections: value, styleGuide: undefined };
    }
    if ("sections" in value) {
      return { sections: value.sections, styleGuide: value.styleGuide };
    }
    if ("data" in value) {
      const data = value.data as { sections: z.infer<typeof sectionPlanItemSchema>[]; styleGuide?: z.infer<typeof styleGuideSchema> };
      return { sections: data.sections, styleGuide: data.styleGuide };
    }
    if ("result" in value) {
      const result = value.result as { sections: z.infer<typeof sectionPlanItemSchema>[]; styleGuide?: z.infer<typeof styleGuideSchema> };
      return { sections: result.sections, styleGuide: result.styleGuide };
    }
    const output = value.output as { sections: z.infer<typeof sectionPlanItemSchema>[]; styleGuide?: z.infer<typeof styleGuideSchema> };
    return { sections: output.sections, styleGuide: output.styleGuide };
  });

export type SectionPlanOutput = z.infer<typeof sectionPlanOutputSchema>;
