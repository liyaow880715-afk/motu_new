/**
 * 批量主图卖点策略（5 选 1）与全局画面禁忌约束。
 *
 * 流程：
 * 1. 文字模型基于商品档案 + angle 生成 headline/subline/sceneDirective。
 * 2. 图像模型基于 style + angle 指令 + 文案 + 全局禁忌生成主图。
 */

export type HeroAngle =
  | "PAIN_SOLUTION"
  | "SCENE_TAG"
  | "NUMBER_PROMISE"
  | "COUNTER_INTUITIVE"
  | "URGENCY_SOCIAL";

export const HERO_ANGLE_IDS: HeroAngle[] = [
  "PAIN_SOLUTION",
  "SCENE_TAG",
  "NUMBER_PROMISE",
  "COUNTER_INTUITIVE",
  "URGENCY_SOCIAL",
];

export interface HeroAngleDefinition {
  id: HeroAngle;
  label: string;
  copyInstruction: string;
}

export const HERO_ANGLE_DEFINITIONS: Record<HeroAngle, HeroAngleDefinition> = {
  PAIN_SOLUTION: {
    id: "PAIN_SOLUTION",
    label: "痛点加解药",
    copyInstruction:
      "用具象的用户困扰做切入，产品作为直观的解决方案。画面可采用前后对比/问题与解药对照的构图，文案只点一个痛点的解决结果。",
  },
  SCENE_TAG: {
    id: "SCENE_TAG",
    label: "场景贴标签",
    copyInstruction:
      "锁定一类明确人群和一个专属使用场景，文案使用“如果你……”句式开头，功能表达贴合该场景，不写泛泛卖点。",
  },
  NUMBER_PROMISE: {
    id: "NUMBER_PROMISE",
    label: "数字定承诺",
    copyInstruction:
      "用商品信息中已有的具体数字（时长、数量、效果等）量化承诺，承诺简短可验证。绝对不要编造商品信息里不存在的数字。",
  },
  COUNTER_INTUITIVE: {
    id: "COUNTER_INTUITIVE",
    label: "反常识好奇",
    copyInstruction:
      "基于商品事实给出一个打破固有认知的反差结论，只抛结论留悬念，引导用户去详情页找答案。",
  },
  URGENCY_SOCIAL: {
    id: "URGENCY_SOCIAL",
    label: "紧迫带从众",
    copyInstruction:
      "用限时/限量的具体数字制造错失感，搭配大众都在选择的从众暗示。限时限量数字必须来自商品信息，不允许编造。",
  },
};

/**
 * 全局画面禁忌（5 条），每张主图都必须遵守。
 */
export const GLOBAL_HERO_IMAGE_CONSTRAINTS = [
  "【硬性规则1】文字占比不超过画面的20%，只放置在边角区域，不得遮挡产品；拒绝牛皮癣式排版和标签堆砌，保持画面干净高级。",
  "【硬性规则2】全图只表达1个核心卖点吸引点击，不要把详情页信息堆到主图上。",
  "【硬性规则3】产品主体占画面70%-80%，居中突出，缩略图3秒内必须能认出产品；避开杂乱背景。",
  "【硬性规则4】如实展示商品，与参考图保持品类、颜色、材质、造型一致，不要过度美化。",
  "【硬性规则5】使用纯色或极简背景，禁止复杂、高饱和、撞色背景，背景不得抢镜。",
  "【硬性规则6】画面中的中文文案必须渲染准确、无乱码、无错别字；如果无法保证文字质量，宁可减少文字。",
].join("\n");

export function isHeroAngle(value: unknown): value is HeroAngle {
  return typeof value === "string" && (HERO_ANGLE_IDS as string[]).includes(value);
}

export function resolveHeroAngle(value: unknown, fallbackIndex = 0): HeroAngle {
  if (isHeroAngle(value)) return value;
  return HERO_ANGLE_IDS[Math.abs(fallbackIndex) % HERO_ANGLE_IDS.length];
}

export interface HeroCopyResult {
  angle: HeroAngle;
  headline: string;
  subline: string;
  sceneDirective: string;
}

/**
 * 让文字模型基于商品档案 + 策略生成主图文案（JSON）。
 */
export function buildHeroCopyPrompt(input: {
  productName: string;
  productDescription: string;
  angle: HeroAngle;
}): { systemPrompt: string; userPrompt: string } {
  const definition = HERO_ANGLE_DEFINITIONS[input.angle];
  const systemPrompt = [
    "你是一名资深电商主图文案策划。请基于商品信息，为指定卖点策略生成一条主图文案。",
    "严格输出纯 JSON，不要 markdown 代码块，字段如下：",
    '{ "headline": "≤12字的核心卖点文案", "subline": "≤16字的辅助文案，可空字符串", "sceneDirective": "≤40字的画面指令，描述构图/场景/氛围，供图像模型使用" }',
    "要求：",
    "1. headline 全图只表达1个核心卖点，短、准、有吸引力。",
    "2. 不得编造商品信息中不存在的功效、数字、限时限量信息。",
    "3. 文案面向中国消费者，口语化但有质感。",
    `4. 本次策略「${definition.label}」：${definition.copyInstruction}`,
  ].join("\n");

  const userPrompt = [
    `商品名称：${input.productName}`,
    `商品信息：${input.productDescription || "（无补充描述）"}`,
    `卖点策略：${definition.label}`,
    "请输出 JSON。",
  ].join("\n");

  return { systemPrompt, userPrompt };
}

/**
 * 把策略 + 文案组装进图像 prompt。
 */
export function buildHeroAngleImageInstruction(copy: HeroCopyResult): string {
  const definition = HERO_ANGLE_DEFINITIONS[copy.angle];
  const lines: string[] = [];
  lines.push(`【卖点策略】${definition.label}：${definition.copyInstruction}`);
  if (copy.headline) {
    lines.push(`【主文案】请在画面边角位置渲染：「${copy.headline}」`);
  }
  if (copy.subline) {
    lines.push(`【辅助文案】可在主文案下方小字渲染：「${copy.subline}」`);
  }
  if (copy.sceneDirective) {
    lines.push(`【画面指令】${copy.sceneDirective}`);
  }
  lines.push(GLOBAL_HERO_IMAGE_CONSTRAINTS);
  return lines.join("\n");
}
