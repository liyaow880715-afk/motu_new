# 多规格快速开始模式设计稿

> 目标：在 motu 的快速开始流程中明确区分「单规格商品」与「多规格商品」，保证 AI 在分析、规划、生图每个阶段都不会把不同口味/规格/ SKU 混淆，并支持把多个规格组合在一张图里。

---

## 1. 术语

| 术语 | 含义 |
|------|------|
| **单规格模式** | 商品只有一款，只上传一套通用图（主图、角度、细节、包装、标签等）。 |
| **多规格模式** | 商品有 N 个口味/规格/SKU。可上传一套「基础通用图」（全家福、品牌图），每个规格再上传自己的一套图。 |
| **base / 基础分析** | 基于通用图或文字信息，输出**不带具体口味**的商品信息：通用商品名、品类、核心卖点、品牌调性。 |
| **variant / 规格分析** | 每个规格单独分析，只覆盖与该规格 visibly 不同的字段。 |
| **单规格图** | 画面中只出现某一个规格的产品/包装。 |
| **全家福图（A）** | 多个规格包装/产品按明确空间顺序整齐排列。 |
| **混合场景图（B）** | 多个规格出现在同一生动生活场景里（如桌上三盘饺子）。 |

---

## 2. 用户需求确认

1. 既需要 **A 全家福**，也需要 **B 混合场景**。  
2. 基础通用图**选填**；没有时允许用文字信息做基础分析。  
3. 最关键：生图时必须**正确把对应参考图传给 AI**，不能张冠李戴。  

---

## 3. 现状盘点

后端已经具备变体基础设施，但前端/规划/生图没有串起来：

| 能力 | 现状 | 是否够用 |
|------|------|---------|
| `ProductVariant` + `ProductAsset.variantId` | 已存在 | ✅ 直接用 |
| 上传时区分通用/规格图 | `quick-start-workspace.tsx` 已支持 | ✅ 需加上「模式」显式切换 |
| base + per-variant 分析 | `lib/services/analysis-service.ts` 已循环跑 variant 分析 | ✅ 直接用 |
| planner 感知 variants | **完全不感知** | ❌ 需改 |
| 生图按 variant 过滤参考图 | `generation-service.ts` 加载全部 `project.assets` | ❌ 需改 |
| 提示词注入规格信息 | `buildSectionImagePrompt` 没有 variant 参数 | ❌ 需改 |
| 多规格本地合成 | `image-composition-service.ts` 只会贴 packaging | ⚠️ 可能需扩展 |

---

## 4. 数据模型变更（最小化）

不需要新增表，只改现有 JSON 字段的使用约定。

### 4.1 `Project.modelSnapshot`

在创建项目时增加：

```json
{
  "mode": "single" | "multi",
  "productInfo": { ... },
  "category": "...",
  ...
}
```

### 4.2 `PageSection.editableData`

增加变体/组合元数据：

```ts
interface SectionEditableData {
  // ... existing fields
  controls?: {
    includePackaging?: boolean;
  };

  /** 单规格/规格专属 section */
  variantScope?: "base" | "variant" | "group";
  variantId?: string;                 // 当 variantScope === "variant" 时
  groupLayout?: "row" | "triangle" | "scene";
  variantIds?: string[];              // 当 variantScope === "group" 时
}
```

### 4.3 `SectionType` 枚举

现有枚举够用，不新增类型。用 `editableData.variantScope` 区分语义：

| 视觉类型 | 建议 type | variantScope |
|----------|-----------|--------------|
| 通用头图 | `HERO` | base |
| 通用卖点 | `SELLING_POINTS` | base |
| 规格头图 | `HERO` 或 `DETAIL_CLOSEUP` | variant + variantId |
| 规格细节 | `DETAIL_CLOSEUP` | variant + variantId |
| 全家福 | `HERO` 或 `COMPARISON` | group + variantIds |
| 混合场景 | `SCENARIO` | group + variantIds + scene layout |
| 规格参数对比 | `SPECS` / `COMPARISON` | group + variantIds |

如果未来需要更细的编辑器展示，可以再加 `CUSTOM` 子标签，但**先不动数据库枚举**。

---

## 5. 快速开始 UI 流程

### 5.1 步骤 0：选择模式

在 `quick-start-workspace.tsx` 顶部加一个醒目的切换：

```
[ 单规格商品 ]  [ 多规格商品 ]
```

