import type { HeroTemplateStructure } from "@/types/hero-template";

export function buildHeroTemplateInstruction(structure: HeroTemplateStructure): string {
  const lines: string[] = [];

  lines.push("【严格套版要求】");
  lines.push("你必须严格模仿下方参考主图的视觉规范进行生成，只替换商品主体和文案内容，其他一切视觉元素必须保持一致：");
  lines.push("");

  if (structure.overallStyle) {
    lines.push(`整体风格：${structure.overallStyle}`);
  }
  if (structure.background) {
    lines.push(`背景：${structure.background}`);
  }
  if (structure.lighting) {
    lines.push(`光照：${structure.lighting}`);
  }
  if (structure.mood) {
    lines.push(`氛围：${structure.mood}`);
  }
  if (structure.productPosition) {
    lines.push(`商品位置：${structure.productPosition}`);
  }
  if (structure.productSizeRatio) {
    lines.push(`商品大小比例：${structure.productSizeRatio}`);
  }
  if (structure.textLayout) {
    lines.push(`文字排版：${structure.textLayout}`);
  }
  if (structure.compositionNotes) {
    lines.push(`构图备注：${structure.compositionNotes}`);
  }
  if (structure.decorativeElements) {
    lines.push(`装饰元素：${structure.decorativeElements}`);
  }

  const palette = structure.colorPalette;
  if (palette) {
    lines.push("");
    lines.push("【强制配色方案】必须严格使用以下颜色，不得引入新的色相：");
    if (palette.background) lines.push(`- 背景色：${palette.background}`);
    if (palette.primary) lines.push(`- 主色：${palette.primary}`);
    if (palette.secondary) lines.push(`- 辅助色：${palette.secondary}`);
    if (palette.accent) lines.push(`- 强调色：${palette.accent}`);
    if (palette.text) lines.push(`- 文字色：${palette.text}`);
  }

  const typography = structure.typography;
  if (typography) {
    lines.push("");
    lines.push("【字体风格】必须保持一致的字体气质：");
    if (typography.heading) lines.push(`- 标题：${typography.heading}`);
    if (typography.subheading) lines.push(`- 副标题：${typography.subheading}`);
    if (typography.body) lines.push(`- 正文：${typography.body}`);
    if (typography.tags) lines.push(`- 标签/卖点：${typography.tags}`);
  }

  lines.push("");
  lines.push("参考主图已作为参考图提供。你必须保持与其一致的版式、构图、留白、层次结构和装饰风格，仅将商品替换为当前商品，文案替换为当前商品的卖点。不要改变背景、光照、色调或排版逻辑。");

  return lines.join("\n");
}
