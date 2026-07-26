# Motu/摹图本地 API

使用 `scripts/motu_api.py`，避免在每次任务中重写请求代码。客户端只依赖 Python 标准库。

## 连接与安全

- `MOTU_BASE_URL`：本地 Next.js/Electron 服务地址，例如 `http://127.0.0.1:3000`。也可用 `--base-url`。
- `MOTU_ACCESS_KEY`：Web 版需要时作为 `x-access-key` 请求头发送。桌面版通常不需要。
- Provider URL 和 API Key 已由应用的“模型服务配置”管理，不传给此客户端。
- 不在命令行参数、日志、状态 JSON 或 Git 中写 Provider API Key。

所有响应默认解包 `{ "success": true, "data": ... }`，失败时客户端输出结构化错误并返回非零状态。

## 常用命令

```powershell
# 项目列表或按名称过滤
python scripts/motu_api.py projects --name "未命名商品项目" --json-output artifacts/projects.json

# 项目详情，包含 assets、sections、计划/实际参考图和版本
python scripts/motu_api.py project --project-id PROJECT_ID --json-output artifacts/project.json

# 创建项目
python scripts/motu_api.py create --name "商品项目" --platform taobao --style modern

# Base64 上传素材；类型由应用校验
python scripts/motu_api.py upload --project-id PROJECT_ID --file C:\path\main.jpg --type MAIN

# 分析与规划
python scripts/motu_api.py analyze --project-id PROJECT_ID --model-id MODEL_ID --timeout 330
python scripts/motu_api.py plan --project-id PROJECT_ID --palette-style bold --preview-config @preview.json --timeout 330

# 修改 section。@patch.json 内容可含 title/copy/visualPrompt/editableData
python scripts/motu_api.py patch-section --project-id PROJECT_ID --section-id SECTION_ID --patch @patch.json

# 生成、重生或局部编辑；reference-asset-id 可重复
python scripts/motu_api.py generate --project-id PROJECT_ID --section-id SECTION_ID --action generate --reference-asset-id ASSET_ID --timeout 390
python scripts/motu_api.py generate --project-id PROJECT_ID --section-id SECTION_ID --action regenerate --reference-asset-id ASSET_ID --timeout 390
python scripts/motu_api.py generate --project-id PROJECT_ID --section-id SECTION_ID --action edit --edit-mode repaint --reference-asset-id ASSET_ID --timeout 390

# 生图结果建议落盘，再由状态脚本自动提取资产、模式和真实参考图 ID
python scripts/motu_api.py generate --project-id PROJECT_ID --section-id SECTION_ID --action generate --reference-asset-id ASSET_ID --json-output artifacts/generation.json
python scripts/workflow_state.py record-attempt --state artifacts/workflow.json --section-id SECTION_ID --generation-json artifacts/generation.json --manual-review-json artifacts/review.json --decision pass

# 最近任务与质量分数
python scripts/motu_api.py tasks --project-id PROJECT_ID
python scripts/motu_api.py scores --project-id PROJECT_ID
python scripts/motu_api.py wait-score --project-id PROJECT_ID --asset-id ASSET_ID --wait-timeout 180

# 下载相对 imageUrl 或完整 URL
python scripts/motu_api.py download --url /api/files/generated/path.png --file-output artifacts/candidate.png
```

`--json-output` 使用原子写入，适合交给 `workflow_state.py init/sync`。以 `@` 开头的 JSON 参数从 UTF-8 文件读取。

## 路由契约

| 操作 | 方法与路径 | 请求主体 |
|---|---|---|
| 项目列表 | `GET /api/projects` | 无 |
| 项目详情 | `GET /api/projects/{id}` | 无 |
| 创建项目 | `POST /api/projects` | `name/platform/style/mode/...` |
| 上传素材 | `POST /api/projects/{id}/assets/upload` | `type/fileName/mimeType/base64Data/variantId` |
| 商品分析 | `POST /api/projects/{id}/analyze` | `modelId` |
| 详情页规划 | `POST /api/projects/{id}/plan-sections` | `modelId/autoDecideCounts/paletteStyle/previewConfig` |
| 修改 section | `PATCH /api/projects/{id}/sections/{sectionId}` | `title/goal/copy/visualPrompt/status/editableData` |
| 首次生成 | `POST .../sections/{sectionId}/generate` | `modelId/referenceAssetIds` |
| 重新生成 | `POST .../sections/{sectionId}/regenerate` | `modelId/referenceAssetIds` |
| 图片编辑 | `POST .../sections/{sectionId}/edit` | `modelId/referenceAssetIds/editMode` |
| 最近任务 | `GET /api/projects/{id}/tasks` | 无 |
| 质量分数 | `GET /api/projects/{id}/scores` | 无 |

## 入参确认

项目详情中的关键字段：

- `sections[].inputReferenceAssets`：按当前规划，下次生成应发送的参考图。
- `sections[].actualInputReferenceAssets`：最近生成实际发送的参考图。
- `sections[].referenceInputsConfirmed`：商品类参考图是否已实际发送。
- `sections[].referenceInputsMatchCurrentPlan`：最近实际入参与当前规划是否一致。
- `sections[].currentImageAsset.metadata.providerReferenceInputs`：生成资产保存的原始追踪记录。

工作流仍要检查权威素材 ID，而不是只相信布尔字段，因为包装和横切面属于更严格的业务约束。

## 超时与重试

- 分析/规划建议请求窗口 330 秒。
- 单图生成建议请求窗口 390 秒；项目当前 Provider 平均约 200 秒。
- 503/504、网络中断和限流只允许指数退避重试；不得把内容失败当网络失败自动重放。
- 生图请求返回超时后先查 `tasks` 和项目详情，确认是否已生成，避免重复计费。
