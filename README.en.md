# MoTu

`MoTu` is a local-first AI workspace for e-commerce content generation and editing.

It is designed for real-world e-commerce operations, supporting an end-to-end workflow from product images to detail pages, hero images, product assets, and batch distribution.

---

## Capabilities

- Connect any OpenAI-compatible provider with `baseURL + apiKey`
- Fetch `/models`, normalize capabilities, and recommend default roles
- Create product projects and upload assets
- Run structured AI product analysis from images
- Generate editable, reorderable, retryable section-based detail page plans
- Generate images independently for each section
- Preview the full mobile detail page in a phone simulator
- Edit and regenerate a single section
- Keep section version history and export JSON / images
- Batch hero image generation with multi-scene jobs and multi-reference support
- AI scene fission engine: replace backgrounds while keeping the product subject
- White-background image reuse: one white-background image per product, shared by all scenes and assets
- Product asset generation: white background, spec chart, ingredient list, nutrition facts
- AI automated workflow: AI runs end-to-end after uploading a product image, pausing at key stages for human review
- Export ZIP organized by store / link
- AI review for compliance, quality, consistency, and scoring

<img src="./docs/images/feature-grid.png" alt="Core Features" width="100%" />

<img src="./docs/images/workflow-stages.png" alt="AI Workflow Stages" width="100%" />

---

## Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- shadcn-style UI primitives
- Zustand
- react-hook-form + Zod
- Prisma + SQLite
- Local filesystem storage
- OpenAI-compatible AI adapter layer
- Electron + electron-builder (desktop)
- Python + Pillow (image composition)

---

## Project Structure

```text
app/
  api/                  # API routes
  hero-*/               # Hero image, assets, workflow pages
  projects/             # Project pages
  settings/             # Settings pages
components/
  analysis/             # Product analysis
  editor/               # Detail page editor
  layout/               # Layout components
  projects/             # Project components
  shared/               # Shared components
  ui/                   # UI primitives
hooks/                  # React hooks
lib/
  ai/                   # AI adapters, prompts, output schemas
  db/                   # Prisma client
  services/             # Business services
  storage/              # Local file storage
  utils/                # Utilities
  validations/          # Zod validations
prisma/                 # Database schema & migrations
scripts/                # Build & utility scripts
desktop/                # Electron entry
types/                  # TypeScript types
```

---

## Main Workflows

### Detail Page Workflow

1. Open `/settings/providers`
2. Enter `Provider name + baseURL + apiKey`
3. Test the connection
4. Discover models and review capability tags
5. Save the current provider and default model roles
6. Open `/projects/new` and create a product project
7. Upload main, angle, detail, and reference images
8. Run product analysis on `/projects/[id]/analysis`
9. Generate a detail page plan on `/projects/[id]/planner`
10. Edit, regenerate, and export on `/projects/[id]/editor`

### AI Automated Hero Image Workflow

1. Open `/hero-workflows`
2. Upload a product source image
3. Click **Create & Run**
4. AI runs automatically: extract → strategy → white background → scenes → copies → variants → assets → review → export
5. The workflow pauses at each key stage for human review; click **Continue** after checking or editing
6. Download the final ZIP organized by store / link

### Manual Hero Workbenches

- `/hero-scene-generator`: manually select scenes, copy, and layouts to generate hero variants
- `/hero-product-assets`: upload a product image to generate white background, spec, ingredient, and nutrition images
- `/hero-scenes`: manage scene library
- `/hero-copies`: manage copy library

---

## Quick Start

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Then open the local address printed by Next.js.

### Desktop Build

```bash
npm run build:desktop
npm run dist:win
```

---

## Environment Variables

Create `.env` based on `.env.example`:

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
DATABASE_URL=
STORAGE_ROOT=./storage
```

You can also skip `.env` and set the provider directly in the **AI Config** menu at the top-right of the page.

---

## Recent Updates

### v0.8.0

- Added AI automated workflow with human-in-the-loop
- 9-stage pipeline: extract, strategy, white background, scenes, copies, variants, assets, review, export
- Added product asset generation page
- Added store / link based ZIP export
- White-background image caching and reuse

### v0.7.0

- Added product assets: white background, spec chart, ingredient list, nutrition facts
- Scene fission supports store / link based export

---

## Contributing

PRs and issues are welcome.

---

<div align="center">

**Made with ❤️ by 零禾（上海）网络科技有限公司**

</div>