- 默认「单规格」，界面与现在基本一致。
- 切换到「多规格」后：
  1. 显示「基础通用图（可选）」上传区：MAIN / ANGLE / DETAIL / PACKAGING / LABEL。
  2. 显示「规格/口味/SKU」列表，每个规格卡片包含：
     - 规格名称（如「玉米鲜肉水饺」）
     - 自己的 MAIN / ANGLE / DETAIL / PACKAGING / LABEL 上传区
  3. 至少填写 2 个规格才能进入下一步。

### 5.2 创建流程不变

仍然是：

1. `POST /api/projects`
2. `POST /api/projects/{id}/variants`（多规格）
3. `POST /api/projects/{id}/assets/upload`（通用图 variantId=null；规格图 variantId=...）
4. `POST /api/projects/{id}/analyze`
5. 跳转到 `/projects/{id}/analysis`

---

## 6. 分析流程

### 6.1 基础分析

- 如果用户上传了通用图：用通用图跑 `buildProductAnalysisPrompt`，得到**通用**商品名与卖点。
- 如果没有通用图：用用户在 quick-start 填写的 `productInfo` 跑 `buildTextAnalysisPrompt`，得到基础信息。

> 目标：base 分析里不出现具体口味。prompt 里明确约束：  
> "If the images show multiple variants, derive a **generic product name** and list variants separately. Do not include flavor/spec in productName."

### 6.2 规格分析

每个规格单独跑 `buildVariantAnalysisPrompt`，只传该规格的 assets。结果存到 `ProductVariant.metadata.analysis`（已存在）。

> prompt 约束：  
> "You are analyzing ONLY the **{variantName}** variant. Ignore any other variant that may appear in other images."

### 6.3 分析结果页改造

`analysis-workspace.tsx` 需要显示两层：

1. **基础分析**（可编辑）
2. **每个规格的分析卡片**（可编辑）
   - 从 `project.variants[].metadata.analysis` 读取
   - 编辑后 PATCH 到新的 `/api/projects/{id}/variants/{variantId}/analysis`

当前 UI 只编辑 `analysis.variants`（base 分析里的变体列表），这会与 `ProductVariant.metadata` 脱节。改造后：

- base 分析的 `variants` 字段仍然保留，但仅作为「规格清单」使用（名称、简短描述）。
- 每个规格的详细分析字段（keyIngredients、packagingNotes、differences 等）放到 `ProductVariant.metadata.analysis` 里。

---

## 7. 规划流程

### 7.1 planner 输入扩展

`lib/services/planner-service.ts` 的 `planSections` 加载项目时：

```ts
include: {
  analysis: true,
  variants: {
    include: { assets: true },
  },
}
```

把每个 variant 的 `name` 和 `metadata.analysis` 一起拼进规划 prompt。

### 7.2 规划 prompt 模板（关键片段）

```
商品基础信息：
- 商品名：{base.productName}
- 品类：{base.category}
- 核心卖点：...

规格列表（共 N 个）：
1. {variant[0].name}：{variant[0].analysis.description}；食材：...
2. {variant[1].name}：...

请按以下结构输出详情页规划：
- 1 张通用头图（可用全家福，展示全部规格）
- 1 个通用卖点模块
- 每个规格各 1 张规格头图
- 每个规格各 1 张规格细节/场景图
- 1 个规格对比模块
- 通用包装/物流/品牌信任模块
```

### 7.3 规划结果映射到 Section

AI 返回 JSON 后，`planner-service.ts` 把每个 planned section 映射成 `PageSection`：

| AI 输出的 section 标记 | variantScope | variantIds |
|------------------------|--------------|------------|
| `scope: "base"` | base | — |
| `scope: "variant" + variantName` | variant | 按 name 匹配到 `ProductVariant.id` |
| `scope: "group" + variantNames` | group | 按顺序匹配 ids |

如果 AI 没有显式标记 scope，多规格项目默认：
- `HERO` / `SELLING_POINTS` / `BRAND_TRUST` / `PACKAGING` → base
- 包含某个 variant 名称的 → variant
- `COMPARISON` / `SPECS` → group

---

## 8. 生图流程：正确传参考图

### 8.1 核心改动点

`lib/services/generation-service.ts` 的 `generateSectionImageInternal`：

