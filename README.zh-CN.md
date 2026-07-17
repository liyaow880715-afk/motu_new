# 摹图 / MoTu

`摹图` 是一个本地优先的 AI 电商内容生成与编辑工作台。

它面向真实电商运营流程，支持从商品图片到详情页、主图、产品素材、批量分发的端到端工作流。

---

## 支持能力

- 连接任意 OpenAI-compatible Provider，使用 `baseURL + apiKey`
- 拉取 `/models`，做模型能力归一化和默认角色推荐
- 创建商品项目并上传素材
- 基于商品图片做结构化 AI 分析
- 生成可编辑、可排序、可单独重试的 section 级详情页方案
- 按 section 独立生成图片
- 在手机模拟器中预览整张移动端长页
- 编辑/重生成单个 section
- 保留 section 版本历史并导出 JSON / 图片
- 批量主图生成，支持多张参考图与多场景任务配置
- AI 场景裂变引擎：保留商品主体替换背景，批量生成差异化主图
- 白底图复用：同一商品白底图只生成一次，后续场景与素材共用
- 产品素材生成：白底图、规格图、成分图、营养成分表
- AI 自动化工作流：上传原图后 AI 自动执行，关键阶段人工确认
- 按店铺 / 链接自动组织 ZIP 导出
- AI 自动审查合规、质量、一致性并输出评分

---

## 技术栈

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- shadcn 风格 UI 基础组件
- Zustand
- react-hook-form + Zod
- Prisma + SQLite
- 本地文件系统存储
- OpenAI-compatible AI 适配层
- Electron + electron-builder（桌面端）
- Python + Pillow（图片合成）

---

## 项目结构

```text
app/
  api/                  # API routes
  hero-*/               # 主图、素材、工作流页面
  projects/             # 项目相关页面
  settings/             # 设置页面
components/
  analysis/             # 商品分析
  editor/               # 详情页编辑器
  layout/               # 布局组件
  projects/             # 项目组件
  shared/               # 共享组件
  ui/                   # UI 基础组件
hooks/                  # React hooks
lib/
  ai/                   # AI 适配器、提示词、输出 schema
  db/                   # Prisma client
  services/             # 业务服务
  storage/              # 本地文件存储
  utils/                # 工具函数
  validations/          # Zod 校验
prisma/                 # 数据库 schema 与迁移
scripts/                # 构建与工具脚本
desktop/                # Electron 入口
types/                  # TypeScript 类型
```

---

## 主要工作流

### 详情页工作流

1. 打开 `/settings/providers`
2. 输入 `Provider 名称 + baseURL + apiKey`
3. 测试连接
4. 发现模型并查看能力标签
5. 保存当前 Provider 和默认模型角色
6. 打开 `/projects/new` 创建商品项目
7. 上传主图、多角度图、细节图、参考图
8. 在 `/projects/[id]/analysis` 运行商品分析
9. 在 `/projects/[id]/planner` 生成详情页方案
10. 在 `/projects/[id]/editor` 编辑、重生成、导出

### AI 自动化主图工作流

1. 打开 `/hero-workflows`
2. 上传一张商品原图
3. 点击“创建并运行”
4. AI 自动执行：信息识别 → 生成策略 → 白底图 → 场景底图 → 文案 → 裂变变体 → 产品素材 → 质量审查 → 导出打包
5. 每个关键阶段自动暂停，检查或修改后点击“继续”
6. 最终下载按店铺/链接组织好的 ZIP

### 手动主图工作台

- `/hero-scene-generator`：手动选择场景、文案、排版，生成裂变主图
- `/hero-product-assets`：上传商品图，生成白底图、规格图、成分图、营养成分表
- `/hero-scenes`：管理场景库
- `/hero-copies`：管理文案库

---

## 快速开始

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

然后打开 Next.js 输出的本地地址。

### 桌面端打包

```bash
npm run build:desktop
npm run dist:win
```

---

## 环境变量

基于 `.env.example` 创建 `.env`：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
DATABASE_URL=
STORAGE_ROOT=./storage
```

也可以不修改 `.env`，直接在页面右上角“AI 配置”中设置 Provider。

---

## 近期更新

### v0.8.0

- 新增 AI 自动化工作流（人在环路）
- 支持 9 阶段流水线：信息识别、策略、白底图、场景、文案、变体、素材、审查、导出
- 新增产品素材生成页面
- 支持按店铺 / 链接自动导出 ZIP
- 白底图缓存复用

### v0.7.0

- 新增产品素材：白底图、规格图、成分图、营养成分表
- 场景裂变支持按店铺 / 链接导出

---

## 贡献

欢迎提交 PR 和 issue。

---

<div align="center">

**Made with ❤️ by 零禾（上海）网络科技有限公司**

</div>
