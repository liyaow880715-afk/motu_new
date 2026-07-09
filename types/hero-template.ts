export interface HeroTemplateColorPalette {
  background: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
}

export interface HeroTemplateTypography {
  heading: string;
  subheading: string;
  body: string;
  tags: string;
}

export interface HeroTemplateStructure {
  overallStyle: string;
  colorPalette: HeroTemplateColorPalette;
  typography: HeroTemplateTypography;
  productPosition: string;
  productSizeRatio: string;
  textLayout: string;
  background: string;
  lighting: string;
  mood: string;
  compositionNotes: string;
  decorativeElements: string;
}

export interface HeroTemplateStyleProfile {
  overallStyle: string;
  colorPalette: string[];
  typography: HeroTemplateTypography;
}

export interface HeroTemplateRecord {
  id: string;
  name: string;
  referenceImageUrl: string;
  structureJson: HeroTemplateStructure;
  styleProfile: HeroTemplateStyleProfile;
  category: string;
  description: string | null;
  rawAnalysis: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
