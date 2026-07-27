/**
 * 批量主图卖点策略（5 选 1）与全局画面禁忌约束。
 *
 * 流程：
 * 1. 文字模型基于商品档案 + angle 生成 headline/subline/sceneDirective。
 * 2. 图像模型基于 style + angle 指令 + 文案 + 全局禁忌生成主图。
 */

export type HeroAngle =
  | "PRODUCT_MEMORY"
  | "CORE_BENEFIT"
  | "SCENE_PAYOFF"
  | "QUALITY_PROOF"
  | "DIFFERENTIATION";

export const HERO_ANGLE_IDS: HeroAngle[] = [
  "PRODUCT_MEMORY",
  "CORE_BENEFIT",
  "SCENE_PAYOFF",
  "QUALITY_PROOF",
  "DIFFERENTIATION",
];

const LEGACY_HERO_ANGLE_MAP: Record<string, HeroAngle> = {
  PAIN_SOLUTION: "CORE_BENEFIT",
  SCENE_TAG: "SCENE_PAYOFF",
  NUMBER_PROMISE: "QUALITY_PROOF",
  COUNTER_INTUITIVE: "DIFFERENTIATION",
  URGENCY_SOCIAL: "PRODUCT_MEMORY",
};

export interface HeroAngleDefinition {
  id: HeroAngle;
  label: string;
  copyInstruction: string;
}

export const HERO_ANGLE_DEFINITIONS: Record<HeroAngle, HeroAngleDefinition> = {
  PRODUCT_MEMORY: {
    id: "PRODUCT_MEMORY",
    label: "商品记忆",
    copyInstruction:
      "用商品名称、品类、风味、形态或包装识别点建立第一眼记忆。标题必须让消费者知道卖的是什么，不能只写抽象情绪。",
  },
  CORE_BENEFIT: {
    id: "CORE_BENEFIT",
    label: "核心利益",
    copyInstruction:
      "把最强且可验证的商品特征翻译成消费者能立即理解的使用利益或感官结果。事实是依据，利益是购买理由。",
  },
  SCENE_PAYOFF: {
    id: "SCENE_PAYOFF",
    label: "场景收益",
    copyInstruction:
      "锁定当前具体场景、动作和消费时刻，用场景触发词加即时感官或使用收益；不能写成适用于任意商品的生活方式口号。",
  },
  QUALITY_PROOF: {
    id: "QUALITY_PROOF",
    label: "品质证据",
    copyInstruction:
      "用包装、标签、配料、规格、材质或工艺中可核验的事实建立信任。数字和术语只能来自事实白名单，并说明它对消费者意味着什么。",
  },
  DIFFERENTIATION: {
    id: "DIFFERENTIATION",
    label: "差异选择",
    copyInstruction:
      "从已提供事实中提炼区别于常规选择的具体特征和选择理由，不点名贬低竞品，不制造未经证实的优越性。",
  },
};

const GENERIC_HEADLINE_PATTERNS = [
  /这一刻/,
  /刚好需要/,
  /正当时/,
  /融入日常/,
  /好体验/,
  /自然呈现/,
  /品质之选/,
  /悦享/,
  /美好生活/,
  /随心(?:享|选|用)?/,
  /不负(?:时光|美好|热爱)/,
  /为生活加分/,
  /(?:头图|主视觉|展示|说明)$/,
  /^三款.*均为\d/i,
  /(?:数据可查|配料明示|信息看清|参数清楚|规格展示)$/,
  /^(?:食用前先看|按标签|看信息区|选好.+再下单)/,
  /^(?:核心卖点|产品细节|细节特写|规格信息|规格参数|成分配料|营养成分|包装展示|品牌实力|品质保障|购买理由|白底商品图)$/,
  /^(?:清楚|一目了然|一眼看懂|放心查看|信息透明).*(?:规格|参数|成分|配料|信息|数据)$/,
  /^(?:[^，。！？]*)(?:≥|≤|=|>|<)\s*\d+(?:\.\d+)?%?$/,
];

const DISCLAIMER_COPY_PATTERN =
  /(以.*为准|详见包装|包装(?:标示|标注)(?:信息)?为准|仅供参考|具体信息(?:以.*为准|详见.*)|actual packaging|see (?:the )?pack|as (?:shown|marked) on (?:the )?pack)/i;
const INVALID_OUTPUT_PATTERN =
  /(?:\?{2,}|？{2,}|�|无法识别|不可识别|内容缺失|未提供|待补充|待明确|不能生成|暂不能|无法生成)/i;