1. 读取 `section.editableData.variantScope` 和 `variantId` / `variantIds`。
2. 根据 scope 选择候选 asset 池：

```ts
const candidateAssets =
  scope === "variant" && variantId
    ? project.assets.filter((a) => a.variantId === variantId)
    : scope === "group" && variantIds?.length
      ? project.assets.filter((a) => variantIds.includes(a.variantId ?? ""))
      : project.assets.filter((a) => a.variantId == null); // base 只用通用图
```

3. 把原来的 `pickPrimaryProductAsset(project.assets)` 改为 `pickPrimaryProductAsset(candidateAssets)`。
4. `prepareReferenceAssetsForSection` 也基于 `candidateAssets` 计算。
5. 显式引用（`referenceAssetIds`）只能来自候选池，防止用户误选其他规格图。

### 8.2 提示词防混淆约束

`buildSectionImagePrompt` 新增参数 `variantContext`，在 prompt 里追加：

#### 单规格 section

```
--- VARIANT SCOPE ---
This image must ONLY feature the variant: "{variantName}".
Use ONLY the reference images for this variant.
Do NOT show any other flavor, size, SKU, or variant.
Variant description: {variantDescription}
Variant key ingredients: {variantKeyIngredients}
```

#### 组合 section（全家福 A）

```
--- GROUP SCOPE ---
This image must feature multiple variants together in a clear layout.
Variant order and spatial positions (left-to-right): {variantNames joined}
Keep each variant visually distinct and correctly labeled.
Do NOT swap or merge flavors.
```

#### 混合场景 section（B）

```
--- SCENE GROUP SCOPE ---
This is a lifestyle scene containing multiple variants.
Place variants at distinct positions:
- {name1}: {position1}
- {name2}: {position2}
...
Each variant must remain visually identifiable and correctly matched to its described flavor/packaging.
```

### 8.3 参考图数量限制

`buildReferenceImageList` 已限制最多 4 张。对于 group section，4 张可能不够展示所有规格。处理策略：

- 全家福 A：每个规格选 1 张最代表性的（MAIN 或 PACKAGING），最多 4 个 variant。超过 4 个规格时，改用本地合成（见 9.2）。
- 混合场景 B：优先传各规格的 MAIN 图，限制 4 张；超出部分在 prompt 用文字描述。

---

## 9. 多规格组合图实现策略

### 9.1 策略 A：单规格图（最稳）

按 8.1/8.2 执行，只传一个规格的 assets。这是默认且风险最低的方案。

### 9.2 策略 A-1：全家福（一次生成 + 强布局约束）

- 候选图：每个规格选 MAIN 或 PACKAGING 各 1 张。
- prompt：明确写出排列顺序、每个位置是什么口味。
- 适用：3–4 个规格，背景简单。
- 风险：AI 可能把位置或标签搞混。

### 9.3 策略 A-2：全家福兜底（本地合成）

如果一次生成失败或规格数 > 4：

1. 为每个规格单独生成一张**透明/纯色底产品图**（复用 `WHITE_BG_PRODUCT` 流程或 `image-composition-service`）。
2. 生成一张干净的场景底图（不带产品，或只放装饰元素）。
3. 用 `sharp` / Pillow 把各规格产品图按指定布局贴到底图上。

已有代码可复用：
- `lib/services/image-composition-service.ts`：负责 packaging 贴图，可扩展为通用产品贴图。
- `scripts/hero-product-asset-compose.py`：负责白底图/表格图。

### 9.4 策略 B：混合场景

推荐**先生成场景底图，再合成产品**：

1. 用 base assets + 文字 prompt 生成一张「空场景」图（如餐桌、厨房、野餐垫）。
2. 为每个规格生成白底/透明底产品图。
3. 本地合成到场景图的指定位置，并加阴影/接触光。

原因：AI 一次画多个产品在生活中极易混淆口味/馅料；分步生成更可控。

> 第一阶段可先实现「文字 prompt + AI 一次生成」作为实验开关；如果实测混淆率高，再切到分步合成。

---

## 10. 校验与调试

### 10.1 参考图路由正确性校验

每次生成时把以下信息写入 `SectionVersion.promptSnapshot` 或日志：

```json
{
  "variantScope": "variant",
  "variantId": "...",
  "referenceAssetIds": ["..."],
  "referenceAssetTypes": ["MAIN", "PACKAGING"],
  "variantNameInPrompt": "玉米鲜肉水饺"
}
```

