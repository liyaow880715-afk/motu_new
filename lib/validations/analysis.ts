import { z } from "zod";

import { productAnalysisOutputSchema } from "@/lib/ai/schemas/product-analysis";

export const analysisSchema = productAnalysisOutputSchema;

export const analysisPatchSchema = z.object({
  normalizedResult: analysisSchema,
});