/**
 * 全局画面禁忌（5 条），每张主图都必须遵守。
 */
export const GLOBAL_HERO_IMAGE_CONSTRAINTS = [
  "【硬性规则1】把主标题作为商业画面的设计元素，允许通过大字、错落层级、色彩和留白形成冲击力；不得遮挡商品身份、包装文字或关键卖点证据。",
  "【硬性规则2】全图只表达1个核心卖点吸引点击，不要把详情页信息堆到主图上。",
  "【硬性规则3】商品必须是第一视觉焦点并在缩略图中快速可识别；可根据卖点使用大特写、非对称构图、动态裁切、场景互动或前后景层次，不固定居中和单一占比。",
  "【硬性规则4】如实展示商品，与参考图保持品类、颜色、材质、造型一致，不要过度美化。",
  "【硬性规则5】背景必须服务当前场景和商品识别；允许有冲击力的品牌色对比、真实环境、空间景深、方向光和食欲感高光，但整套色调必须属于同一品牌体系。",
  "【硬性规则6】画面中的中文文案必须渲染准确、无乱码、无错别字；如果无法保证文字质量，宁可减少文字。",
].join("\n");

export function isHeroAngle(value: unknown): value is HeroAngle {
  return typeof value === "string" && (HERO_ANGLE_IDS as string[]).includes(value);
}

export function resolveHeroAngle(value: unknown, fallbackIndex = 0): HeroAngle {
  if (isHeroAngle(value)) return value;
  if (typeof value === "string" && LEGACY_HERO_ANGLE_MAP[value.toUpperCase()]) {
    return LEGACY_HERO_ANGLE_MAP[value.toUpperCase()];
  }
  return HERO_ANGLE_IDS[Math.abs(fallbackIndex) % HERO_ANGLE_IDS.length];
}

export interface HeroCopyCandidate {
  headline: string;
  subline: string;
  complianceNote: string;
  sceneDirective: string;
  emphasis: string;
  lineBreakAfter: string;
  productSpecificityScore: number;
  conversionScore: number;
  factGroundingScore: number;
  thumbnailReadabilityScore: number;
  evidenceKey: string;
}

export interface HeroCopyResult extends HeroCopyCandidate {
  angle: HeroAngle;
}

export interface HeroCopyPromptInput {
  productName: string;
  productDescription: string;
  angle: HeroAngle;
  sceneName?: string;
  sceneStyle?: string;
  factClaims?: string[];
  singleClaim?: string;
  headlineMaxChars?: number;
  sublineMaxChars?: number;
}

export function isGenericHeroHeadline(value: string): boolean {
  const normalized = value.replace(/[\s，。！？、,.!?]/g, "");
  return normalized.length === 0 || GENERIC_HEADLINE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export const isGenericCommerceHeadline = isGenericHeroHeadline;

export function isDisclaimerHeroCopy(value: string): boolean {
  return DISCLAIMER_COPY_PATTERN.test(value.trim());
}

function readCandidateScore(value: unknown): number {
  const score = Number(value);
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
}

function normalizeHeroCopyCandidate(
  raw: unknown,
  headlineMaxChars: number,
  sublineMaxChars: number,
): HeroCopyCandidate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const headline = String(record.headline ?? "").trim();
  const rawSubline = String(record.subline ?? "").trim();
  const rawComplianceNote = String(record.complianceNote ?? "").trim();
  const subline = isDisclaimerHeroCopy(rawSubline) || rawSubline === headline ? "" : rawSubline;
  const complianceNote = [rawComplianceNote, rawSubline].find((value) => isDisclaimerHeroCopy(value)) ?? "";
  if ([...headline].length < 4 || [...headline].length > headlineMaxChars) return null;
  if (INVALID_OUTPUT_PATTERN.test(headline) || INVALID_OUTPUT_PATTERN.test(subline)) return null;
  if (isDisclaimerHeroCopy(headline)) return null;
  if ([...subline].length > sublineMaxChars) return null;

  const emphasisValue = String(record.emphasis ?? "").trim();
  const lineBreakValue = String(record.lineBreakAfter ?? "").trim();
  return {
    headline,
    subline,
    complianceNote,
    sceneDirective: String(record.sceneDirective ?? "").trim(),
    emphasis:
      [...emphasisValue].length >= 2 &&
      [...emphasisValue].length <= 6 &&
      headline.includes(emphasisValue)
        ? emphasisValue
        : "",
    lineBreakAfter:
      lineBreakValue && headline.includes(lineBreakValue) && !headline.endsWith(lineBreakValue)
        ? lineBreakValue
        : "",
    productSpecificityScore: readCandidateScore(record.productSpecificityScore),
    conversionScore: readCandidateScore(record.conversionScore),
    factGroundingScore: readCandidateScore(record.factGroundingScore),
    thumbnailReadabilityScore: readCandidateScore(record.thumbnailReadabilityScore),
    evidenceKey: String(record.evidenceKey ?? "").trim(),
  };
}