前端在 section 详情里展示「本次生成使用了哪些参考图 / 哪些规格」，方便用户核对。

### 10.2 AI 混淆自检

可选的轻量级 QC：

- 生成后把图再传给 vision model，问 "图中出现了哪些规格？位置是否正确？"  
- 如果识别结果与预期不符，自动标记为 `needsReview`，不自动重试（因为重试通常还是混淆）。

### 10.3 单元测试建议

- `generation-service.ts` 增加测试：给定 section.editableData.variantScope，断言返回的 referenceAssets 只包含对应 variantId 的 assets。
- `planner-service.ts` 测试：多规格项目规划后，每个 variant 至少生成 1 个 variantScope=variant 的 section。

---

## 11. 分阶段实施建议

| 阶段 | 内容 | 风险 | 优先级 |
|------|------|------|--------|
| **P0** | 快速开始加「单规格/多规格」切换；基础图选填；分析页展示 per-variant 分析并支持编辑。 | 低 | 必须先做 |
| **P1** | planner 读 variants 并生成带 `variantScope` / `variantId` 的 sections；生图服务按 scope 过滤参考图并注入 variant 提示词约束。 | 中 | 核心收益 |
| **P2** | 支持 group section（全家福 A）：AI 一次生成 + 本地合成兜底。 | 中 | 用户明确要 |
| **P3** | 支持混合场景 B：分步生成 + 本地合成；加混淆自检。 | 中高 | 后续迭代 |

建议先做到 **P1** 上线，验证单规格图不再混淆后，再做 P2/P3。

---

## 12. 需要再确认的问题（已确认的答案）

| 问题 | 用户答案 | 设计落地 |
|------|---------|---------|
| 组合图类型 | A 全家福 + B 混合场景 | P2 做 A，P3 做 B |
| 基础通用图是否必填 | 选填 | 无通用图时用文字信息做 base 分析 |
| 参考图是否正确传导 | 核心关切 | 8.1 的 candidateAssets 过滤 + prompt 约束 + 日志校验 |

---

## 14. 1:1 模块的 per-variant 生成

用户明确：多规格商品时，**成分配料表、规格参数图、白底商品图**这些 1:1 模块需要按规格数量生成。

例如 3 个规格 → 各生成 3 张：

| 模块 | 单规格模式 | 多规格模式 |
|------|-----------|-----------|
| `INGREDIENTS_TABLE` / 成分配料表 | 1 张（基础款） | **N 张**，每张对应一个规格 |
| `SPECS` / 规格参数图 | 1 张（基础款） | **N 张**，每张对应一个规格 |
| `WHITE_BG_PRODUCT` / 白底商品图 | 1 张（基础款） | **N 张**，每张对应一个规格 |
| `PACKAGING` / 包装展示 | 1 张（基础款） | 可选：N 张单规格包装图 + 1 张全家福 |

### 14.1 Section 定义

每个 per-variant 的 1:1 section：

```ts
{
  type: "INGREDIENTS_TABLE" | "SPECS" | "WHITE_BG_PRODUCT",
  variantScope: "variant",
  variantId: "...",
  title: "{variant.name} - 配料表",
  goal: "展示该规格的配料/营养成分",
  copy: "从 ProductVariant.metadata.analysis 提取",
  controls: { aspectRatio: "1:1" },
}
```

### 14.2 数据来源

| section 类型 | 数据来自 |
|-------------|---------|
| `INGREDIENTS_TABLE` | `variant.metadata.analysis.ingredients` / `nutritionFacts` / `INGREDIENT` + `NUTRITION` assets |
| `SPECS` | `variant.metadata.analysis.specs` / `packagingDescription` / `packagingNotes` |
| `WHITE_BG_PRODUCT` | variant 的 `MAIN` / `ANGLE` / `DETAIL` assets |
| `PACKAGING` | variant 的 `PACKAGING` assets |

### 14.3 planner 生成逻辑

在 `lib/services/planner-service.ts` 的 `appendDeterministicOptionalSections` 中：

```ts
if (projectMode === "multi" && project.variants.length > 0) {
  for (const variant of project.variants) {
    if (optionalSections.includes("ingredients_table")) {
      sections.push(buildVariantSection("INGREDIENTS_TABLE", variant));
    }
    if (optionalSections.includes("specs")) {
      sections.push(buildVariantSection("SPECS", variant));
    }
    if (optionalSections.includes("white_bg_product")) {
      sections.push(buildVariantSection("WHITE_BG_PRODUCT", variant));
    }
  }
} else {
  // 单规格：保持现有逻辑，每个模块只加 1 张
}
```

