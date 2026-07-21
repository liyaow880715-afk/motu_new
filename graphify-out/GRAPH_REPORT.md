# Graph Report - .  (2026-07-22)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1351 nodes · 3168 edges · 87 communities (54 shown, 33 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f548c1c4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- generation-service.ts
- handleRouteError
- main.cjs
- openai-compatible.ts
- analysis-workspace.tsx
- fail
- provider-service.ts
- build-desktop.cjs
- package.json
- editor-panel.tsx
- planner-service.ts
- compilerOptions
- checkAdminOrDesktop
- api-usage.ts
- model-service.ts
- cn
- hero-template-service.ts
- button.tsx
- page.tsx
- auth.ts
- devDependencies
- template-service.ts
- project-service.ts
- layout.tsx
- product-video.tsx
- badge.tsx
- project-output-config-card.tsx
- compilerOptions
- planning.ts
- asset-manager.ts
- analysis-service.ts
- scripts
- export-panel.tsx
- provider-settings.tsx
- planner-workspace.tsx
- build
- files
- export-service.ts
- color-palette-service.ts
- image-quality-score.tsx
- nsis
- route.ts
- deploy.sh
- section-plan.ts
- dependencies
- package.json
- mac
- route.ts
- route.ts
- section.ts
- framework-demo.tsx
- encode-images.cjs
- archiver
- class-variance-authority
- clsx
- date-fns
- preload.cjs
- docx
- electron-log
- eslint.config.mjs
- @hookform/resolvers
- lucide-react
- nanoid
- next
- next.config.mjs
- @prisma/client
- @radix-ui/react-alert-dialog
- @radix-ui/react-dialog
- @radix-ui/react-label
- @radix-ui/react-scroll-area
- @radix-ui/react-select
- @radix-ui/react-separator
- @radix-ui/react-slot
- react
- react-hook-form
- @remotion/cli
- sharp
- sonner
- tailwind-merge
- zod
- zustand
- deploy-remote.sh
- server-cleanup.sh
- tailwind.config.ts