function isCandidateValidForAngle(candidate: HeroCopyCandidate, angle: HeroAngle): boolean {
  if (angle !== "SCENE_PAYOFF") return true;
  if (/(?:\d|%|规格|净含量|参数|下单|备货|选购|看准|用前|包装|标签)/i.test(candidate.headline)) {
    return false;
  }
  return candidate.sceneDirective.length >= 8 && !INVALID_OUTPUT_PATTERN.test(candidate.sceneDirective);
}

export function selectHeroCopyCandidate(
  rawResult: unknown,
  input: Pick<HeroCopyPromptInput, "angle" | "headlineMaxChars" | "sublineMaxChars" | "factClaims">,
): HeroCopyResult | null {
  const selected = selectCommerceTitleCandidate(rawResult, {
    headlineMaxChars: input.headlineMaxChars,
    sublineMaxChars: input.sublineMaxChars,
    factClaims: input.factClaims,
    allowSublineWithoutFacts: true,
    candidateFilter: (candidate) => isCandidateValidForAngle(candidate, input.angle),
  });
  return selected ? { angle: input.angle, ...selected } : null;
}

function normalizeTitleKey(value: string) {
  return value.replace(/[\s，。！？、,.!?：:；;\-—_]/g, "").toLowerCase();
}

function normalizeEvidenceKey(value: string) {
  return value.replace(/[\s，。！？、,!?：:；;（）()\[\]]/g, "").toLowerCase();
}

export interface CommerceTitleSelectionOptions {
  headlineMaxChars?: number;
  sublineMaxChars?: number;
  factClaims?: string[];
  usedHeadlineKeys?: Set<string>;
  usedOpeningKeys?: Set<string>;
  usedEvidenceKeys?: Set<string>;
  allowSublineWithoutFacts?: boolean;
  candidateFilter?: (candidate: HeroCopyCandidate) => boolean;
}

export function selectCommerceTitleCandidate(
  rawResult: unknown,
  options: CommerceTitleSelectionOptions = {},
): HeroCopyCandidate | null {
  const record = rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)
    ? rawResult as Record<string, unknown>
    : {};
  const rawCandidates = Array.isArray(record.candidates) ? record.candidates : [record];
  const headlineMaxChars = Math.min(18, Math.max(4, Number(options.headlineMaxChars ?? 14)));
  const sublineMaxChars = Math.min(32, Math.max(0, Number(options.sublineMaxChars ?? 22)));
  const suppliedMarketingFacts = (options.factClaims ?? []).filter((claim) => !isDisclaimerHeroCopy(claim));
  const normalizedMarketingFacts = suppliedMarketingFacts
    .map(normalizeEvidenceKey)
    .filter(Boolean);
  const candidates = rawCandidates
    .map((candidate) => normalizeHeroCopyCandidate(candidate, headlineMaxChars, sublineMaxChars))
    .filter((candidate): candidate is HeroCopyCandidate => Boolean(candidate))
    .filter((candidate) => !isGenericCommerceHeadline(candidate.headline))
    .filter((candidate) => options.candidateFilter?.(candidate) ?? true)
    .filter((candidate) => {
      const evidenceKey = normalizeEvidenceKey(candidate.evidenceKey);
      if (evidenceKey && !normalizedMarketingFacts.some((fact) => fact.includes(evidenceKey) || evidenceKey.includes(fact))) {
        return false;
      }
      const numbers = `${candidate.headline} ${candidate.subline}`.match(/\d+(?:\.\d+)?%?/g) ?? [];
      return numbers.every((number) => suppliedMarketingFacts.some((fact) => fact.includes(number)));
    })
    .filter((candidate) => {
      const titleKey = normalizeTitleKey(candidate.headline);
      const openingKey = titleKey.length >= 6 ? titleKey.slice(0, 4) : "";
      const evidenceKey = normalizeEvidenceKey(candidate.evidenceKey || candidate.subline);
      return !options.usedHeadlineKeys?.has(titleKey) &&
        !(openingKey && options.usedOpeningKeys?.has(openingKey)) &&
        !(evidenceKey && options.usedEvidenceKeys?.has(evidenceKey));
    });
  if (candidates.length === 0) return null;

  const score = (candidate: HeroCopyCandidate) =>
    candidate.productSpecificityScore * 0.3 +
    candidate.conversionScore * 0.25 +
    candidate.factGroundingScore * 0.25 +
    candidate.thumbnailReadabilityScore * 0.2;
  const selected = [...candidates].sort((left, right) => score(right) - score(left))[0];
  const normalizedSubline = normalizeEvidenceKey(selected.subline);
  const subline = selected.subline && (
    (options.allowSublineWithoutFacts && suppliedMarketingFacts.length === 0) ||
    normalizedMarketingFacts.some((fact) => fact.includes(normalizedSubline) || normalizedSubline.includes(fact))
  )
    ? selected.subline
    : "";
  const suppliedComplianceNotes = (options.factClaims ?? []).filter(isDisclaimerHeroCopy);
  const complianceNote = suppliedComplianceNotes.includes(selected.complianceNote)
    ? selected.complianceNote
    : suppliedComplianceNotes[0] ?? "";
  const selectedEvidenceKey = normalizeEvidenceKey(selected.evidenceKey || subline);
  const selectedTitleKey = normalizeTitleKey(selected.headline);
  options.usedHeadlineKeys?.add(selectedTitleKey);
  if (selectedTitleKey.length >= 6) options.usedOpeningKeys?.add(selectedTitleKey.slice(0, 4));
  if (selectedEvidenceKey) options.usedEvidenceKeys?.add(selectedEvidenceKey);
  return { ...selected, subline, complianceNote, evidenceKey: selectedEvidenceKey };
}

