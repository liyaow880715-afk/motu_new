# 工作流状态契约

`workflow.json` 是一次电商图片生产的可恢复记录。用 `scripts/workflow_state.py` 创建和修改，不手写时间戳或派生状态。

## 顶层结构

```json
{
  "schemaVersion": "commerce-image-workflow/v1",
  "workflowId": "UUID",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "phase": "intake|preflight|generating|review|approved|blocked",
  "project": { "id": "...", "name": "...", "baseUrl": "..." },
  "assets": [],
  "toneAnchor": {
    "strategy": "first-approved-section",
    "assetId": null,
    "palette": []
  },
  "gates": {},
  "sections": [],
  "approval": {
    "status": "pending|approved|rejected",
    "fullPageReviewed": false,
    "reviewedBy": null,
    "notes": ""
  }
}
```

## Asset

```json
{
  "id": "asset-id",
  "fileName": "source.jpg",
  "apiType": "MAIN",
  "role": "main|angle|detail|label|packaging|cross_section|ingredient|reference",
  "authoritativeFor": ["product_identity", "packaging_identity", "cross_section_geometry", "factual_copy"],
  "confirmed": true,
  "url": "/api/files/..."
}
```

`confirmed` 表示 Codex 已实际查看图片并确认角色。自动从 API 类型映射得到的记录默认是 `false`。横切面必须人工改为 `cross_section`，不得仅凭 `ANGLE` 或 `DETAIL` 类型推断。

## Section

```json
{
  "id": "section-id",
  "key": "hero_01",
  "type": "HERO",
  "title": "...",
  "primaryPrompt": "中文场景提示词",
  "requirements": {
    "packagingFidelity": false,
    "crossSectionFidelity": true
  },
  "requiredReferenceAssetIds": ["asset-id"],
  "plannedReferenceInputs": [],
  "planSignature": "sha256",
  "attempts": [],
  "status": "pending|passed|retry|blocked"
}
```

`requiredReferenceAssetIds` 只放不能缺失的商品身份/包装/横切面/事实素材。风格锚点、相邻成图和版式模板保留在 `plannedReferenceInputs`，但不挤占权威商品图的语义。

## Attempt

```json
{
  "attempt": 1,
  "createdAt": "ISO-8601",
  "assetId": "generated-asset-id",
  "generationMode": "image_api",
  "actualReferenceAssetIds": ["asset-id"],
  "planSignature": "与当前 section 一致的 sha256",
  "scores": {
    "overallScore": 84,
    "colorConsistencyScore": 87,
    "promptAlignmentScore": 83,
    "typographyScore": 78,
    "productFidelityScore": 91,
    "packagingFidelityScore": 95,
    "factualityScore": 98,
    "complianceScore": 100,
    "thumbnailScore": 86,
    "ocrScore": 93
  },
  "manualReview": {
    "productIdentity": { "status": "pass", "evidence": "主体轮廓与主图一致" },
    "referenceBinding": { "status": "pass", "evidence": "实际入参包含权威图" },
    "toneConsistency": { "status": "pass", "evidence": "色温与锚点一致" },
    "sceneFit": { "status": "pass", "evidence": "消费场景与模块目标一致" },
    "copyAccuracy": { "status": "pass", "evidence": "标题与事实来源一致" },
    "typography": { "status": "pass", "evidence": "标题层级和留白清楚" },
    "thumbnailImpact": { "status": "pass", "evidence": "缩略图主体和钩子可识别" },
    "factuality": { "status": "pass", "evidence": "无虚构数字或认证" },
    "packagingFidelity": { "status": "not_applicable", "evidence": "包装不出镜" },
    "crossSectionFidelity": { "status": "pass", "evidence": "开口、馅料和方向一致" }
  },
  "decision": "pass|retry|blocked",
  "retryInstruction": ""
}
```

人工审核必须写可观察证据，不能只写“看起来不错”。`decision=pass` 要求所有适用维度通过、实际参考图完整、生成模式为 `image_api`，且已有模型分数不低于门槛。

`planSignature` 绑定审核时的标题、Primary Prompt 和计划参考图。任何一项变化后，旧候选图会变成过期证据，必须重新生成和审核。

## 默认分数门槛

```json
{
  "overallScore": 78,
  "colorConsistencyScore": 85,
  "promptAlignmentScore": 80,
  "typographyScore": 75,
  "productFidelityScore": 88,
  "packagingFidelityScore": 92,
  "factualityScore": 95,
  "complianceScore": 100,
  "thumbnailScore": 82,
  "ocrScore": 90
}
```

模型分数是辅助证据，不能覆盖人工看到的包装变形、横切面重绘、错字或方向错误。模型评分暂时不可用时允许 `scores` 为空，但所有人工维度仍必须完成。

## 阶段校验

- `preflight`：项目、素材角色、中文 Primary Prompt、色板和 section 必要参考图完整。
- `generation`：每个 section 有通过候选图，实际入参满足绑定，人工审核通过，已有分数达到门槛。
- `approval`：包含 generation 的全部要求，并且用户已完成整页审核和明确批准。

任何阶段有 error 都停止进入下一阶段。warning 需要记录理由，但不自动阻断。
