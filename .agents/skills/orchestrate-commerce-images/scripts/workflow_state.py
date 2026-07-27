#!/usr/bin/env python3
"""Create, update, and validate commerce-image workflow state."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from typing import Any
import uuid


SCHEMA_VERSION = "commerce-image-workflow/v2"
API_CONTRACT = "motu-api/v2"
REQUIRED_CAPABILITIES = (
    "signedSessions",
    "projectOwnership",
    "imageUploadValidation",
    "generationIdempotency",
    "taskRecovery",
    "referenceInputAudit",
    "humanApprovalGate",
)
ASSET_ROLES = (
    "main",
    "angle",
    "detail",
    "label",
    "packaging",
    "cross_section",
    "ingredient",
    "reference",
)
DEFAULT_GATES = {
    "overallScore": 78,
    "colorConsistencyScore": 85,
    "promptAlignmentScore": 80,
    "typographyScore": 75,
    "productFidelityScore": 88,
    "packagingFidelityScore": 92,
    "factualityScore": 95,
    "complianceScore": 100,
    "thumbnailScore": 82,
    "ocrScore": 90,
}
BASE_REVIEW_DIMENSIONS = (
    "productIdentity",
    "referenceBinding",
    "toneConsistency",
    "sceneFit",
    "copyAccuracy",
    "typography",
    "thumbnailImpact",
    "factuality",
)
ROLE_AUTHORITIES = {
    "main": ["product_identity"],
    "label": ["factual_copy"],
    "packaging": ["packaging_identity"],
    "cross_section": ["cross_section_geometry"],
}
API_TYPE_ROLES = {
    "MAIN": "main",
    "ANGLE": "angle",
    "DETAIL": "detail",
    "NUTRITION": "label",
    "PACKAGING": "packaging",
    "INGREDIENT": "ingredient",
    "REFERENCE": "reference",
}


class StateError(RuntimeError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def read_json(path: str | Path) -> Any:
    if str(path) == "-":
        return json.load(sys.stdin)
    return json.loads(Path(path).read_text(encoding="utf-8"))


def unwrap_api(payload: Any) -> Any:
    if isinstance(payload, dict) and payload.get("success") is True and "data" in payload:
        return payload["data"]
    return payload


def write_json(path: str | Path, payload: Any) -> None:
    target = Path(path).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as handle:
        handle.write(encoded)
        temp_name = handle.name
    os.replace(temp_name, target)


def get_palette(project: dict[str, Any]) -> list[str]:
    snapshot = project.get("modelSnapshot") or {}
    style_guide = snapshot.get("styleGuide") or {}
    palette = style_guide.get("colorPalette") or {}
    if not isinstance(palette, dict):
        return []
    return list(dict.fromkeys(value for value in palette.values() if isinstance(value, str) and value.strip()))


def plan_signature(section: dict[str, Any]) -> str:
    inputs = section.get("plannedReferenceInputs") or []
    normalized_inputs = [
        {
            "role": item.get("role"),
            "assetId": item.get("assetId"),
            "key": item.get("key"),
        }
        for item in inputs
        if isinstance(item, dict)
    ]
    payload = {
        "id": section.get("id"),
        "type": section.get("type"),
        "title": section.get("title"),
        "primaryPrompt": section.get("primaryPrompt"),
        "plannedReferenceInputs": normalized_inputs,
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def new_state(
    project: dict[str, Any],
    base_url: str,
    health: dict[str, Any] | None = None,
    source_version: str | None = None,
) -> dict[str, Any]:
    stamp = now_iso()
    health = unwrap_api(health or {})
    state = {
        "schemaVersion": SCHEMA_VERSION,
        "workflowId": str(uuid.uuid4()),
        "createdAt": stamp,
        "updatedAt": stamp,
        "phase": "intake",
        "project": {
            "id": str(project.get("id") or ""),
            "name": str(project.get("name") or ""),
            "baseUrl": base_url.rstrip("/"),
        },
        "assets": [],
        "runtime": {
            "appVersion": health.get("version"),
            "apiContract": health.get("apiContract"),
            "workflowContract": health.get("workflowContract"),
            "capabilities": health.get("capabilities") or {},
            "readiness": health.get("readiness") or {},
            "checkedAt": stamp if health else None,
        },
        "source": {
            "version": source_version,
            "pinned": bool(source_version),
        },
        "checkpoints": [],
        "counters": {
            "providerRequests": 0,
            "generationAttempts": 0,
            "successfulGenerations": 0,
            "failedGenerations": 0,
            "estimatedCostUnits": 0.0,
        },
        "retryPolicy": {
            "maxAttemptsPerSection": 3,
            "requireNewIdempotencyKeyAfterFailure": True,
        },
        "toneAnchor": {
            "strategy": "first-approved-section",
            "assetId": None,
            "palette": get_palette(project),
        },
        "gates": dict(DEFAULT_GATES),
        "sections": [],
        "approval": {
            "status": "pending",
            "fullPageReviewed": False,
            "reviewedBy": None,
            "notes": "",
        },
    }
    return sync_project(state, project)


def sync_project(state: dict[str, Any], project: dict[str, Any]) -> dict[str, Any]:
    old_assets = {item.get("id"): item for item in state.get("assets", [])}
    assets: list[dict[str, Any]] = []
    for asset in project.get("assets", []):
        asset_id = str(asset.get("id") or "")
        previous = old_assets.get(asset_id, {})
        api_type = str(asset.get("type") or "REFERENCE")
        metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
        assets.append(
            {
                "id": asset_id,
                "fileName": str(asset.get("fileName") or asset_id),
                "apiType": api_type,
                "role": previous.get("role") or API_TYPE_ROLES.get(api_type, "reference"),
                "authoritativeFor": previous.get("authoritativeFor", []),
                "confirmed": bool(previous.get("confirmed", False)),
                "url": asset.get("url"),
                "uploadAssetId": asset_id,
                "sha256": metadata.get("sha256") or previous.get("sha256"),
                "bytes": metadata.get("bytes") or previous.get("bytes"),
                "width": metadata.get("width") or previous.get("width"),
                "height": metadata.get("height") or previous.get("height"),
            }
        )

    old_sections = {item.get("id"): item for item in state.get("sections", [])}
    sections: list[dict[str, Any]] = []
    for section in project.get("sections", []):
        section_id = str(section.get("id") or "")
        previous = old_sections.get(section_id, {})
        planned_inputs = section.get("inputReferenceAssets") or []
        auto_required = [
            item.get("assetId")
            for item in planned_inputs
            if item.get("role") == "product" and isinstance(item.get("assetId"), str)
        ]
        section_record = {
                "id": section_id,
                "key": str(section.get("sectionKey") or ""),
                "type": str(section.get("type") or ""),
                "title": str(section.get("title") or ""),
                "primaryPrompt": str(section.get("visualPrompt") or ""),
                "requirements": previous.get(
                    "requirements",
                    {"packagingFidelity": False, "crossSectionFidelity": False},
                ),
                "requiredReferenceAssetIds": previous.get("requiredReferenceAssetIds") or auto_required,
                "plannedReferenceInputs": planned_inputs,
                "attempts": previous.get("attempts", []),
                "status": previous.get("status", "pending"),
            }
        section_record["planSignature"] = plan_signature(section_record)
        if previous.get("planSignature") and previous.get("planSignature") != section_record["planSignature"]:
            section_record["status"] = "pending"
        sections.append(section_record)

    state["assets"] = assets
    state["sections"] = sections
    state["project"]["id"] = str(project.get("id") or state["project"].get("id") or "")
    state["project"]["name"] = str(project.get("name") or state["project"].get("name") or "")
    palette = get_palette(project)
    if palette:
        state["toneAnchor"]["palette"] = palette
    if state.get("phase") in (None, "intake", "preflight"):
        state["phase"] = "preflight"
    state["updatedAt"] = now_iso()
    return state


def find_item(items: list[dict[str, Any]], item_id: str, label: str) -> dict[str, Any]:
    for item in items:
        if item.get("id") == item_id:
            return item
    raise StateError(f"{label} not found: {item_id}")


def score_from_file(path: str | None, asset_id: str) -> dict[str, Any] | None:
    if not path:
        return None
    payload = unwrap_api(read_json(path))
    if isinstance(payload, dict) and isinstance(payload.get("scores"), list):
        matches = [item for item in payload["scores"] if item.get("assetId") == asset_id]
        if not matches:
            raise StateError(f"Score file has no score for asset: {asset_id}")
        return matches[0]
    if isinstance(payload, dict):
        return payload
    raise StateError("Score JSON must be an object or contain a scores array")


def generation_from_file(path: str | None) -> tuple[str | None, str | None, list[str], str | None, str | None]:
    if not path:
        return None, None, [], None, None
    payload = unwrap_api(read_json(path))
    if not isinstance(payload, dict):
        raise StateError("Generation JSON must contain one result object")
    asset = payload.get("imageAsset") or {}
    metadata = asset.get("metadata") or {}
    references = metadata.get("sourceReferenceAssetIds") or []
    if not references and isinstance(metadata.get("providerReferenceInputs"), list):
        references = [
            item.get("assetId")
            for item in metadata["providerReferenceInputs"]
            if isinstance(item, dict) and isinstance(item.get("assetId"), str)
        ]
    return (
        asset.get("id") if isinstance(asset.get("id"), str) else None,
        payload.get("generationMode") if isinstance(payload.get("generationMode"), str) else metadata.get("mode"),
        [item for item in references if isinstance(item, str)],
        payload.get("idempotencyKey") if isinstance(payload.get("idempotencyKey"), str) else None,
        payload.get("taskId") if isinstance(payload.get("taskId"), str) else None,
    )


def review_status(entry: Any) -> str | None:
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict):
        value = entry.get("status")
        return value if isinstance(value, str) else None
    return None


def review_evidence(entry: Any) -> str:
    if isinstance(entry, dict) and isinstance(entry.get("evidence"), str):
        return entry["evidence"].strip()
    return ""


def validate_state(state: dict[str, Any], phase: str) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if state.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(f"schemaVersion must be {SCHEMA_VERSION}")
    project = state.get("project") or {}
    if not project.get("id"):
        errors.append("project.id is required")
    if not project.get("name"):
        errors.append("project.name is required")
    if not str(project.get("baseUrl") or "").startswith(("http://", "https://")):
        errors.append("project.baseUrl must be an HTTP(S) URL")

    runtime = state.get("runtime") or {}
    if runtime.get("apiContract") != API_CONTRACT:
        errors.append(f"runtime.apiContract must be {API_CONTRACT}")
    if runtime.get("workflowContract") != SCHEMA_VERSION:
        errors.append(f"runtime.workflowContract must be {SCHEMA_VERSION}")
    if not runtime.get("appVersion"):
        errors.append("runtime.appVersion is required")
    capabilities = runtime.get("capabilities") or {}
    for capability in REQUIRED_CAPABILITIES:
        if capabilities.get(capability) is not True:
            errors.append(f"runtime capability is required: {capability}")
    readiness = runtime.get("readiness") or {}
    if readiness.get("core") is not True:
        errors.append("runtime core readiness must pass before workflow execution")
    if (readiness.get("providers") or {}).get("ready") is not True:
        errors.append("runtime provider readiness must pass before workflow execution")
    source = state.get("source") or {}
    if source.get("pinned") is not True or not source.get("version"):
        errors.append("source.version must be pinned for a recoverable workflow")

    assets = state.get("assets") or []
    asset_ids = [item.get("id") for item in assets]
    if len(asset_ids) != len(set(asset_ids)):
        errors.append("asset ids must be unique")
    asset_by_id = {item.get("id"): item for item in assets}
    confirmed_main = [item for item in assets if item.get("role") == "main" and item.get("confirmed")]
    if not confirmed_main:
        errors.append("at least one confirmed main asset is required")
    for asset in assets:
        if asset.get("confirmed") and not asset.get("sha256"):
            errors.append(f"confirmed asset {asset.get('id')} must include sha256")

    tone_anchor = state.get("toneAnchor") or {}
    palette = tone_anchor.get("palette") or []
    if len(set(palette)) < 3:
        errors.append("toneAnchor.palette must contain at least 3 distinct colors")
    if tone_anchor.get("strategy") != "first-approved-section":
        warnings.append("toneAnchor.strategy should normally be first-approved-section")

    sections = state.get("sections") or []
    if not sections:
        errors.append("at least one section is required")
    for section in sections:
        label = section.get("key") or section.get("id") or "unknown-section"
        prompt = str(section.get("primaryPrompt") or "")
        if not re.search(r"[\u3400-\u9fff]", prompt):
            errors.append(f"{label}: primaryPrompt must contain Chinese instructions")
        required = section.get("requiredReferenceAssetIds") or []
        if not required:
            errors.append(f"{label}: at least one required reference asset is required")
        if len(required) > 6:
            errors.append(f"{label}: required references exceed the model limit of 6")
        for asset_id in required:
            asset = asset_by_id.get(asset_id)
            if not asset:
                errors.append(f"{label}: unknown required reference asset {asset_id}")
            elif not asset.get("confirmed"):
                errors.append(f"{label}: required reference asset {asset_id} is not visually confirmed")
        requirements = section.get("requirements") or {}
        if requirements.get("packagingFidelity"):
            matches = [asset_by_id.get(item) for item in required]
            if not any(item and item.get("role") == "packaging" for item in matches):
                errors.append(f"{label}: packaging fidelity requires a packaging reference")
        if requirements.get("crossSectionFidelity"):
            matches = [asset_by_id.get(item) for item in required]
            cross_sections = [item for item in matches if item and item.get("role") == "cross_section"]
            if len(cross_sections) != 1:
                errors.append(f"{label}: cross-section fidelity requires exactly one authoritative cross_section reference")

    if phase in ("generation", "approval"):
        passed_asset_ids: set[str] = set()
        gates = state.get("gates") or DEFAULT_GATES
        for section in sections:
            label = section.get("key") or section.get("id") or "unknown-section"
            attempts = section.get("attempts") or []
            max_attempts = int((state.get("retryPolicy") or {}).get("maxAttemptsPerSection", 3))
            if len(attempts) > max_attempts:
                errors.append(f"{label}: more than {max_attempts} generation attempts recorded")
            passed = [item for item in attempts if item.get("decision") == "pass"]
            if not passed:
                errors.append(f"{label}: no passing generation attempt")
                continue
            attempt = passed[-1]
            passed_asset_ids.add(str(attempt.get("assetId") or ""))
            if attempt.get("planSignature") != section.get("planSignature"):
                errors.append(f"{label}: passing attempt was reviewed against a stale prompt/reference plan")
            if attempt.get("generationMode") != "image_api":
                errors.append(f"{label}: passing attempt must use generationMode=image_api")
            if not attempt.get("idempotencyKey"):
                errors.append(f"{label}: passing attempt must record idempotencyKey")
            if not attempt.get("taskId"):
                errors.append(f"{label}: passing attempt must record taskId")
            required = set(section.get("requiredReferenceAssetIds") or [])
            actual = set(attempt.get("actualReferenceAssetIds") or [])
            missing = sorted(required - actual)
            if missing:
                errors.append(f"{label}: passing attempt omitted required references: {', '.join(missing)}")
            manual = attempt.get("manualReview") or {}
            dimensions = list(BASE_REVIEW_DIMENSIONS)
            requirements = section.get("requirements") or {}
            if requirements.get("packagingFidelity"):
                dimensions.append("packagingFidelity")
            if requirements.get("crossSectionFidelity"):
                dimensions.append("crossSectionFidelity")
            for dimension in dimensions:
                entry = manual.get(dimension)
                if review_status(entry) != "pass":
                    errors.append(f"{label}: manual review {dimension} must pass")
                elif not review_evidence(entry):
                    errors.append(f"{label}: manual review {dimension} needs observable evidence")
            scores = attempt.get("scores")
            if not scores:
                warnings.append(f"{label}: model quality score is unavailable; relying on manual review")
            else:
                for metric, threshold in gates.items():
                    if metric == "packagingFidelityScore" and not requirements.get("packagingFidelity"):
                        continue
                    value = scores.get(metric)
                    if value is None:
                        warnings.append(f"{label}: score {metric} is missing")
                    elif not isinstance(value, (int, float)) or value < threshold:
                        errors.append(f"{label}: {metric}={value} is below gate {threshold}")

        anchor_asset_id = tone_anchor.get("assetId")
        if not anchor_asset_id:
            errors.append("toneAnchor.assetId must reference the first accepted generated image")
        elif anchor_asset_id not in passed_asset_ids:
            errors.append("toneAnchor.assetId must be a passing section attempt")

    if phase == "approval":
        approval = state.get("approval") or {}
        if approval.get("status") != "approved":
            errors.append("approval.status must be approved after explicit user confirmation")
        if approval.get("fullPageReviewed") is not True:
            errors.append("approval.fullPageReviewed must be true")
        if not str(approval.get("reviewedBy") or "").strip():
            errors.append("approval.reviewedBy is required")

    return errors, warnings


def run_self_test() -> dict[str, Any]:
    project = {
        "id": "dry-project",
        "name": "Dry Run Product",
        "modelSnapshot": {
            "styleGuide": {
                "colorPalette": {
                    "primary": "#C62828",
                    "secondary": "#F9A825",
                    "background": "#FFF8E1",
                    "accent": "#1B5E20",
                }
            }
        },
        "assets": [
            {"id": "main", "fileName": "main.jpg", "type": "MAIN", "url": "/main.jpg", "metadata": {"sha256": "a" * 64}},
            {"id": "cut", "fileName": "cut.jpg", "type": "ANGLE", "url": "/cut.jpg", "metadata": {"sha256": "b" * 64}},
            {"id": "pack", "fileName": "pack.jpg", "type": "PACKAGING", "url": "/pack.jpg", "metadata": {"sha256": "c" * 64}},
        ],
        "sections": [
            {
                "id": "hero",
                "sectionKey": "hero_01",
                "type": "HERO",
                "title": "鲜香看得见",
                "visualPrompt": "真实餐桌夹取场景，暖色主光，锁定唯一横切面的开口、皮厚、馅料和方向。",
                "inputReferenceAssets": [
                    {"role": "product", "assetId": "main"},
                    {"role": "product", "assetId": "cut"},
                ],
            },
            {
                "id": "pack-section",
                "sectionKey": "detail_packaging",
                "type": "PACKAGING",
                "title": "包装信息",
                "visualPrompt": "真实厨房台面组合，锁定包装轮廓、文字方向、Logo、色块和标签层级。",
                "inputReferenceAssets": [
                    {"role": "product", "assetId": "main"},
                    {"role": "product", "assetId": "pack"},
                ],
            },
        ],
    }
    health = {
        "version": "0.10.17",
        "apiContract": API_CONTRACT,
        "workflowContract": SCHEMA_VERSION,
        "capabilities": {key: True for key in REQUIRED_CAPABILITIES},
        "readiness": {"core": True, "providers": {"ready": True}},
    }
    state = new_state(project, "http://127.0.0.1:3000", health, "v0.10.17")
    for asset in state["assets"]:
        asset["confirmed"] = True
        if asset["id"] == "cut":
            asset["role"] = "cross_section"
        asset["authoritativeFor"] = ROLE_AUTHORITIES.get(asset["role"], [])
    hero, packaging = state["sections"]
    hero["requirements"]["crossSectionFidelity"] = True
    packaging["requirements"]["packagingFidelity"] = True

    preflight_errors, preflight_warnings = validate_state(state, "preflight")
    if preflight_errors:
        raise StateError(f"self-test preflight failed: {preflight_errors}")

    common_review = {
        dimension: {"status": "pass", "evidence": f"observable evidence for {dimension}"}
        for dimension in BASE_REVIEW_DIMENSIONS
    }
    hero_review = {**common_review, "crossSectionFidelity": {"status": "pass", "evidence": "shape and filling match"}}
    pack_review = {**common_review, "packagingFidelity": {"status": "pass", "evidence": "shape and text direction match"}}
    hero["attempts"] = [{
        "attempt": 1,
        "createdAt": now_iso(),
        "assetId": "generated-hero",
        "generationMode": "image_api",
        "idempotencyKey": "generation:self-test-hero",
        "taskId": "task-hero",
        "actualReferenceAssetIds": ["main", "cut"],
        "planSignature": hero["planSignature"],
        "scores": None,
        "manualReview": hero_review,
        "decision": "pass",
        "retryInstruction": "",
    }]
    hero["status"] = "passed"
    packaging["attempts"] = [{
        "attempt": 1,
        "createdAt": now_iso(),
        "assetId": "generated-pack",
        "generationMode": "image_api",
        "idempotencyKey": "generation:self-test-pack",
        "taskId": "task-pack",
        "actualReferenceAssetIds": ["main", "pack"],
        "planSignature": packaging["planSignature"],
        "scores": None,
        "manualReview": pack_review,
        "decision": "pass",
        "retryInstruction": "",
    }]
    packaging["status"] = "passed"
    state["toneAnchor"]["assetId"] = "generated-hero"
    generation_errors, generation_warnings = validate_state(state, "generation")
    if generation_errors:
        raise StateError(f"self-test generation failed: {generation_errors}")

    stale_state = json.loads(json.dumps(state))
    stale_state["sections"][0]["primaryPrompt"] += " 改变镜头。"
    stale_state["sections"][0]["planSignature"] = plan_signature(stale_state["sections"][0])
    stale_errors, _ = validate_state(stale_state, "generation")
    if not any("stale prompt/reference plan" in error for error in stale_errors):
        raise StateError("self-test failed to reject a stale reviewed attempt")

    state["approval"] = {
        "status": "approved",
        "fullPageReviewed": True,
        "reviewedBy": "self-test-user",
        "notes": "self-test",
    }
    approval_errors, approval_warnings = validate_state(state, "approval")
    if approval_errors:
        raise StateError(f"self-test approval failed: {approval_errors}")
    return {
        "valid": True,
        "sections": len(state["sections"]),
        "warnings": list(dict.fromkeys(preflight_warnings + generation_warnings + approval_warnings)),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    init = subparsers.add_parser("init")
    init.add_argument("--project-json", required=True)
    init.add_argument("--base-url", default=os.environ.get("MOTU_BASE_URL", "http://127.0.0.1:3000"))
    init.add_argument("--health-json", required=True, help="Result from motu_api.py health")
    init.add_argument("--source-version", required=True, help="Pinned tag or commit used by this workflow")
    init.add_argument("--output", required=True)

    sync = subparsers.add_parser("sync")
    sync.add_argument("--state", required=True)
    sync.add_argument("--project-json", required=True)

    set_role = subparsers.add_parser("set-asset-role")
    set_role.add_argument("--state", required=True)
    set_role.add_argument("--asset-id", required=True)
    set_role.add_argument("--role", required=True, choices=ASSET_ROLES)
    set_role.add_argument("--authoritative-for", action="append")

    bind = subparsers.add_parser("bind-section")
    bind.add_argument("--state", required=True)
    bind.add_argument("--section-id", required=True)
    bind.add_argument("--required-reference-asset-id", action="append", required=True)
    bind.add_argument("--packaging-fidelity", action=argparse.BooleanOptionalAction, default=None)
    bind.add_argument("--cross-section-fidelity", action=argparse.BooleanOptionalAction, default=None)

    record = subparsers.add_parser("record-attempt")
    record.add_argument("--state", required=True)
    record.add_argument("--section-id", required=True)
    record.add_argument("--generation-json", help="Motu generate response; infers asset, mode, and actual references")
    record.add_argument("--asset-id")
    record.add_argument("--generation-mode")
    record.add_argument("--actual-reference-asset-id", action="append", default=[])
    record.add_argument("--scores-json")
    record.add_argument("--manual-review-json", required=True)
    record.add_argument("--decision", required=True, choices=["pass", "retry", "blocked"])
    record.add_argument("--retry-instruction", default="")
    record.add_argument("--idempotency-key")
    record.add_argument("--task-id")
    record.add_argument("--cost-units", type=float, default=1.0)

    checkpoint = subparsers.add_parser("checkpoint")
    checkpoint.add_argument("--state", required=True)
    checkpoint.add_argument("--operation", required=True)
    checkpoint.add_argument("--status", required=True, choices=["pending", "running", "success", "failed", "ambiguous"])
    checkpoint.add_argument("--idempotency-key", required=True)
    checkpoint.add_argument("--task-id")
    checkpoint.add_argument("--details", default="")

    approve = subparsers.add_parser("approve")
    approve.add_argument("--state", required=True)
    approve.add_argument("--status", required=True, choices=["pending", "approved", "rejected"])
    approve.add_argument("--reviewed-by")
    approve.add_argument("--notes", default="")
    approve.add_argument("--full-page-reviewed", action="store_true")

    validate = subparsers.add_parser("validate")
    validate.add_argument("--state", required=True)
    validate.add_argument("--phase", required=True, choices=["preflight", "generation", "approval"])

    subparsers.add_parser("self-test")

    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "self-test":
            print(json.dumps(run_self_test(), ensure_ascii=False, indent=2))
            return 0

        if args.command == "init":
            project = unwrap_api(read_json(args.project_json))
            if not isinstance(project, dict):
                raise StateError("Project JSON must contain one project object")
            health = unwrap_api(read_json(args.health_json))
            if not isinstance(health, dict):
                raise StateError("Health JSON must contain one object")
            state = new_state(project, args.base_url, health, args.source_version)
            write_json(args.output, state)
            print(json.dumps({"state": str(Path(args.output).resolve()), "projectId": state["project"]["id"]}, ensure_ascii=False))
            return 0

        state = read_json(args.state)
        if not isinstance(state, dict):
            raise StateError("Workflow state must be a JSON object")

        if args.command == "sync":
            project = unwrap_api(read_json(args.project_json))
            if not isinstance(project, dict):
                raise StateError("Project JSON must contain one project object")
            sync_project(state, project)

        elif args.command == "set-asset-role":
            asset = find_item(state.get("assets", []), args.asset_id, "Asset")
            asset["role"] = args.role
            asset["confirmed"] = True
            asset["authoritativeFor"] = args.authoritative_for or ROLE_AUTHORITIES.get(args.role, [])
            state["updatedAt"] = now_iso()

        elif args.command == "bind-section":
            section = find_item(state.get("sections", []), args.section_id, "Section")
            section["requiredReferenceAssetIds"] = list(dict.fromkeys(args.required_reference_asset_id))
            requirements = section.setdefault("requirements", {})
            if args.packaging_fidelity is not None:
                requirements["packagingFidelity"] = args.packaging_fidelity
            if args.cross_section_fidelity is not None:
                requirements["crossSectionFidelity"] = args.cross_section_fidelity
            state["updatedAt"] = now_iso()

        elif args.command == "record-attempt":
            section = find_item(state.get("sections", []), args.section_id, "Section")
            inferred_asset_id, inferred_mode, inferred_references, inferred_key, inferred_task_id = generation_from_file(args.generation_json)
            asset_id = args.asset_id or inferred_asset_id
            generation_mode = args.generation_mode or inferred_mode
            actual_references = args.actual_reference_asset_id or inferred_references
            if not asset_id or not generation_mode:
                raise StateError("record-attempt requires --generation-json or both --asset-id and --generation-mode")
            manual_review = unwrap_api(read_json(args.manual_review_json))
            if not isinstance(manual_review, dict):
                raise StateError("Manual review JSON must be an object")
            attempts = section.setdefault("attempts", [])
            attempts.append(
                {
                    "attempt": len(attempts) + 1,
                    "createdAt": now_iso(),
                    "assetId": asset_id,
                    "generationMode": generation_mode,
                    "idempotencyKey": args.idempotency_key or inferred_key,
                    "taskId": args.task_id or inferred_task_id,
                    "actualReferenceAssetIds": list(dict.fromkeys(actual_references)),
                    "planSignature": section.get("planSignature"),
                    "scores": score_from_file(args.scores_json, asset_id),
                    "manualReview": manual_review,
                    "decision": args.decision,
                    "retryInstruction": args.retry_instruction,
                }
            )
            section["status"] = {"pass": "passed", "retry": "retry", "blocked": "blocked"}[args.decision]
            state["phase"] = "review" if args.decision == "pass" else "generating"
            if args.decision == "pass" and not state.get("toneAnchor", {}).get("assetId"):
                state["toneAnchor"]["assetId"] = asset_id
            counters = state.setdefault("counters", {})
            counters["providerRequests"] = int(counters.get("providerRequests", 0)) + 1
            counters["generationAttempts"] = int(counters.get("generationAttempts", 0)) + 1
            counter_key = "successfulGenerations" if args.decision == "pass" else "failedGenerations"
            counters[counter_key] = int(counters.get(counter_key, 0)) + 1
            counters["estimatedCostUnits"] = float(counters.get("estimatedCostUnits", 0.0)) + args.cost_units
            state["updatedAt"] = now_iso()

        elif args.command == "checkpoint":
            checkpoints = state.setdefault("checkpoints", [])
            record = next((item for item in checkpoints if item.get("operation") == args.operation), None)
            if record is None:
                record = {"operation": args.operation, "createdAt": now_iso()}
                checkpoints.append(record)
            record.update(
                {
                    "status": args.status,
                    "idempotencyKey": args.idempotency_key,
                    "taskId": args.task_id,
                    "details": args.details,
                    "updatedAt": now_iso(),
                }
            )
            state["updatedAt"] = now_iso()

        elif args.command == "approve":
            state["approval"] = {
                "status": args.status,
                "fullPageReviewed": args.full_page_reviewed,
                "reviewedBy": args.reviewed_by,
                "notes": args.notes,
            }
            state["phase"] = "approved" if args.status == "approved" else "approval"
            state["updatedAt"] = now_iso()

        elif args.command == "validate":
            errors, warnings = validate_state(state, args.phase)
            print(json.dumps({"valid": not errors, "phase": args.phase, "errors": errors, "warnings": warnings}, ensure_ascii=False, indent=2))
            return 0 if not errors else 1

        write_json(args.state, state)
        print(json.dumps({"state": str(Path(args.state).resolve()), "updatedAt": state["updatedAt"]}, ensure_ascii=False))
        return 0
    except (StateError, OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