/**
 * 让文字模型基于商品档案 + 策略生成主图文案（JSON）。
 */
export function buildHeroCopyPrompt(input: HeroCopyPromptInput): { systemPrompt: string; userPrompt: string } {
  const definition = HERO_ANGLE_DEFINITIONS[input.angle];
  const headlineMaxChars = Math.min(12, Math.max(4, Number(input.headlineMaxChars ?? 12)));
  const sublineMaxChars = Math.min(16, Math.max(0, Number(input.sublineMaxChars ?? 16)));
  const suppliedClaims = input.factClaims?.map((claim) => claim.trim()).filter(Boolean) ?? [];
  const complianceNotes = suppliedClaims.filter(isDisclaimerHeroCopy);
  const marketingFacts = suppliedClaims.filter((claim) => !isDisclaimerHeroCopy(claim));
  const angleDirection: Record<HeroAngle, string> = {
    PRODUCT_MEMORY: "PRODUCT_MEMORY创意方向：让消费者第一眼记住商品、品类、风味、形态或包装识别点；可以用自然、有节奏的广告语言，不要写成参数表或内部模块名。",
    CORE_BENEFIT: "CORE_BENEFIT创意方向：围绕最有吸引力的真实卖点，写出消费者能感知的口感、便利、场景价值或使用结果；不强制固定句式。",
    SCENE_PAYOFF: `SCENE_PAYOFF创意方向：保留“${input.sceneName || "当前场景"}”及所给场景动作，不要改成下单、备货、选购、看规格或物流场景。标题可以从消费时刻、动作、情绪、香气、口感或即时满足感切入；sceneDirective要延续所给环境、人物/手部动作和商品互动。`,
    QUALITY_PROOF: "QUALITY_PROOF创意方向：从事实白名单中的包装、配料、规格、材质或工艺证据建立信任；允许把证据写成简洁有力的商业标题，也可以把具体数据放在副标题。",
    DIFFERENTIATION: "DIFFERENTIATION创意方向：从已提供事实中提炼鲜明的不同点和选择理由，用消费者语言表达；不点名贬低竞品，不制造未经证实的优越性。",
  };
  const systemPrompt = [
    "你是一名资深效果电商主图文案与视觉创意策划。沿用成熟电商广告的写法：围绕核心卖点、场景欲望、品质信任或差异理由，生成自然、有记忆点、能带动画面的标题。",
    "严格输出纯 JSON，不要 markdown 代码块，字段如下：",
    '{ "candidates": [{ "headline": "主标题", "subline": "事实副标题，可空", "complianceNote": "仅在输入已提供时原样保留的合规说明，可空", "sceneDirective": "画面指令", "emphasis": "主标题内唯一强调词", "lineBreakAfter": "可空；需要两行时填写第一行末尾的原文", "productSpecificityScore": 0, "conversionScore": 0, "factGroundingScore": 0, "thumbnailReadabilityScore": 0 }] }',
    "要求：",
    `1. 一次生成恰好3个明显不同的候选。headline硬上限${headlineMaxChars}字，优先6-10字；subline硬上限${sublineMaxChars}字。`,
    "2. headline只表达一个主要购买理由。它可以利益、感官、场景、情绪或证据切入，但要让人联想到当前商品，不能只是内部模块标签或空洞口号。",
    "3. 三个候选要有明显不同的广告创意和语言节奏，不要把同一句话只换一两个词。不要强行套用统一的“特征+利益”句式。",
    "4. 禁用空泛标题：这一刻刚好需要它、正当时、融入日常、好体验、自然呈现、品质之选、悦享、美好生活、随心享、不负美好、为生活加分及其近义改写。",
    "5. subline只承担新的可验证事实，不重复或改写headline；必须直接复用营销事实白名单中的原文，没有一条不重复的可靠事实就留空。以包装为准、详见包装等免责声明不能成为headline/subline；输入中确有该原文时移入complianceNote，不得自行编造。",
    "6. 数字、比例、工艺、成分、规格、认证和功效只能来自事实白名单；不得把产品名称中的100%误写成果汁含量、功效或承诺。",
    "7. emphasis必须是headline中连续出现的2-6个字符。两行标题只能通过lineBreakAfter指定语义断点，不得改字。",
    "8. 四项分数均为0-100整数，按商品特异性30%、转化力25%、事实可信25%、缩略图可读20%严格自评；不要给三个候选相同分数。",
    "9. 禁止绝对化用语、虚假医疗/功效、未经证实的认证、销量、好评、从众、稀缺、竞品贬低或伪造优惠。",
    `10. 本次商业任务「${definition.label}」：${definition.copyInstruction}`,
    `11. ${angleDirection[input.angle]}`,
    "12. 所有字段必须是完整可读文字；禁止问号占位符、乱码、模板括号、待补充字段或无意义符号。",
  ].join("\n");

  const userPrompt = [
    `商品名称：${input.productName}`,
    `商品信息：${input.productDescription || "（无补充描述）"}`,
    `营销事实白名单：${marketingFacts.join("；") || input.singleClaim || "仅使用商品信息中可直接核验的事实"}`,
    `需原样保留的角落合规说明：${complianceNotes.join("；") || "无"}`,
    `当前场景：${input.sceneName || "通用电商主图场景"}`,
    `场景视觉：${input.sceneStyle || "以商品主体和商业任务为准"}`,
    `卖点策略：${definition.label}`,
    "请先在内部淘汰泛化表达，再输出3个候选的 JSON。",
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
    lines.push(`【主文案逐字锁定】只渲染一次「${copy.headline}」。每个字必须完全一致，禁止同义改写、增删、换序、重复或补充标点。`);
  }
  if (copy.subline) {
    lines.push(`【辅助文案逐字锁定】在主文案下方小字渲染一次「${copy.subline}」，不得改写或重复。`);
  }
  if (copy.complianceNote) {
    lines.push(`【合规说明逐字锁定】只在画面底部角落以最小可读字号渲染一次「${copy.complianceNote}」；不得强调、放大、加徽章或进入标题组。`);
  }
  if (copy.emphasis && copy.headline.includes(copy.emphasis)) {
    lines.push(`【标题强调】优先突出「${copy.emphasis}」：可结合项目强调色、字重、字号、空间节奏或与商品的构图关系形成视觉记忆；不得改字或另造重复标签。`);
  }
  if (copy.lineBreakAfter && copy.headline.includes(copy.lineBreakAfter) && !copy.headline.endsWith(copy.lineBreakAfter)) {
    const splitIndex = copy.headline.indexOf(copy.lineBreakAfter) + copy.lineBreakAfter.length;
    lines.push(`【标题断行】严格排成两行：「${copy.headline.slice(0, splitIndex)}」/「${copy.headline.slice(splitIndex)}」，不得在其他位置断开。`);
  }
  if (copy.sceneDirective) {
    lines.push(`【画面指令】${copy.sceneDirective}`);
  }
  lines.push(GLOBAL_HERO_IMAGE_CONSTRAINTS);
  return lines.join("\n");
}
