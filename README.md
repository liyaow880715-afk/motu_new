# 摹图 MoTu

> **AI 原生电商内容生成与编辑工作台**
>
> Local-first, AI-powered e-commerce content generation workspace.

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript" />
  <img src="https://img.shields.io/badge/Prisma-6.19-2D3748?logo=prisma" />
  <img src="https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron" />
  <img src="https://img.shields.io/badge/AI-OpenAI%20Compatible-green" />
  <img src="https://img.shields.io/badge/version-v0.10.17-0F8A3B" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" />
  <img src="https://img.shields.io/github/stars/liyaow880715-afk/motu_new?style=social" />
</p>

---

## 一句话介绍

**摹图（MoTu）** 让电商运营把商品主图、角度图、细节图、标签图和包装图转化为结构化详情页、多场景主图、白底图 / 规格图 / 成分图 / 营养成分表，以及按店铺链接组织好的 ZIP 分发包。

核心流程：**上传素材 → AI 商品分析 → AI 详情页规划 → 核对参考图入参 → AI 批量生图 → 质量审查 → 人工微调 → 批量导出**。

---

## 📊 Graphify 代码图谱视角

项目已通过 [graphify](https://github.com/sponsors/safishamsi) 构建代码知识图谱：

- **1351 个节点 · 3168 条边 · 87 个社区**
- 0 个导入循环
- 神节点（连接数最多的核心抽象）：`handleRouteError`、`ok`、`fail`、`cn`、`generateSectionImageInternal`、`Button`、`editSectionImage`、`getProviderAdapter`、`checkAdminOrDesktop`、`Badge`

图谱把代码聚成了 6 大核心圈层，它们正好对应摹图的 6 条业务主线：

| 圈层 | 代表文件 / 社区 | 职责 |
|------|----------------|------|
| **AI 图片生成引擎** | `generation-service.ts` | section 级图片生成、版式锚点、fidelity 控制、质量评分 |
| **AI 模型适配层** | `provider-service.ts` + `openai-compatible.ts` | Provider 发现、能力探测、模型角色分配、统一调用 |
| **详情页规划** | `planner-service.ts` + `planner-workspace.tsx` | section 规划、变体扩展、配色选择、模块编排 |
| **商品分析** | `analysis-service.ts` + `analysis-workspace.tsx` | 多规格信息抽取、卖点识别、风格标签 |
| **主图与素材** | `hero-template-service.ts` + `color-palette-service.ts` + `export-service.ts` | 白底图、场景裂变、配色、导出打包 |
| **桌面与工程** | `main.cjs` + `build-desktop.cjs` + `package.json` | Electron 桌面端、构建脚本、依赖与配置 |

> 详细的社区结构、神节点和意外连接见 [`graphify-out/GRAPH_REPORT.md`](./graphify-out/GRAPH_REPORT.md)。

---

## ✨ 核心能力

### 1. AI 商品分析
- 基于 vision 模型从商品图中提取卖点、风格、规格、成分、营养成分。
- 支持**多规格统一识别**：一次 AI 调用分析多个 SKU 变体，输出对齐字段。
- 分析始终使用用户选择的 vision 模型，并将可营销事实、包装可见事实和待核验信息分开处理。
- 对慢速视觉模型提供 300 秒请求窗口，并支持结构化结果修复与兼容回退。

### 2. 详情页规划与生成
- section 级详情页规划：头图、卖点、场景、规格、成分、对比、品牌信任等模块。
- 模块可拖拽排序、可单独编辑文案 / 参考图 / visual prompt、可单独重生成。
- 支持**可选 1:1 模块**：白底商品图、规格参数图、成分配料表。
- 多规格场景下，第一个变体生成后会自动存为**版式模板锚点**，后续变体继承同一版式与字体层级。
- 规划结果包含具体场景、镜头、标题层级和合规角标，不再只生成抽象风格词。
- 规划页显示批量生成总进度、成功/失败数量、最近一次实际参考图入参，以及下次生成计划入参。

### 3. 主图工作流
- 上传商品主图与补充参考图，生成 5 个不同商业任务的主图角度。
- AI 同时负责商品、场景、光影和标题设计；业务图片默认不使用本地合成。
- 标题候选经过商品相关性、事实依据、转化价值和缩略图可读性筛选。
- 成功结果在任务进行中即时回显，并提供逐张进度、失败原因和质量评分。

### 4. 产品素材生成
- 白底商品图（1:1）
- 规格参数图（1:1）
- 成分 / 配料表（1:1）
- 营养成分表（1:1）

### 5. 配色与风格
- 根据商品图自动提取主色，生成 3–5 套和谐配色方案。
- 支持 **安全百搭** 与 **大胆撞色** 两种风格切换。
- 选中配色后，所有模块锁定色温、主光方向、曝光、阴影密度和颜色面积比例；不同场景仍可保留视觉冲击力。

### 6. 多模型接入
- 任意 OpenAI-compatible Provider（baseURL + apiKey）。
- 自动探测模型能力：vision / image_gen / image_edit / structured_output。
- 文本分析/规划模型和生图模型可分别配置；推荐为各角色显式选择模型。
- `gpt-image-2` 参考图生成使用 `images` 入参和 `input_fidelity: high`。
- 支持 Web 端与 Electron 桌面端。

### 7. 人在环路（Human-in-the-Loop）
- AI 自动化工作流在每个关键阶段自动暂停，等待人工确认或修改。
- 模块版本历史、一键回滚、重新生成。

### 8. 导出与分发
- 图片、JSON、DOCX、ZIP 多格式导出。
- 自动按 **店铺 → 链接 → 主图 → 素材图** 组织文件夹。

### 9. 参考图与商品保真
- 单次生图最多发送 **6 张参考图**，支持远程 URL 和 `data:image/...;base64,...` Data URL。
- 商品主图、角度图和细节图优先锁定瓶型 / 包装形态、标签图案与商品身份。
- 包装图始终交给 AI：非包装模块只将其作为产品系列上下文，不让外箱出镜；包装模块只参考外箱结构、色块和陈列关系。
- 实拍标签上的文字按图像纹理保留，不将标签小字重新排版成营销标题。
- 生活场景模块不继承海报模板、相邻模块图片或风格锚点，避免场景提示被版式参考覆盖。
- 默认关闭 SVG 兜底；只有用户在规划页主动开启后，图片接口失败时才允许生成 SVG 预览。

### 10. Codex 监督式电商生图
- 仓库内置 [`$orchestrate-commerce-images`](./.agents/skills/orchestrate-commerce-images/SKILL.md) skill，其他 Codex 打开或克隆仓库后可自动发现。
- Codex 作为监督器调用现有分析、规划、生图和评分 API，不重复实现模型调用或在 skill 中保存 Provider 密钥。
- 工作流固定执行素材角色确认、中文 Primary Prompt 预检、实际参考图入参核对、逐 section 视觉质检、定向重试和整页人工终审。
- 包装形态、包装文字方向、商品横切面、事实文案和整套色调是硬门槛；接口返回成功不等于图片审核通过。

---

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 创建本地配置（Windows PowerShell）
Copy-Item .env.example .env

# 3. 初始化 Prisma 客户端与数据库
npm run prisma:generate
npm run prisma:migrate

# 4. 启动开发服务器
npm run dev
```

然后打开 Next.js 输出的本地地址。Web 版如启用了访问控制，需要先输入有效激活码。

首次进入后在右上角 **AI 配置** 中填写 Provider 的 `baseURL` 与 `apiKey`，拉取 `/models`，再分别设置商品分析、详情页规划和图片生成角色。API Key 不需要写入 README 或提交到 Git。

---

## 🛠 主要页面

| 页面 | 用途 |
|------|------|
| `/projects/new` | 创建商品项目 |
| `/projects/[id]/analysis` | 上传素材、AI 分析商品 |
| `/projects/[id]/planner` | 规划详情页结构、配色、模块 |
| `/projects/[id]/editor` | 预览、编辑、重生成、导出 |
| `/hero-batch` | 批量主图分析、场景规划、生图与质量评分 |
| `/hero-workflows` | AI 自动化主图工作流 |
| `/hero-scene-generator` | 手动选择场景与文案生成主图 |
| `/hero-product-assets` | 生成白底图、规格图、成分图等 |
| `/settings/providers` | 管理 AI Provider 与模型角色 |
| `/settings/keys` | 访问密钥与使用监控 |
| `/monitor/usage` | Provider 调用、耗时和失败记录 |
| `/history` | 生成与导出历史 |

---

## 🏗 技术架构

基于 Graphify 图谱发现的 6 大核心圈层，技术栈按职责分层如下：

```
┌─────────────────────────────────────────────────────────────┐
│                        Electron 桌面端                       │
│                   (desktop/main.cjs)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Next.js 14 App Router (Web UI)                 │
│  components/  │  hooks/  │  lib/ai  │  lib/services         │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              API Routes (app/api/...)                       │
│  /projects  /sections  /assets  /variants  /palette ...     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  业务服务层（对应 Graphify 核心社区）                         │
│  generation-service     - 图片生成与版式锚点                 │
│  planner-service        - 详情页规划                         │
│  analysis-service       - 商品 AI 分析                       │
│  provider-service       - 模型能力探测与适配                 │
│  color-palette-service  - 配色提取与生成                     │
│  hero-template-service  - 主图模板与裂变                     │
│  export-service         - 导出与 ZIP 打包                    │
│  project-service        - 项目数据管理                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Prisma + SQLite（本地优先）  │  本地文件系统存储            │
└─────────────────────────────────────────────────────────────┘
```

### 技术栈

- **框架**：Next.js 14 App Router + React 18 + TypeScript 5.8
- **样式**：Tailwind CSS + Radix UI + shadcn/ui 风格组件
- **状态**：Zustand + react-hook-form + Zod
- **数据库**：Prisma 6.19 + SQLite
- **AI 层**：OpenAI-compatible 适配器，支持多 Provider / 多模型
- **桌面端**：Electron + electron-builder
- **视频**：Remotion
- **图片处理**：Sharp（缩放、裁切、格式转换与导出）；业务成图默认由 AI 完成

---

## 📦 项目结构

```text
app/                          # Next.js App Router
  api/                        # API 路由
  hero-*/                     # 主图、素材、工作流页面
  projects/                   # 项目相关页面
  settings/                   # 设置页面
components/                   # UI 组件
  analysis/                   # 商品分析
  editor/                     # 详情页编辑器
  export/                     # 导出面板
  layout/                     # 布局组件
  planner/                    # 规划器
  projects/                   # 项目组件
  shared/                     # 共享组件
  ui/                         # UI 基础组件
hooks/                        # React hooks
lib/
  ai/                         # AI 适配器、提示词、输出 schema
  db/                         # Prisma client
  services/                   # 业务服务
  storage/                    # 本地文件存储
  utils/                      # 工具函数
  validations/                # Zod 校验
prisma/                       # 数据库 schema 与迁移
remotion/                     # 视频模板与渲染脚本
desktop/                      # Electron 入口
scripts/                      # 构建与工具脚本
storage/                      # 运行时上传文件与生成结果
types/                        # TypeScript 类型
graphify-out/                 # 代码知识图谱输出
```

---

## 🔑 环境变量

复制 `.env.example` 为 `.env`：

```env
DATABASE_URL="file:./dev.db"
APP_SECRET="replace-with-your-own-long-secret"
NEXT_PRIVATE_ENCRYPTION_KEY="replace-with-your-own-long-secret"
STORAGE_ROOT=./storage
APP_RUNTIME=web
NEXT_PUBLIC_APP_NAME=摹图
ADMIN_SECRET=replace-with-your-admin-secret
# AUTH_SERVER_URL="http://localhost:4000"
```

AI Provider 不通过环境变量固定，统一在 `/settings/providers` 中管理。`AUTH_SERVER_URL` 留空时使用本地 SQLite 验证；Web 部署可指向独立验证服务。

### 生图运行边界

| 参数 | 当前默认值 | 说明 |
|------|------------|------|
| 批量生图并发 | 10 | 详情页、批量主图、场景生成和主图工作流共用 |
| 单次参考图上限 | 6 | 商品图优先，剩余槽位用于风格、模板或相邻模块 |
| 单次图片生成超时 | 360 秒 | 适配平均约 200 秒的慢速图片接口 |
| 商品分析 / 详情页规划超时 | 300 秒 | 适配慢速 vision 与推理模型 |
| 批量主图前端请求窗口 | 1200 秒 | 防止整批任务被浏览器提前中断 |
| 生成图片下载超时 | 60 秒 | 用于拉取 Provider 返回的远程结果 |

> 并发 10 是应用侧默认值，不代表 Provider 的账户并发上限。提高前应同时确认上游限流、显存队列和 503/504 情况。

---

## 💻 Web + Desktop

### Web

```bash
npm run dev
npm run build && npm run start
```

### Desktop（Windows EXE）

```bash
npm run build:desktop
npm run dist:win
```

### Desktop（macOS DMG / ZIP）

```bash
npm run build:desktop
npm run dist:mac
```

Web 与 Desktop 共用同一套 Next.js standalone 业务逻辑。

---

## 🎯 典型工作流

### Codex 监督式完整详情页工作流

1. 启动 Web 或桌面端本地服务，并在 Codex 中打开本仓库。
2. 使用 `$orchestrate-commerce-images`，指定现有项目名或上传主图、角度图、标签图、包装图和权威横切面图。
3. Codex 通过本地 API 完成分析、规划、逐 section 生成和质量分数查询，并把可恢复状态保存在 `artifacts/commerce-image-workflows/<project-id>/`。
4. 每张候选图核对实际参考图 ID、包装/横切面保真、中文标题钩子、场景成立性和色调锚点；失败时只针对失败维度重试。
5. 按页面顺序展示完整详情页，只有用户明确确认后才把工作流标记为通过。

可先运行不调用真实 Provider 的自测：

```bash
python .agents/skills/orchestrate-commerce-images/scripts/motu_api.py self-test
python .agents/skills/orchestrate-commerce-images/scripts/workflow_state.py self-test
```

### 详情页工作流

1. 创建项目，按素材角色上传主图、角度图、细节图、标签图和包装图。
2. 在 `/projects/[id]/analysis` 选择 vision 模型并运行商品分析，核对事实字段。
3. 在 `/projects/[id]/planner` 生成详情页结构，选择配色，并逐个检查场景、标题和参考图缩略图。
4. 启动批量生成，通过进度面板观察排队、生成、成功和失败状态。
5. 生成后核对“最近生成实际入参”；如系统模板更新，规划页会另行展示“下次生成计划入参”。
6. 在 `/projects/[id]/editor` 预览完整长页，按模块编辑、重生成、回滚和导出。

### AI 自动化主图工作流

1. 打开 `/hero-workflows`。
2. 上传商品原图，点击 **创建并运行**。
3. AI 自动执行：信息识别 → 生成策略 → 商品资产 → 场景与文案 → 主图变体 → 产品素材 → 质量审查 → 导出打包。
4. 每个关键阶段暂停，检查右侧结果后点击 **继续**。
5. 最终下载按店铺 / 链接组织的 ZIP。

---

## 🆕 最近更新

### Unreleased
- 新增仓库级 Codex 电商生图编排 skill，提供参考图契约、中文 Prompt 预检、视觉硬门槛、定向重试和最终人工审批。
- 新增无第三方依赖的本地 API 客户端和可恢复工作流状态校验脚本；不包含固定项目 ID、机器路径、Provider URL 或 API Key。

### v0.10.17
- 恢复并加强老版电商标题钩子、真实消费场景和视觉冲击力策略，同时锁定整套图的色温、主光和色板关系。
- 加强包装、标签与唯一权威横切面参考图约束，记录实际参考图入参并阻止冲突素材平均横切面形态。
- 优化商品分析与详情页规划速度，Primary Prompt 统一为中文，并完善相关回归测试。

### v0.10.16
- 修复 Windows 桌面端误用业务首页作为启动探针导致的 500 启动失败。
- 增加无数据库依赖的 `/api/health`，并完善 Next.js 启动日志、超时诊断与失败进程清理。

### v0.10.15
- 重构详情页与批量主图的电商提示词：强化真实场景、标题设计、事实白名单和整页色调一致性。
- 商品/角度/细节/标签/包装图全部作为 AI 参考输入，默认不做本地包装合成。
- 规划页区分“最近生成实际入参”和“下次生成计划入参”，并修正生活场景与自动模板的确认状态。
- 统一批量生图并发为 10，图片请求超时提高到 360 秒，批量主图前端请求窗口提高到 1200 秒。
- `gpt-image-2` 启用多参考图 `images` 入参与高保真模式。

### v0.10.14
- 商品分析固定使用所选 vision 模型，并将分析请求窗口提高到 300 秒。

### v0.10.13
- 修正批量主图参考图丢失问题，加强商品主体、横切面、标签和包装形态保真。

### v0.10.12
- 批量主图进行中即时显示已经成功返回的图片。

### v0.10.11
- 增加批量生成进度、参考图缩略图与生成后实际入参追踪。

### v0.10.7
- 规划器支持 **大胆撞色** 与 **安全百搭** 两种配色风格。

### v0.10.6
- 模块参考图改为**素材库多选缩略图**选择器。
- 可选 1:1 模块支持**版式模板锚点**，多规格生成更统一。

### v0.10.5
- 多规格统一识别：一次 AI 调用分析所有规格，输出对齐字段。
- 规划器保留 variant / optional 后缀，optional 模块不计入核心模块数量限制。

---

## 📌 Roadmap

- [x] AI 商品分析与详情页生成
- [x] 多规格 / 变体详情页生成
- [x] 批量主图与场景裂变
- [x] 产品素材生成（白底图 / 规格图 / 成分图 / 营养成分表）
- [x] AI 自动化工作流 + 人在环路
- [x] 按店铺 / 链接自动导出
- [ ] 一键上传到拼多多 / 淘宝店铺后台
- [ ] 模板市场
- [ ] 多人协作
- [ ] 云端版本

---

## ⚠️ 注意事项

- 日志、存储数据、本地数据库不会提交到 git。
- `.env` 文件不会被提交。
- 设计为本地优先，数据默认保存在本地。
- AI 工作流涉及大量图片生成，建议分别配置稳定的 vision 与 image_gen 模型。
- Provider 返回 503/504 时优先降低并发并重试；单张约 200 秒的接口不应使用 60–120 秒的默认代理超时。
- 图片模型仍可能轻微重绘瓶身小字、背标和包装文字，发布前必须人工审核商品身份与合规信息。

---

## 📖 多语言文档

- English：[README.en.md](./README.en.md)
- 简体中文：[README.zh-CN.md](./README.zh-CN.md)

---

## 🤝 贡献

PRs and issues are welcome.  
欢迎提交 PR 与 issue。

---

## ⭐ Support

If you like this project, give it a star ⭐  
如果你觉得这个项目不错，欢迎点个 Star ⭐

## Star History

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://api.star-history.com/svg?repos=liyaow880715-afk/motu_new&type=Date&theme=dark"
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://api.star-history.com/svg?repos=liyaow880715-afk/motu_new&type=Date"
  />
  <img
    alt="Star History Chart"
    src="https://api.star-history.com/svg?repos=liyaow880715-afk/motu_new&type=Date"
  />
</picture>

<div align="center">

**Made with ❤️ by 零禾（上海）网络科技有限公司**

让灵感落地，让回忆有形

</div>