## God Nodes (most connected - your core abstractions)
1. `handleRouteError()` - 134 edges
2. `ok()` - 129 edges
3. `fail()` - 44 edges
4. `cn()` - 32 edges
5. `generateSectionImageInternal()` - 30 edges
6. `Button` - 29 edges
7. `editSectionImage()` - 28 edges
8. `getProviderAdapter()` - 27 edges
9. `checkAdminOrDesktop()` - 22 edges
10. `Badge()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `scoreGeneratedImage()`  [EXTRACTED]
  app/api/assets/[id]/score/route.ts → lib/services/image-quality-service.ts
- `localConsume()` --calls--> `ok()`  [EXTRACTED]
  app/api/auth/consume/route.ts → lib/utils/route.ts
- `POST()` --calls--> `handleRouteError()`  [EXTRACTED]
  app/api/auth/consume/route.ts → lib/utils/route.ts
- `POST()` --calls--> `ok()`  [EXTRACTED]
  app/api/auth/consume/route.ts → lib/utils/route.ts
- `localGetMe()` --calls--> `ok()`  [EXTRACTED]
  app/api/auth/me/route.ts → lib/utils/route.ts

## Import Cycles
- None detected.

## Communities (87 total, 33 thin omitted)

### Community 0 - "generation-service.ts"
Cohesion: 0.05
Nodes (81): GET(), getContentType(), PreviewConfig, PreviewConfig, AdjacentSection, buildAspectInstruction(), buildColorConsistencyInstruction(), buildCompositionInstruction() (+73 more)

### Community 1 - "handleRouteError"
Cohesion: 0.07
Nodes (47): PATCH(), reorderSchema, DELETE(), GET(), POST(), PATCH(), analyzeSchema, POST() (+39 more)

### Community 2 - "main.cjs"
Cohesion: 0.06
Nodes (64): { app, BrowserWindow, dialog, ipcMain }, bootstrapDesktopApp(), bootstrapWithActivation(), buildActivateHtml(), checkOfflineGrace(), clearActivationConfig(), createActivateWindow(), createMainWindow() (+56 more)

### Community 3 - "openai-compatible.ts"
Cohesion: 0.08
Nodes (37): buildMessages(), classifyProbeResult(), dataUrlToInlineData(), deriveGoogleBaseUrl(), extractGoogleImageResult(), extractImageResult(), extractMarkdownImageUrl(), extractTextContent() (+29 more)

### Community 4 - "analysis-workspace.tsx"
Cohesion: 0.08
Nodes (30): accessoryOptions, aspectRatios, clothingTypes, sceneStyles, bodyTypes, styleTagOptions, AnalysisWorkspace(), AnalysisWorkspaceProps (+22 more)

### Community 5 - "fail"
Cohesion: 0.10
Nodes (36): consumeSchema, localConsume(), POST(), GET(), localGetMe(), checkPlatform(), computeExpiresAt(), localVerify() (+28 more)

### Community 6 - "provider-service.ts"
Cohesion: 0.07
Nodes (38): detectModelCapabilities(), detectModelRoles(), emptyCapabilityMap(), emptyRoleMap(), normalizeDetectedModels(), findFirst(), hasRealImageEdit(), hasRealImageGeneration() (+30 more)

### Community 7 - "build-desktop.cjs"
Cohesion: 0.07
Nodes (38): buildWindowsInstaller(), copyDirectory(), copyFileWithParents(), { ensureSafeWorkdir }, fs, fsp, main(), path (+30 more)

### Community 8 - "package.json"
Cohesion: 0.06
Nodes (35): dependencies, cors, dotenv, express, @prisma/client, zod, description, devDependencies (+27 more)

### Community 9 - "editor-panel.tsx"
Cohesion: 0.10
Nodes (28): EditorPanel, EditorPanelProps, assetTypeLabels, buildCommentCards(), buildGalleryImages(), buildProductDescription(), getActionText(), getAspectRatioClass() (+20 more)

### Community 10 - "planner-service.ts"
Cohesion: 0.12
Nodes (32): POST(), buildSectionPlanningPrompt(), assertSectionMutationAllowed(), buildDefaultStyleGuide(), buildFallbackDetail(), buildFallbackHero(), buildFallbackPlanFromTemplates(), buildNormalizedSections() (+24 more)

### Community 11 - "compilerOptions"
Cohesion: 0.06
Nodes (32): auth-server, banana-mall-main, **/*.cts, dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts (+24 more)

### Community 12 - "checkAdminOrDesktop"
Cohesion: 0.10
Nodes (30): analyzeSchema, POST(), DELETE(), GET(), PATCH(), sceneUpdateSchema, updateSchema, createSchema (+22 more)

### Community 13 - "api-usage.ts"
Cohesion: 0.13
Nodes (28): DELETE(), GET(), ApiUsageMonitorPage(), buildMonitorPageHref(), displayMonitorError(), formatTime(), projectLabel(), readSingle() (+20 more)

### Community 14 - "model-service.ts"
Cohesion: 0.15
Nodes (23): DELETE(), GET(), POST(), POST(), buildModelPrompt(), buildTryOnPrompt(), createModelTemplate(), createOutfitShoot() (+15 more)

### Community 15 - "cn"
Cohesion: 0.12
Nodes (20): ApiUsageIndicator(), UsageSummary, AppShell(), KeyTypeBadge(), navItems, applyTheme(), FloatingThemeToggle(), resolveTheme() (+12 more)

### Community 16 - "hero-template-service.ts"
Cohesion: 0.11
Nodes (22): buildPrompt(), buildReferenceInstruction(), heroBatchJobSchema, heroBatchSchema, POST(), resolveAspectRatio(), sizeMap, buildHeroTemplateInstruction() (+14 more)

### Community 17 - "button.tsx"
Cohesion: 0.12
Nodes (14): LoginPage(), BatchGenerateButtonProps, Section, AccessKeyItem, KeyManagement(), ConfirmDialog(), ConfirmDialogProps, Button (+6 more)

### Community 18 - "page.tsx"
Cohesion: 0.12
Nodes (18): ASPECT_RATIOS, createDefaultJob(), generateId(), HeroBatchJob, HeroBatchPage(), HistoryItem, PRESET_STYLES, SCENE_NAMES (+10 more)

### Community 19 - "auth.ts"
Cohesion: 0.11
Nodes (13): prisma, app, publicDir, ensureKeys(), getPrivateKey(), getPublicKey(), KEYS_DIR, PRIVATE_KEY_PATH (+5 more)

### Community 20 - "devDependencies"
Cohesion: 0.08
Nodes (25): autoprefixer, electron, electron-builder, devDependencies, autoprefixer, electron, electron-builder, png2icons (+17 more)

### Community 21 - "template-service.ts"
Cohesion: 0.14
Nodes (18): analyzeSchema, POST(), applySchema, POST(), SECTION_TYPE_MAP, DELETE(), GET(), PATCH() (+10 more)

### Community 22 - "project-service.ts"
Cohesion: 0.19
Nodes (18): DELETE(), GET(), getAccessKeyFromHeader(), PATCH(), verifyProjectOwnership(), GET(), getAccessKeyFromHeader(), POST() (+10 more)

### Community 23 - "layout.tsx"
Cohesion: 0.13
Nodes (12): metadata, Particle, ParticleBackground(), PUBLIC_PATHS, RootLayoutClient(), ThemeScript(), AuthProvider(), PUBLIC_PATHS (+4 more)

### Community 24 - "product-video.tsx"
Cohesion: 0.12
Nodes (6): IMAGE_DATA_URIS, ProductShowcase(), PHASES, ProductVideo(), STEPS, RemotionRoot()

### Community 25 - "badge.tsx"
Cohesion: 0.14
Nodes (13): bodyTypeLabels, ModelTemplate, OutfitShoot, ModelTemplate, RecentProjectListProps, StatusBadge(), statusDotMap, statusVariantMap (+5 more)

### Community 26 - "project-output-config-card.tsx"
Cohesion: 0.19
Nodes (13): ProjectAnalysisPage(), ProjectEditorPage(), ProjectExportPage(), ProjectPlannerPage(), BatchGenerateButton(), HeroBatchGenerator(), PageHeader(), normalizePreviewConfig() (+5 more)

### Community 27 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir (+11 more)

### Community 28 - "planning.ts"
Cohesion: 0.14
Nodes (15): ABSOLUTE_WORDS, AdLawCategory, AdLawRule, adLawRules, buildAdLawPromptSection(), detectAdLawCategory(), getAdLawRule(), scanAdLawViolations() (+7 more)

### Community 29 - "asset-manager.ts"
Cohesion: 0.29
Nodes (15): exportSchema, parseHeroBatchFilePath(), POST(), POST(), duplicateExportFile(), ensureDir(), ensureStorageScaffold(), projectDir() (+7 more)

### Community 30 - "analysis-service.ts"
Cohesion: 0.24
Nodes (16): buildProductAnalysisPrompt(), buildProductAnalysisRepairPrompt(), analyzeProject(), assetToDataUrl(), extractJsonBlock(), hasCapability(), isImageSpecialized(), isLiteLike() (+8 more)

### Community 31 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, build, build:desktop, desktop:start, dev, dist:all, dist:mac, dist:win (+9 more)

### Community 32 - "export-panel.tsx"
Cohesion: 0.17
Nodes (13): HeroBatchItem, HistoryPage(), loadStoredAdminSecret(), loadStoredKey(), ProjectItem, ExportPanel(), getPreviewConfig(), ImageLightbox() (+5 more)

### Community 33 - "provider-settings.tsx"
Cohesion: 0.16
Nodes (15): buildDefaults(), canUseForRole(), DefaultAssignments, formatTimeLabel(), GenericModelRecord, getEndpointBadge(), ProviderConfigPanel(), ProviderFormValues (+7 more)

### Community 34 - "planner-workspace.tsx"
Cohesion: 0.17
Nodes (13): BulkProgressState, defaultGenerationSettings, defaultPreviewConfig, GenerationSettings, getGenerationLabel(), getGenerationSettings(), getPreviewConfig(), plannerSectionTypeOptions (+5 more)

### Community 35 - "build"
Cohesion: 0.18
Nodes (11): build, appId, asar, directories, productName, win, buildResources, output (+3 more)

### Community 36 - "files"
Cohesion: 0.17
Nodes (11): asarUnpack, files, desktop/**/*, .next/standalone/**/*, .next/static/**/*, **/*.node, **/node_modules/.prisma/**/*, public/**/* (+3 more)

### Community 37 - "export-service.ts"
Cohesion: 0.35
Nodes (8): GET(), GET(), buildDetailAssets(), buildGalleryAssets(), buildImageArchive(), buildProjectJson(), getPreviewConfig(), completeTask()

### Community 38 - "color-palette-service.ts"
Cohesion: 0.33
Nodes (10): colorPaletteSchema, extractColorPaletteFromAsset(), extractColorPaletteFromImage(), ExtractedColorPalette, extractProjectColorPalette(), generateStyleAnchorImage(), pickVisionModel(), regenerateProjectStyleGuide() (+2 more)

### Community 39 - "image-quality-score.tsx"
Cohesion: 0.27
Nodes (7): ImageQualityScore(), ImageQualityScoreData, ImageQualityScoreProps, scoreBg(), scoreColor(), Progress(), ProgressProps

### Community 40 - "nsis"
Cohesion: 0.20
Nodes (10): nsis, allowToChangeInstallationDirectory, artifactName, createDesktopShortcut, createStartMenuShortcut, installerHeaderIcon, installerIcon, oneClick (+2 more)

### Community 41 - "route.ts"
Cohesion: 0.23
Nodes (8): DEFAULT_HERO_STYLES, heroBatchSchema, POST(), POST(), POST(), POST(), generateSectionImage(), generationRequestSchema

### Community 42 - "deploy.sh"
Cohesion: 0.43
Nodes (7): err(), info(), ok(), PORT, deploy.sh script, usage(), warn()

### Community 43 - "section-plan.ts"
Cohesion: 0.25
Nodes (7): colorPaletteSchema, hexColorSchema, sectionPlanItemSchema, SectionPlanOutput, sectionPlanOutputSchema, styleGuideSchema, visualSystemSchema

### Community 44 - "dependencies"
Cohesion: 0.29
Nodes (8): dependencies, @radix-ui/react-tabs, @radix-ui/react-toast, react-dom, remotion, @radix-ui/react-tabs, react-dom, remotion

### Community 45 - "package.json"
Cohesion: 0.29
Nodes (6): author, description, main, name, private, version

### Community 46 - "mac"
Cohesion: 0.40
Nodes (5): mac, artifactName, category, icon, target

### Community 47 - "route.ts"
Cohesion: 0.47
Nodes (4): PATCH(), updateAnalysis(), analysisPatchSchema, analysisSchema

### Community 48 - "route.ts"
Cohesion: 0.50
Nodes (4): DELETE(), GET(), HeroBatchHistoryItem, listHistory()

### Community 49 - "section.ts"
Cohesion: 0.40
Nodes (4): sectionInputSchema, sectionPatchSchema, sectionReorderSchema, sectionTypes

### Community 51 - "encode-images.cjs"
Cohesion: 0.40
Nodes (4): fs, images, path, sections

## Knowledge Gaps
- **380 isolated node(s):** `reorderSchema`, `consumeSchema`, `verifySchema`, `analyzeSchema`, `exportSchema` (+375 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `handleRouteError()` connect `handleRouteError` to `generation-service.ts`, `fail`, `export-service.ts`, `route.ts`, `planner-service.ts`, `checkAdminOrDesktop`, `api-usage.ts`, `model-service.ts`, `route.ts`, `hero-template-service.ts`, `route.ts`, `template-service.ts`, `project-service.ts`, `asset-manager.ts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `ok()` connect `handleRouteError` to `fail`, `route.ts`, `planner-service.ts`, `checkAdminOrDesktop`, `api-usage.ts`, `model-service.ts`, `route.ts`, `route.ts`, `hero-template-service.ts`, `template-service.ts`, `project-service.ts`, `asset-manager.ts`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `OpenAICompatibleAdapter` connect `openai-compatible.ts` to `provider-service.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `reorderSchema`, `consumeSchema`, `verifySchema` to the rest of the system?**
  _380 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `generation-service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.052659716653301256 - nodes in this community are weakly interconnected._
- **Should `handleRouteError` be split into smaller, more focused modules?**
  _Cohesion score 0.07404426559356136 - nodes in this community are weakly interconnected._
- **Should `main.cjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06057945566286216 - nodes in this community are weakly interconnected._