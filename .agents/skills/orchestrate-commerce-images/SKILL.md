---
name: orchestrate-commerce-images
description: 编排端到端电商图片生产，包括商品素材角色绑定、商品分析、详情页规划、中文 Primary Prompt 审核、参考图入参确认、逐 section AI 生图、包装与横切面保真质检、色调统一、定向重试和人工终审。用户要求从商品图生成完整主图/详情页、审查或重跑生图流程、解决包装文字/商品横切面失真、统一整套图片色调，或让 Codex 接管现有 Motu/摹图项目生图时使用。
---

# 编排电商图片

把 Codex 作为监督器，把项目内已有分析、规划、生图和评分 API 作为执行器。始终保存可恢复的工作流状态；不得只凭接口返回成功就判定图片合格。

## 开始前

1. 阅读 [references/workflow-contract.md](references/workflow-contract.md)，按契约维护 `workflow.json`。
2. 调用 Motu/摹图应用时阅读 [references/motu-api.md](references/motu-api.md)。
3. 规划标题、场景和审核图片前阅读 [references/commerce-qc.md](references/commerce-qc.md)。
4. 在 `artifacts/commerce-image-workflows/<project-id>/` 保存状态、API 响应、参考图、候选图和审核记录。不要提交这些运行产物。
5. 只通过 `MOTU_BASE_URL`、`MOTU_ACCESS_KEY` 或命令参数读取应用地址和访问密钥。不得把 Provider URL、API Key、项目 ID 或机器路径写入 skill。

## 执行流程

### 1. 定位项目并建立状态

确认本地服务健康，按项目名取得唯一项目。存在同名项目时展示候选项并让用户确认，不猜测 ID。

```powershell
python scripts/motu_api.py projects --name "项目名" --json-output artifacts/projects.json
python scripts/motu_api.py project --project-id PROJECT_ID --json-output artifacts/project.json
python scripts/workflow_state.py init --project-json artifacts/project.json --output artifacts/workflow.json
```

若素材尚未上传，先创建项目并使用 `upload` 命令按真实角色上传。Base64 由客户端在内存中生成，只发送给本地应用，不写进状态文件。

### 2. 绑定权威素材

逐张查看原图，不依据文件名猜内容。至少确认：

- `main`：完整商品身份、外形与主体比例。
- `angle`：补充视角，不覆盖权威横切面。
- `label`：配料、规格、合规文字和事实证据。
- `packaging`：包装形状、色块、Logo、文字方向与版式。
- `cross_section`：唯一权威横切面；锁定开口形状、皮厚、馅料颗粒、含水感和朝向。

需要横切面的 section 只能绑定一个 `cross_section` 权威图。包装出镜的 section 必须绑定 `packaging`。每个 section 的必要参考图不超过项目当前模型上限 6 张。

用 `set-asset-role` 修正自动分类，再用 `bind-section` 固化每个 section 的硬约束。运行 `validate --phase preflight`，有错误时停止生图。

### 3. 分析与规划

仅在用户明确要求重做或当前结果缺失时重新分析/规划，避免重复计费。分析后核对事实字段；不可验证的成分、功效、产地、数字和认证不得进入营销文案。

规划时：

- Primary Prompt 必须是中文，并写清真实场景、商品动作、镜头、光线、层次、标题留白和禁用项。
- 标题先给购买理由，再给事实证据；“以包装为准、详见包装”只作为角落小字。
- 先锁定整套色板、色温、主光方向、对比度和阴影密度，再让场景变化。
- 每张图只承担一个漏斗任务，避免卖点、场景、规格和 CTA 全塞进一张。

规划完成后重新拉取项目并同步状态，逐 section 查看 `inputReferenceAssets` 缩略图。计划入参与人工绑定不一致时，先修正 section 参考图，不开始生成。

### 4. 逐 section 生成

先生成一张高风险代表图，通常是包含包装或横切面的首张 HERO。该图通过后将其记录为色调锚点，再按页面顺序生成其余 section。不要一次性烧完全部候选图。

每次生成后记录：生成资产 ID、`generationMode`、实际参考图 ID、模型评分和人工视觉审核。以下任一情况都视为失败：

- `generationMode` 不是 `image_api`，或使用 SVG/本地合成作为业务成图。
- 实际入参缺少 section 的必要参考图。
- 包装轮廓、文字方向、Logo/标签版式被重绘或扭曲。
- 横切面开口、馅料、皮厚、朝向或筷子方向偏离权威图。
- 主标题无购买钩子、场景不成立、文字不准确或缩略图缺少冲击力。
- 与已接受色调锚点在色温、光线、对比度或主色面积上明显断裂。

### 5. 定向重试

先诊断失败维度，只修改导致失败的输入：

- 参考图遗漏：修正 `referenceAssetIds` 后重新生成。
- 包装/横切面失真：收紧唯一权威图和禁改约束，使用 `regenerate`，不要基于错误成图继续美化。
- 场景弱：改写 Primary Prompt 的环境、人物动作、前中后景和光线，不动事实文案。
- 标题弱：改写标题钩子、信息层级和留白，不改变商品结构。
- 色调漂移：加入已接受锚点，收紧色温、主光和色板面积比例。
- 仅局部排版问题且商品结构已通过：才使用 `edit`。

同一 section 最多连续重试 3 次。三次仍不通过时停止并向用户展示候选图、失败证据与下一步选择。

### 6. 完整页面审核

逐图通过不等于整页通过。按页面顺序展示完整详情页，检查叙事节奏、标题重复、场景多样性、色调连续性、事实一致性和包装/横切面身份。

只有用户明确确认后才能把 `approval.status` 设为 `approved`。最后运行：

```powershell
python scripts/workflow_state.py validate --state artifacts/workflow.json --phase approval
```

校验通过才算整套生图逻辑跑通；不得以脚本通过代替用户视觉审批。

## 命令职责

- `scripts/motu_api.py`：调用本地应用 API、上传素材、分析、规划、修改 section、生成、查询任务和质量分数、下载结果。
- `scripts/workflow_state.py`：初始化/同步状态、修正素材角色、绑定 section、记录候选图审核、设置最终审批并验证硬门槛。

命令参数和返回字段详见 [references/motu-api.md](references/motu-api.md)。审核维度、阈值和重试策略详见 [references/commerce-qc.md](references/commerce-qc.md)。
