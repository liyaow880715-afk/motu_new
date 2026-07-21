# 摹图 / MoTu

> 本地优先的 AI 电商内容生成与编辑工作台。

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript" />
  <img src="https://img.shields.io/badge/Prisma-6.19-2D3748?logo=prisma" />
  <img src="https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron" />
  <img src="https://img.shields.io/badge/AI-OpenAI%20Compatible-green" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" />
  <img src="https://img.shields.io/github/stars/liyaow880715-afk/motu_new?style=social" />
</p>

---

## 一句话介绍

**摹图（MoTu）** 让电商运营把“一张商品原图”直接变成：结构化详情页、多场景主图、白底图 / 规格图 / 成分图 / 营养成分表、按店铺链接组织好的 ZIP 分发包。

核心流程：**上传 → AI 分析 → AI 规划 → 人在关键节点微调 → 批量导出**。

---

## Graphify 代码图谱视角

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

## 支持能力

- 连接任意 OpenAI-compatible Provider，使用 `baseURL + apiKey`。
- 拉取 `/models`，做模型能力归一化和默认角色推荐。
- 创建商品项目并上传素材。
- 基于商品图片做结构化 AI 分析，支持多规格统一识别。
- 生成可编辑、可排序、可单独重试的 section 级详情页方案。
- 支持可选 1:1 模块：白底图、规格图、成分图、营养成分表。
- 多规格场景下，第一个变体生成后会自动存为**版式模板锚点**。
- 按 section 独立生成图片。
- 在手机模拟器中预览整张移动端长页。
- 编辑 / 重生成单个 section，保留版本历史。
- 批量主图生成，支持多张参考图与多场景任务配置。
- AI 场景裂变引擎：保留商品主体替换背景，批量生成差异化主图。
- 白底图复用：同一商品白底图只生成一次，后续场景与素材共用。
- AI 自动化工作流：上传原图后 AI 自动执行，关键阶段人工确认。
- 按店铺 / 链接自动组织 ZIP 导出。
- AI 自动审查合规、质量、一致性并输出评分。
- 规划器支持 **安全百搭** 与 **大胆撞色** 两种配色风格。

---

## 快速开始

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

然后打开 Next.js 输出的本地地址。

> 也可以不修改 `.env`，直接在页面右上角 **AI 配置** 中设置 Provider。

---

## 主要页面

| 页面 | 用途 |
|------|------|
| `/projects/new` | 创建商品项目 |
| `/projects/[id]/analysis` | 上传素材、AI 分析商品 |
| `/projects/[id]/planner` | 规划详情页结构、配色、模块 |
| `/projects/[id]/editor` | 预览、编辑、重生成、导出 |
| `/hero-workflows` | AI 自动化主图工作流 |
| `/hero-scene-generator` | 手动选择场景与文案生成主图 |
| `/hero-product-assets` | 生成白底图、规格图、成分图等 |
| `/settings/providers` | 管理 AI Provider 与模型角色 |
| `/settings/keys` | 访问密钥与使用监控 |
| `/history` | 生成与导出历史 |

---

## 技术架构

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
- **图片处理**：Sharp + Python Pillow 合成脚本

---

## 项目结构

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

## 环境变量

复制 `.env.example` 为 `.env`：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
DATABASE_URL=
STORAGE_ROOT=./storage
```

支持任意 OpenAI-compatible API。

---

## Web + Desktop

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

## 典型工作流

### 详情页工作流

1. 创建项目并上传商品原图 / 细节图 / 参考图。
2. 在 `/projects/[id]/analysis` 运行 AI 分析。
3. 在 `/projects/[id]/planner` 生成详情页结构，选择配色风格。
4. 在 `/projects/[id]/editor` 预览、编辑、重生成、导出。

### AI 自动化主图工作流

1. 打开 `/hero-workflows`。
2. 上传商品原图，点击 **创建并运行**。
3. AI 自动执行：信息识别 → 生成策略 → 白底图 → 场景底图 → 文案 → 裂变变体 → 产品素材 → 质量审查 → 导出打包。
4. 每个关键阶段暂停，检查右侧结果后点击 **继续**。
5. 最终下载按店铺 / 链接组织的 ZIP。

---

## 最近更新

### v0.10.7
- 规划器支持 **大胆撞色** 与 **安全百搭** 两种配色风格。

### v0.10.6
- 模块参考图改为**素材库多选缩略图**选择器。
- 可选 1:1 模块支持**版式模板锚点**，多规格生成更统一。

### v0.10.5
- 多规格统一识别：一次 AI 调用分析所有规格，输出对齐字段。
- 规划器保留 variant / optional 后缀，optional 模块不计入核心模块数量限制。

---

## 发展规划

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

## 注意事项

- 日志、存储数据、本地数据库不会提交到 git。
- `.env` 文件不会被提交。
- 设计为本地优先，数据默认保存在本地。
- AI 工作流涉及大量图片生成，建议配置稳定的 vision + image_gen 模型。

---

## 贡献

欢迎提交 PR 与 issue。

---

<div align="center">

**Made with ❤️ by 零禾（上海）网络科技有限公司**

让灵感落地，让回忆有形

</div>
