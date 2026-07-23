# Graph Report - .  (2026-07-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1832 nodes · 4464 edges · 97 communities (63 shown, 34 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b74f62bc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- handleRouteError
- hero-workflow-engine.ts
- openai-compatible.ts
- asset-manager.ts
- Button
- main.cjs
- getProviderAdapter
- fail
- env.ts
- generation-service.ts
- editor-panel.tsx
- hero-product-asset-service.ts
- planner-service.ts
- build-desktop.cjs
- palette-preset-service.ts
- button.tsx
- palette-presets.ts
- domain.ts
- auth-server/package.json
- provider-service.ts
- color-palette-service.ts
- compilerOptions
- planning.ts
- project-output-config-card.tsx
- quick-start-workspace.tsx
- template-service.ts
- analysis-service.ts
- badge.tsx
- devDependencies
- planner-workspace.tsx
- prompts/generation.ts
- provider-settings.tsx
- model-service.ts
- layout.tsx
- product-video.tsx
- project-service.ts
- compilerOptions
- hero-variant-compose.py
- scripts
- [planId]/palette/route.ts
- hero-copies/route.ts
- image-quality-service.ts
- [id]/hero-batch/route.ts
- buildImageModelCandidates
- files
- build
- hero-product-asset-compose.py
- hero-batch/page.tsx
- image-quality-score.tsx
- nsis
- sections/reorder/route.ts
- deploy.sh
- section-plan.ts
- dependencies
- variants/route.ts
- package.json
- generate-readme-images.py
- [id]/analysis/route.ts
- mac
- framework-demo.tsx
- encode-images.cjs
- utils/section.ts
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
1. `handleRouteError()` - 193 edges
2. `ok()` - 190 edges
3. `fail()` - 50 edges
4. `getProviderAdapter()` - 48 edges
5. `Button` - 38 edges
6. `generateSectionImageInternal()` - 36 edges
7. `editSectionImage()` - 32 edges
8. `cn()` - 32 edges
9. `Card()` - 28 edges
10. `CardContent()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `scoreGeneratedImage()`  [EXTRACTED]
  app/api/assets/[id]/score/route.ts → lib/services/image-quality-service.ts
- `localConsume()` --calls--> `fail()`  [EXTRACTED]
  app/api/auth/consume/route.ts → lib/utils/route.ts
- `localConsume()` --calls--> `ok()`  [EXTRACTED]
  app/api/auth/consume/route.ts → lib/utils/route.ts
- `POST()` --calls--> `fail()`  [EXTRACTED]
  app/api/auth/consume/route.ts → lib/utils/route.ts
- `POST()` --calls--> `handleRouteError()`  [EXTRACTED]
  app/api/auth/consume/route.ts → lib/utils/route.ts

## Import Cycles
- None detected.

## Communities (97 total, 34 thin omitted)

### Community 0 - "handleRouteError"
Cohesion: 0.05
Nodes (64): PATCH(), reorderSchema, DELETE(), GET(), POST(), PATCH(), analyzeSchema, POST() (+56 more)

### Community 1 - "hero-workflow-engine.ts"
Cohesion: 0.05
Nodes (78): composeSchema, createSchema, DELETE(), POST(), createSchema, DELETE(), GET(), PATCH() (+70 more)

### Community 2 - "openai-compatible.ts"
Cohesion: 0.06
Nodes (56): DELETE(), buildMessages(), classifyProbeResult(), dataUrlToInlineData(), deriveGoogleBaseUrl(), extractGoogleImageResult(), extractImageResult(), extractMarkdownImageUrl() (+48 more)

### Community 3 - "asset-manager.ts"
Cohesion: 0.07
Nodes (58): GET(), getContentType(), exportSchema, parseHeroBatchFilePath(), POST(), createSchema, DELETE(), GET() (+50 more)

### Community 4 - "Button"
Cohesion: 0.07
Nodes (38): AssetResult, StoreConfig, ASPECT_RATIOS, STAGE_LABELS, STAGES, STATUS_COLORS, STATUS_ICONS, accessoryOptions (+30 more)

### Community 5 - "main.cjs"
Cohesion: 0.06
Nodes (66): { app, BrowserWindow, dialog, ipcMain }, bootstrapDesktopApp(), bootstrapWithActivation(), buildActivateHtml(), checkOfflineGrace(), clearActivationConfig(), copyRecursive(), createActivateWindow() (+58 more)

### Community 6 - "getProviderAdapter"
Cohesion: 0.07
Nodes (48): buildPaletteInstruction(), buildPrompt(), buildReferenceInstruction(), generateHeroCopy(), heroBatchJobSchema, heroBatchSchema, HeroQcResult, loadSourceProjectContext() (+40 more)

### Community 7 - "fail"
Cohesion: 0.09
Nodes (41): DELETE(), analyzeSchema, POST(), DELETE(), GET(), PATCH(), sceneUpdateSchema, updateSchema (+33 more)

### Community 8 - "env.ts"
Cohesion: 0.09
Nodes (35): consumeSchema, localConsume(), POST(), GET(), localGetMe(), checkPlatform(), computeExpiresAt(), localVerify() (+27 more)

### Community 9 - "generation-service.ts"
Cohesion: 0.10
Nodes (46): AdapterContext, AssetRecord, buildReferenceImageInstruction(), buildReferenceImageList(), composeSectionSvg(), editSectionImage(), editWithFallback(), escapeXml() (+38 more)

### Community 10 - "editor-panel.tsx"
Cohesion: 0.07
Nodes (36): HeroBatchItem, HistoryPage(), loadStoredAdminSecret(), loadStoredKey(), ProjectItem, EditorPanel, EditorPanelProps, assetTypeLabels (+28 more)

### Community 11 - "hero-product-asset-service.ts"
Cohesion: 0.09
Nodes (37): GET(), POST(), createSchema, DELETE(), GET(), PATCH(), POST(), buildHeroScenePrompt() (+29 more)

### Community 12 - "planner-service.ts"
Cohesion: 0.09
Nodes (43): ExtractedColorPalette, AiStyleGuideInput, appendOptionalSections(), assertSectionMutationAllowed(), buildDefaultStyleGuide(), buildFallbackDetail(), buildFallbackHero(), buildFallbackPlanFromTemplates() (+35 more)

### Community 13 - "build-desktop.cjs"
Cohesion: 0.07
Nodes (38): buildWindowsInstaller(), copyDirectory(), copyFileWithParents(), { ensureSafeWorkdir }, fs, fsp, main(), path (+30 more)

### Community 14 - "palette-preset-service.ts"
Cohesion: 0.10
Nodes (32): DELETE(), getAccessKeyFromHeader(), PATCH(), updateSchema, getAccessKeyFromHeader(), importSchema, POST(), createSchema (+24 more)

### Community 15 - "button.tsx"
Cohesion: 0.11
Nodes (21): ApiUsageIndicator(), UsageSummary, AppShell(), KeyTypeBadge(), navItems, applyTheme(), FloatingThemeToggle(), resolveTheme() (+13 more)

### Community 16 - "palette-presets.ts"
Cohesion: 0.08
Nodes (20): prisma, app, publicDir, ensureKeys(), getPrivateKey(), getPublicKey(), KEYS_DIR, PRIVATE_KEY_PATH (+12 more)

### Community 17 - "domain.ts"
Cohesion: 0.09
Nodes (31): AnalysisWorkspace(), AnalysisWorkspaceProps, arrayToText(), buildVariantAnalysisMap(), textToArray(), ProjectCreateValues, ProjectCreator(), UploadBucketKey (+23 more)

### Community 18 - "auth-server/package.json"
Cohesion: 0.06
Nodes (35): dependencies, cors, dotenv, express, @prisma/client, zod, description, devDependencies (+27 more)

### Community 19 - "provider-service.ts"
Cohesion: 0.11
Nodes (29): detectModelCapabilities(), detectModelRoles(), emptyCapabilityMap(), emptyRoleMap(), findFirst(), hasRealImageEdit(), hasRealImageGeneration(), isStableAnalysisCandidate() (+21 more)

### Community 20 - "color-palette-service.ts"
Cohesion: 0.13
Nodes (32): anchorLocks, blendWithTheme(), buildPaletteOptionFromTheme(), clamp(), colorPaletteSchema, ensureContrast(), extractColorPaletteFromAsset(), extractColorPaletteFromImage() (+24 more)

### Community 21 - "compilerOptions"
Cohesion: 0.06
Nodes (32): auth-server, banana-mall-main, **/*.cts, dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts (+24 more)

### Community 22 - "planning.ts"
Cohesion: 0.10
Nodes (27): PreviewConfig, PreviewConfig, ABSOLUTE_WORDS, AdLawCategory, AdLawRule, adLawRules, buildAdLawPromptSection(), detectAdLawCategory() (+19 more)

### Community 23 - "project-output-config-card.tsx"
Cohesion: 0.12
Nodes (21): ProjectAnalysisPage(), ProjectEditorPage(), ProjectExportPage(), ProjectPlannerPage(), BatchGenerateButton(), BatchGenerateButtonProps, Section, ExportPanel() (+13 more)

### Community 24 - "quick-start-workspace.tsx"
Cohesion: 0.11
Nodes (22): LoginPage(), AssetKind, kindLabels, LabelSubType, labelTypeOptions, PendingAsset, QuickStartAssetUploader(), QuickStartAssetUploaderProps (+14 more)

### Community 25 - "template-service.ts"
Cohesion: 0.11
Nodes (22): analyzeSchema, POST(), applySchema, POST(), SECTION_TYPE_MAP, DELETE(), GET(), PATCH() (+14 more)

### Community 26 - "analysis-service.ts"
Cohesion: 0.16
Nodes (26): buildProductAnalysisRepairPrompt(), buildTextAnalysisPrompt(), AnalysisDependencies, analyzeProject(), analyzeProjectVariants(), assetToDataUrl(), extractJsonBlock(), filterEligibleImageAssets() (+18 more)

### Community 27 - "badge.tsx"
Cohesion: 0.12
Nodes (18): bodyTypeLabels, ModelTemplate, OutfitShoot, ModelTemplate, ApiUsageMonitorPage(), buildMonitorPageHref(), displayMonitorError(), formatTime() (+10 more)

### Community 28 - "devDependencies"
Cohesion: 0.08
Nodes (25): autoprefixer, electron, electron-builder, devDependencies, autoprefixer, electron, electron-builder, png2icons (+17 more)

### Community 29 - "planner-workspace.tsx"
Cohesion: 0.10
Nodes (21): BulkProgressState, defaultGenerationSettings, defaultPreviewConfig, GenerationSettings, getGenerationLabel(), getGenerationSettings(), getPreviewConfig(), OPTIONAL_SECTION_LABELS (+13 more)

### Community 30 - "prompts/generation.ts"
Cohesion: 0.14
Nodes (24): AdjacentSection, buildAspectInstruction(), buildCompositionInstruction(), buildImageEditPrompt(), buildMainImageInstruction(), buildNegativePrompt(), buildPackagingCompositionInstruction(), buildProductFidelityInstruction() (+16 more)

### Community 31 - "provider-settings.tsx"
Cohesion: 0.11
Nodes (19): buildDefaults(), canUseForRole(), DefaultAssignments, formatTimeLabel(), GenericModelRecord, getEndpointBadge(), ProviderPageData, ProviderSettingsPageClient() (+11 more)

### Community 32 - "model-service.ts"
Cohesion: 0.19
Nodes (17): POST(), buildModelPrompt(), buildTryOnPrompt(), createOutfitShoot(), deleteModelTemplate(), deleteOutfitShoot(), generateModelViews(), generateOutfitShot() (+9 more)

### Community 33 - "layout.tsx"
Cohesion: 0.13
Nodes (12): metadata, Particle, ParticleBackground(), PUBLIC_PATHS, RootLayoutClient(), ThemeScript(), AuthProvider(), PUBLIC_PATHS (+4 more)

### Community 34 - "product-video.tsx"
Cohesion: 0.12
Nodes (6): IMAGE_DATA_URIS, ProductShowcase(), PHASES, ProductVideo(), STEPS, RemotionRoot()

### Community 35 - "project-service.ts"
Cohesion: 0.21
Nodes (17): DELETE(), GET(), getAccessKeyFromHeader(), PATCH(), verifyProjectOwnership(), GET(), getAccessKeyFromHeader(), POST() (+9 more)

### Community 36 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir (+11 more)

### Community 37 - "hero-variant-compose.py"
Cohesion: 0.31
Nodes (15): Draw, FreeTypeFont, Image, apply_layout(), apply_subtle_filter(), draw_center_tag(), draw_rounded_rectangle(), draw_tags() (+7 more)

### Community 38 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, build, build:desktop, desktop:start, dev, dist:all, dist:mac, dist:win (+9 more)

### Community 39 - "[planId]/palette/route.ts"
Cohesion: 0.19
Nodes (11): colorTokensSchema, GET(), getAccessKeyFromHeader(), getProjectPaletteContext(), PATCH(), POST(), selectPaletteSchema, PaletteState (+3 more)

### Community 40 - "hero-copies/route.ts"
Cohesion: 0.23
Nodes (12): createSchema, DELETE(), generateSchema, GET(), PATCH(), POST(), PUT(), createCopyLibrary() (+4 more)

### Community 41 - "image-quality-service.ts"
Cohesion: 0.23
Nodes (11): buildImageQualityScorePrompt(), QualityScoreColorPalette, QualityScoreInput, assetToDataUrl(), contentLanguageName(), getVisionAdapter(), ImageQualityScoreResult, pickVisionModel() (+3 more)

### Community 42 - "[id]/hero-batch/route.ts"
Cohesion: 0.23
Nodes (8): DEFAULT_HERO_STYLES, heroBatchSchema, POST(), POST(), POST(), POST(), generateSectionImage(), generationRequestSchema

### Community 43 - "buildImageModelCandidates"
Cohesion: 0.21
Nodes (13): buildImageModelCandidates(), buildSvgModelCandidates(), canEditRealImage(), canGenerateRealImage(), hasImageCapability(), hasRealImageEdit(), hasRealImageGeneration(), hasTextCapability() (+5 more)

### Community 44 - "files"
Cohesion: 0.15
Nodes (12): asarUnpack, files, !node_modules/**, desktop/**/*, .next/standalone/**/*, .next/static/**/*, **/*.node, **/node_modules/.prisma/**/* (+4 more)

### Community 45 - "build"
Cohesion: 0.17
Nodes (12): build, appId, asar, directories, npmRebuild, productName, win, buildResources (+4 more)

### Community 46 - "hero-product-asset-compose.py"
Cohesion: 0.32
Nodes (9): composite_ingredient(), composite_nutrition(), composite_spec(), composite_white_bg(), get_font(), load_image(), main(), Simple word/character wrap for CJK and latin text. (+1 more)

### Community 47 - "hero-batch/page.tsx"
Cohesion: 0.24
Nodes (9): accessKeyHeaders(), ASPECT_RATIOS, buildProjectDescription(), GROUP_COUNTS, HeroBatchPage(), HistoryItem, ProjectInfo, ResultItem (+1 more)

### Community 48 - "image-quality-score.tsx"
Cohesion: 0.27
Nodes (7): ImageQualityScore(), ImageQualityScoreData, ImageQualityScoreProps, scoreBg(), scoreColor(), Progress(), ProgressProps

### Community 49 - "nsis"
Cohesion: 0.20
Nodes (10): nsis, allowToChangeInstallationDirectory, artifactName, createDesktopShortcut, createStartMenuShortcut, installerHeaderIcon, installerIcon, oneClick (+2 more)

### Community 50 - "sections/reorder/route.ts"
Cohesion: 0.32
Nodes (6): POST(), reorderSections(), sectionInputSchema, sectionPatchSchema, sectionReorderSchema, sectionTypes

### Community 51 - "deploy.sh"
Cohesion: 0.43
Nodes (7): err(), info(), ok(), PORT, deploy.sh script, usage(), warn()

### Community 52 - "section-plan.ts"
Cohesion: 0.25
Nodes (7): colorPaletteSchema, hexColorSchema, sectionPlanItemSchema, SectionPlanOutput, sectionPlanOutputSchema, styleGuideSchema, visualSystemSchema

### Community 53 - "dependencies"
Cohesion: 0.29
Nodes (8): dependencies, @radix-ui/react-tabs, @radix-ui/react-toast, react-dom, remotion, @radix-ui/react-tabs, react-dom, remotion

### Community 54 - "variants/route.ts"
Cohesion: 0.57
Nodes (6): createVariantSchema, DELETE(), GET(), getAccessKeyFromHeader(), POST(), verifyProjectOwnership()

### Community 55 - "package.json"
Cohesion: 0.29
Nodes (6): author, description, main, name, private, version

### Community 56 - "generate-readme-images.py"
Cohesion: 0.67
Nodes (6): draw_gradient(), generate_feature_grid(), generate_hero_banner(), generate_workflow_stages(), get_font(), hex_to_rgb()

### Community 57 - "[id]/analysis/route.ts"
Cohesion: 0.47
Nodes (4): PATCH(), updateAnalysis(), analysisPatchSchema, analysisSchema

### Community 58 - "mac"
Cohesion: 0.40
Nodes (5): mac, artifactName, category, icon, target

### Community 60 - "encode-images.cjs"
Cohesion: 0.40
Nodes (4): fs, images, path, sections

## Knowledge Gaps
- **462 isolated node(s):** `reorderSchema`, `consumeSchema`, `verifySchema`, `analyzeSchema`, `exportSchema` (+457 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `handleRouteError()` connect `handleRouteError` to `model-service.ts`, `hero-workflow-engine.ts`, `openai-compatible.ts`, `asset-manager.ts`, `project-service.ts`, `getProviderAdapter`, `fail`, `env.ts`, `hero-copies/route.ts`, `[id]/hero-batch/route.ts`, `hero-product-asset-service.ts`, `[planId]/palette/route.ts`, `palette-preset-service.ts`, `sections/reorder/route.ts`, `variants/route.ts`, `[id]/analysis/route.ts`, `template-service.ts`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `ok()` connect `handleRouteError` to `model-service.ts`, `hero-workflow-engine.ts`, `openai-compatible.ts`, `asset-manager.ts`, `project-service.ts`, `getProviderAdapter`, `fail`, `env.ts`, `hero-copies/route.ts`, `[id]/hero-batch/route.ts`, `hero-product-asset-service.ts`, `[planId]/palette/route.ts`, `palette-preset-service.ts`, `sections/reorder/route.ts`, `variants/route.ts`, `[id]/analysis/route.ts`, `template-service.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `getProviderAdapter()` connect `getProviderAdapter` to `handleRouteError`, `hero-workflow-engine.ts`, `model-service.ts`, `fail`, `hero-copies/route.ts`, `generation-service.ts`, `image-quality-service.ts`, `hero-product-asset-service.ts`, `planner-service.ts`, `provider-service.ts`, `color-palette-service.ts`, `template-service.ts`, `analysis-service.ts`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `reorderSchema`, `consumeSchema`, `verifySchema` to the rest of the system?**
  _462 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `handleRouteError` be split into smaller, more focused modules?**
  _Cohesion score 0.05490734385724091 - nodes in this community are weakly interconnected._
- **Should `hero-workflow-engine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050156739811912224 - nodes in this community are weakly interconnected._
- **Should `openai-compatible.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05906553041434029 - nodes in this community are weakly interconnected._