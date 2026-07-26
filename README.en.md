# MoTu

> Local-first, AI-powered e-commerce content generation workspace.

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

## One-liner

**MoTu** turns a single product image into structured detail pages, multi-scene hero images, product assets (white background, spec chart, ingredient list, nutrition facts), and store/link-organized ZIP exports.

Core flow: **Upload → AI Analysis → AI Planning → Human Review → Batch Export**.

---

## Graphify Code Graph View

The project has been indexed with [graphify](https://github.com/sponsors/safishamsi):

- **1351 nodes · 3168 edges · 87 communities**
- 0 import cycles
- God nodes (most connected abstractions): `handleRouteError`, `ok`, `fail`, `cn`, `generateSectionImageInternal`, `Button`, `editSectionImage`, `getProviderAdapter`, `checkAdminOrDesktop`, `Badge`

The graph clusters the codebase into 6 core rings that match MoTu's 6 business pillars:

| Ring | Representative File / Community | Responsibility |
|------|--------------------------------|----------------|
| **AI Image Generation Engine** | `generation-service.ts` | Section-level image generation, layout anchors, fidelity control, quality scoring |
| **AI Provider Adapter** | `provider-service.ts` + `openai-compatible.ts` | Provider discovery, capability detection, model role assignment, unified calls |
| **Detail Page Planning** | `planner-service.ts` + `planner-workspace.tsx` | Section planning, variant expansion, palette selection, module orchestration |
| **Product Analysis** | `analysis-service.ts` + `analysis-workspace.tsx` | Multi-variant extraction, selling-point detection, style tags |
| **Hero & Assets** | `hero-template-service.ts` + `color-palette-service.ts` + `export-service.ts` | White-background image, scene fission, palettes, export packaging |
| **Desktop & Engineering** | `main.cjs` + `build-desktop.cjs` + `package.json` | Electron desktop, build scripts, dependencies and config |

> See [`graphify-out/GRAPH_REPORT.md`](./graphify-out/GRAPH_REPORT.md) for the full community breakdown, god nodes, and surprising connections.

---

## Capabilities

### AI Product Analysis
- Extract selling points, style tags, specs, ingredients, and nutrition facts from product images using vision models.
- **Multi-variant analysis**: analyze multiple SKU variants in one call and produce aligned fields.

### Detail Page Planning & Generation
- Section-based detail page planning: hero, selling points, scenario, specs, ingredients, comparison, brand trust, etc.
- Drag-to-reorder, per-section copy / reference image / visual prompt editing, and independent regeneration.
- **Optional 1:1 modules**: white-background product image, spec chart, ingredient table.
- For multi-variant projects, the first generated variant is saved as a **layout template anchor** so later variants inherit the same layout and typography.

### Hero Image Workflow
- Upload a source image → AI generates a white-background product shot.
- Batch-fuse the product into multiple scene backgrounds while keeping the subject intact.
- Auto-generate multiple copy and layout variants.
- White-background image is generated once and reused across scenes and assets.

### Product Assets
- White-background product image (1:1)
- Spec chart (1:1)
- Ingredient list (1:1)
- Nutrition facts (1:1)

### Color Palettes
- Extract dominant colors from product images and generate 3–5 harmonious palettes.
- Switch between **Safe** and **Bold** palette styles.
- Once selected, all generated images follow the same palette.

### Multi-Model Providers
- Connect any OpenAI-compatible provider with `baseURL + apiKey`.
- Auto-detect model capabilities: vision / image_gen / image_edit / structured_output.
- Works on both Web and Electron desktop.

### Human-in-the-Loop
- AI automated workflow pauses at every key stage for human review.
- Section version history, rollback, and regeneration.

### Codex-Supervised Commerce Images
- The repository includes the [`$orchestrate-commerce-images`](./.agents/skills/orchestrate-commerce-images/SKILL.md) skill, which other Codex instances can discover after opening or cloning the repository.
- Codex supervises the existing analysis, planning, generation, and scoring APIs; it does not duplicate provider calls or store provider credentials.
- Reference binding, Chinese Primary Prompt checks, per-section visual QA, targeted retries, and final human approval are recorded in a recoverable workflow state.
- Packaging, cross-section fidelity, factual copy, and whole-page tone consistency are hard gates; an API success response alone never approves an image.

### Export & Distribution
- Export images, JSON, DOCX, and ZIP.
- Auto-organize outputs by **store → link → hero → assets**.

---

## Quick Start

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Then open the local address printed by Next.js.

> You can also skip `.env` and set the provider directly in the **AI Config** menu at the top-right.

---

## Main Pages

| Page | Purpose |
|------|---------|
| `/projects/new` | Create a product project |
| `/projects/[id]/analysis` | Upload assets and run AI analysis |
| `/projects/[id]/planner` | Plan detail page structure, palette, and sections |
| `/projects/[id]/editor` | Preview, edit, regenerate, export |
| `/hero-workflows` | AI automated hero image workflow |
| `/hero-scene-generator` | Manually pick scenes and copy to generate hero variants |
| `/hero-product-assets` | Generate white background, spec, ingredient, and nutrition images |
| `/settings/providers` | Manage AI providers and model roles |
| `/settings/keys` | Access keys and usage monitor |
| `/history` | Generation and export history |

---

## Architecture

Based on the 6 core rings discovered by Graphify, the stack is layered by responsibility:

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Desktop                         │
│                  (desktop/main.cjs)                         │
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
│  Service Layer (Graphify core communities)                   │
│  generation-service     - image generation & layout anchors  │
│  planner-service        - detail page planning               │
│  analysis-service       - product AI analysis                │
│  provider-service       - model capability detection         │
│  color-palette-service  - color extraction & generation      │
│  hero-template-service  - hero templates & fission           │
│  export-service         - export & ZIP packaging             │
│  project-service        - project data management            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Prisma + SQLite (local-first)  │  Local filesystem storage  │
└─────────────────────────────────────────────────────────────┘
```

### Stack

- **Framework**: Next.js 14 App Router + React 18 + TypeScript 5.8
- **Styling**: Tailwind CSS + Radix UI + shadcn/ui-style primitives
- **State**: Zustand + react-hook-form + Zod
- **Database**: Prisma 6.19 + SQLite
- **AI Layer**: OpenAI-compatible adapter, multi-provider / multi-model
- **Desktop**: Electron + electron-builder
- **Video**: Remotion
- **Image Processing**: Sharp + Python Pillow composition scripts

---

## Project Structure

```text
app/                          # Next.js App Router
  api/                        # API routes
  hero-*/                     # Hero, asset, and workflow pages
  projects/                   # Project pages
  settings/                   # Settings pages
components/                   # UI components
  analysis/                   # Product analysis
  editor/                     # Detail page editor
  export/                     # Export panel
  layout/                     # Layout components
  planner/                    # Planner workspace
  projects/                   # Project components
  shared/                     # Shared components
  ui/                         # UI primitives
hooks/                        # React hooks
lib/
  ai/                         # AI adapters, prompts, output schemas
  db/                         # Prisma client
  services/                   # Business services
  storage/                    # Local file storage
  utils/                      # Utilities
  validations/                # Zod validations
prisma/                       # Database schema & migrations
remotion/                     # Video templates & render scripts
desktop/                      # Electron entry
scripts/                      # Build & utility scripts
storage/                      # Runtime uploads and generated assets
types/                        # TypeScript types
graphify-out/                 # Code knowledge graph outputs
```

---

## Environment Variables

Copy `.env.example` to `.env`:

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
DATABASE_URL=
STORAGE_ROOT=./storage
```

Any OpenAI-compatible API is supported.

---

## Web + Desktop

### Web

```bash
npm run dev
npm run build && npm run start
```

### Desktop (Windows EXE)

```bash
npm run build:desktop
npm run dist:win
```

### Desktop (macOS DMG / ZIP)

```bash
npm run build:desktop
npm run dist:mac
```

Web and Desktop share the same Next.js standalone business logic.

---

## Typical Workflows

### Codex-Supervised Full Detail Page

1. Start the local Web or Desktop service and open this repository in Codex.
2. Invoke `$orchestrate-commerce-images` with an existing project name or the product, angle, label, packaging, and authoritative cross-section assets.
3. Codex calls the local APIs for analysis, planning, section generation, and scoring while persisting state under `artifacts/commerce-image-workflows/<project-id>/`.
4. Each candidate is checked against actual reference IDs, packaging/cross-section fidelity, title hook, scene quality, and the accepted tone anchor; retries address only the failed dimension.
5. The workflow passes only after the user reviews and explicitly approves the complete detail page.

Run the offline self-tests before using a real provider:

```bash
python .agents/skills/orchestrate-commerce-images/scripts/motu_api.py self-test
python .agents/skills/orchestrate-commerce-images/scripts/workflow_state.py self-test
```

### Detail Page Workflow

1. Create a project and upload source / detail / reference images.
2. Run AI analysis on `/projects/[id]/analysis`.
3. Generate the detail page plan on `/projects/[id]/planner` and pick a palette style.
4. Preview, edit, regenerate, and export on `/projects/[id]/editor`.

### AI Automated Hero Workflow

1. Open `/hero-workflows`.
2. Upload a product source image and click **Create & Run**.
3. AI runs automatically: extract → strategy → white background → scenes → copy → variants → assets → review → export.
4. The workflow pauses at each key stage; check the right panel and click **Continue**.
5. Download the final ZIP organized by store / link.

---

## Recent Updates

### Unreleased
- Added a repository-local Codex commerce-image orchestration skill with reference contracts, Chinese prompt preflight, visual hard gates, targeted retries, and final human approval.
- Added dependency-free local API and recoverable workflow-state scripts without hardcoded project IDs, machine paths, provider URLs, or API keys.

### v0.10.17
- Restored and strengthened commerce title hooks, realistic consumer scenes, and visual impact while locking tone, key light, and palette relationships across the page.
- Tightened packaging, label, and single authoritative cross-section reference constraints with actual input-reference tracking.
- Improved analysis and planning latency, standardized Primary Prompts in Chinese, and expanded regression coverage.

### v0.10.7
- Planner now supports **Safe** and **Bold** palette styles.

### v0.10.6
- Section reference images now use a project-asset multi-select thumbnail picker.
- Optional 1:1 modules support a **layout template anchor** for consistent multi-variant output.

### v0.10.5
- Unified multi-variant extraction: one AI call analyzes all variants with aligned output.
- Planner preserves variant / optional suffixes and excludes optional modules from core section limits.

---

## Roadmap

- [x] AI product analysis and detail page generation
- [x] Multi-variant / SKU detail page generation
- [x] Batch hero image generation and scene fission
- [x] Product assets: white background, spec chart, ingredient list, nutrition facts
- [x] AI automated workflow with human-in-the-loop
- [x] Store / link based ZIP export
- [ ] One-click upload to Pinduoduo / Taobao backend
- [ ] Template marketplace
- [ ] Multi-user collaboration
- [ ] Cloud-hosted version

---

## Notes

- Logs, storage data, and local databases are not committed to git.
- `.env` is not committed.
- Designed as local-first; data stays on your machine by default.
- AI workflows involve heavy image generation; use stable vision + image_gen models.

---

## Contributing

PRs and issues are welcome.

---

<div align="center">

**Made with ❤️ by 零禾（上海）网络科技有限公司**

让灵感落地，让回忆有形

</div>