### 14.4 生图过滤

`WHITE_BG_PRODUCT` 和 `PACKAGING` 本来就会从 candidate assets 里取产品/包装图；加上 `variantScope=variant` 后自然只取该规格的图。

`INGREDIENTS_TABLE` / `SPECS` 需要注意：
- 如果 variant 有 `INGREDIENT` / `NUTRITION` / `PACKAGING` asset，优先作为参考图传入。
- 如果没有，但 `metadata.analysis` 里有结构化数据，直接让 AI 根据文字渲染表格，不 invent 数字。

### 14.5 UI 展示

详情页编辑器里，这些 per-variant 1:1 模块可以折叠在每个规格卡片下，或统一放在「规格素材」分组中，标题带规格名，避免用户混淆。

---

## 16. 规划页参考图上传优化

当前 `planner-workspace.tsx` 的「模块专属参考图」只支持点击按钮一次选 1 张图，需要改成：

1. **支持拖拽导入**：把图片拖到参考图区域即可上传。
2. **点击选择支持一次多选**：`<input type="file" multiple>`。
3. **批量上传**：`uploadSectionReference` 支持一次传多张，减少请求次数。

### 16.1 API 改造

`app/api/projects/[id]/sections/[sectionId]/upload-reference/route.ts` 当前只接受单文件：

```ts
const uploadSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
});
```

改为同时支持单文件和批量：

```ts
const fileSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
});

const uploadSchema = z.union([
  fileSchema,
  z.object({ files: z.array(fileSchema) }),
]);
```

后端循环保存每个文件，并一次性把生成的 asset ids append 到 `section.editableData.referenceAssetIds`。

### 16.2 UI 改造

在 `components/planner/planner-workspace.tsx` 的参考图区域：

- 外层容器加 `onDragOver` / `onDrop` 事件。
- `input` 加 `multiple` 属性。
- 拖拽/选择后遍历 `FileList`，统一调用批量上传函数。
- 上传过程中显示 loading / 进度提示。

### 16.3 与多规格模式的配合

- 如果 section 是 `variantScope=variant`，用户拖拽的图片仍然作为该 section 的专属参考图，不会自动分配到其他规格。
- 批量上传只是提高效率，参考图的作用域仍由 section 的 `variantScope` 决定。

---

## 17. 关键文件清单（P0–P1，含 1:1 per-variant + 批量参考图）

| 文件 | 改动 |
|------|------|
| `components/projects/quick-start-workspace.tsx` | 模式切换、基础图选填、多规格卡片 |
| `lib/validations/project.ts` | `projectCreateSchema` 增加 `mode` |
| `app/api/projects/route.ts` | 把 `mode` 存入 `modelSnapshot` |
| `components/analysis/analysis-workspace.tsx` | 显示/编辑 per-variant analysis |
| `app/api/projects/[id]/variants/[variantId]/analysis/route.ts` | 新增：保存规格分析 |
| `lib/services/analysis-service.ts` | 无通用图时 fallback 到 text analysis |
| `lib/services/planner-service.ts` | 加载 variants 与 metadata；AI 规划 + 1:1 per-variant section 扩展 |
| `lib/ai/prompts/planning.ts` | 增加多规格规划 prompt 片段 |
| `lib/services/generation-service.ts` | 按 `variantScope` 过滤候选 assets |
| `lib/ai/prompts/generation.ts` | 注入 variant / group scope 约束；1:1 表格用 variant 数据 |
| `types/domain.ts` | 在 `SectionPlan` / `PlannedSectionInput` 类型里补充 `variantScope` 等可选字段 |
| `components/planner/section-list.tsx` 或同层组件 | per-variant 1:1 section 分组/折叠展示 |
| `app/api/projects/[id]/sections/[sectionId]/upload-reference/route.ts` | 支持单文件 / 批量文件上传 |
| `components/planner/planner-workspace.tsx` | 参考图区域支持拖拽 + 多选 + 批量上传 |

---

*设计完成，已包含 per-variant 1:1 模块和规划页批量参考图，待确认后进入 P0/P1 实现。*
