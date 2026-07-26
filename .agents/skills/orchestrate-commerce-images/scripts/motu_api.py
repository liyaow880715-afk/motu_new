#!/usr/bin/env python3
"""Small, dependency-free client for the Motu local application API."""

from __future__ import annotations

import argparse
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import sys
import tempfile
from threading import Thread
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urljoin
from urllib.request import Request, urlopen


class ApiError(RuntimeError):
    pass


def load_json_arg(value: str) -> Any:
    if value.startswith("@"):
        return json.loads(Path(value[1:]).read_text(encoding="utf-8"))
    return json.loads(value)


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        handle.write(data)
        temp_name = handle.name
    os.replace(temp_name, path)


class MotuClient:
    def __init__(self, base_url: str, timeout: float):
        self.base_url = base_url.rstrip("/") + "/"
        self.timeout = timeout
        self.access_key = os.environ.get("MOTU_ACCESS_KEY", "").strip()

    def absolute_url(self, path_or_url: str) -> str:
        if path_or_url.startswith(("http://", "https://")):
            return path_or_url
        return urljoin(self.base_url, path_or_url.lstrip("/"))

    def request(self, method: str, path: str, body: Any | None = None) -> Any:
        headers = {"Accept": "application/json"}
        if self.access_key:
            headers["x-access-key"] = self.access_key
        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = Request(self.absolute_url(path), data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
        except HTTPError as error:
            raw = error.read()
            detail = raw.decode("utf-8", errors="replace")
            try:
                payload = json.loads(detail)
                detail = json.dumps(payload, ensure_ascii=False)
            except json.JSONDecodeError:
                pass
            raise ApiError(f"HTTP {error.code} {method} {path}: {detail}") from error
        except (URLError, TimeoutError) as error:
            raise ApiError(f"Request failed {method} {path}: {error}") from error

        if not raw:
            return None
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ApiError(f"Non-JSON response from {method} {path}") from error

        if isinstance(payload, dict) and "success" in payload:
            if not payload.get("success"):
                error = payload.get("error") or payload
                raise ApiError(json.dumps(error, ensure_ascii=False))
            return payload.get("data")
        return payload

    def download(self, path_or_url: str) -> bytes:
        headers: dict[str, str] = {}
        if self.access_key:
            headers["x-access-key"] = self.access_key
        request = Request(self.absolute_url(path_or_url), headers=headers, method="GET")
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError) as error:
            raise ApiError(f"Download failed {path_or_url}: {error}") from error


def run_self_test() -> dict[str, Any]:
    requests: list[dict[str, Any]] = []

    class Handler(BaseHTTPRequestHandler):
        def respond(self, data: Any, status: int = 200) -> None:
            encoded = json.dumps({"success": True, "data": data}).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self) -> None:  # noqa: N802
            requests.append({"method": "GET", "path": self.path})
            if self.path == "/api/projects":
                self.respond([{"id": "project-1", "name": "Test Product"}])
            elif self.path == "/api/projects/project-1":
                self.respond({"id": "project-1", "name": "Test Product", "assets": [], "sections": []})
            else:
                self.respond({"message": "not found"}, 404)

        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            requests.append({"method": "POST", "path": self.path, "body": body})
            self.respond({"received": body}, 201)

        def log_message(self, _format: str, *_args: Any) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        client = MotuClient(f"http://{host}:{port}", timeout=5)
        projects = client.request("GET", "/api/projects")
        project = client.request("GET", "/api/projects/project-1")
        echoed = client.request("POST", "/api/projects/project-1/analyze", {"modelId": "vision-test"})
        if projects[0]["id"] != "project-1" or project["name"] != "Test Product":
            raise ApiError("self-test response unwrapping failed")
        if echoed.get("received", {}).get("modelId") != "vision-test":
            raise ApiError("self-test request encoding failed")
        return {"valid": True, "requests": requests}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def project_path(project_id: str) -> str:
    return f"/api/projects/{quote(project_id, safe='')}"


def section_path(project_id: str, section_id: str) -> str:
    return f"{project_path(project_id)}/sections/{quote(section_id, safe='')}"


def run_command(client: MotuClient, args: argparse.Namespace) -> Any:
    if args.command == "projects":
        projects = client.request("GET", "/api/projects")
        if args.name:
            query = args.name.casefold()
            projects = [item for item in projects if query in str(item.get("name", "")).casefold()]
        return projects

    if args.command == "project":
        return client.request("GET", project_path(args.project_id))

    if args.command == "create":
        body = {
            "name": args.name,
            "platform": args.platform,
            "style": args.style,
            "mode": args.mode,
        }
        for key in ("description", "product_info", "category", "selling_points", "target_audience"):
            value = getattr(args, key)
            if value is not None:
                body["".join([key.split("_")[0], *[part.title() for part in key.split("_")[1:]]])] = value
        return client.request("POST", "/api/projects", body)

    if args.command == "upload":
        file_path = Path(args.file).expanduser().resolve()
        if not file_path.is_file():
            raise ApiError(f"Upload file does not exist: {file_path}")
        mime_type = args.mime_type or mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        body = {
            "type": args.type,
            "fileName": file_path.name,
            "mimeType": mime_type,
            "base64Data": base64.b64encode(file_path.read_bytes()).decode("ascii"),
            "variantId": args.variant_id,
        }
        return client.request("POST", f"{project_path(args.project_id)}/assets/upload", body)

    if args.command == "analyze":
        return client.request("POST", f"{project_path(args.project_id)}/analyze", {"modelId": args.model_id})

    if args.command == "plan":
        body: dict[str, Any] = {}
        if args.model_id:
            body["modelId"] = args.model_id
        if args.auto_decide_counts:
            body["autoDecideCounts"] = True
        if args.palette_style:
            body["paletteStyle"] = args.palette_style
        if args.preview_config:
            body["previewConfig"] = load_json_arg(args.preview_config)
        return client.request("POST", f"{project_path(args.project_id)}/plan-sections", body)

    if args.command == "patch-section":
        patch = load_json_arg(args.patch)
        if not isinstance(patch, dict):
            raise ApiError("Section patch must be a JSON object")
        return client.request("PATCH", section_path(args.project_id, args.section_id), patch)

    if args.command == "generate":
        body = {
            "modelId": args.model_id,
            "referenceAssetIds": args.reference_asset_id,
            "editMode": args.edit_mode,
        }
        return client.request("POST", f"{section_path(args.project_id, args.section_id)}/{args.action}", body)

    if args.command == "tasks":
        return client.request("GET", f"{project_path(args.project_id)}/tasks")

    if args.command == "scores":
        return client.request("GET", f"{project_path(args.project_id)}/scores")

    if args.command == "wait-score":
        deadline = time.monotonic() + args.wait_timeout
        while True:
            payload = client.request("GET", f"{project_path(args.project_id)}/scores")
            scores = payload.get("scores", []) if isinstance(payload, dict) else []
            matches = [score for score in scores if score.get("assetId") == args.asset_id]
            if matches:
                matches.sort(key=lambda score: str(score.get("createdAt", "")), reverse=True)
                return matches[0]
            if time.monotonic() >= deadline:
                raise ApiError(f"No score for asset {args.asset_id} after {args.wait_timeout:.0f}s")
            time.sleep(args.poll_interval)

    if args.command == "download":
        target = Path(args.file_output).expanduser().resolve()
        content = client.download(args.url)
        atomic_write(target, content)
        return {"path": str(target), "bytes": len(content)}

    raise ApiError(f"Unknown command: {args.command}")


def add_common(parser: argparse.ArgumentParser, default_timeout: float = 30.0) -> None:
    parser.add_argument("--base-url", default=os.environ.get("MOTU_BASE_URL", "http://127.0.0.1:3000"))
    parser.add_argument("--timeout", type=float, default=default_timeout)
    parser.add_argument("--json-output", help="Atomically write the JSON result to this file")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    projects = subparsers.add_parser("projects")
    add_common(projects)
    projects.add_argument("--name", help="Case-insensitive name substring")

    project = subparsers.add_parser("project")
    add_common(project)
    project.add_argument("--project-id", required=True)

    create = subparsers.add_parser("create")
    add_common(create)
    create.add_argument("--name", required=True)
    create.add_argument("--platform", required=True)
    create.add_argument("--style", required=True)
    create.add_argument("--mode", choices=["single", "multi"], default="single")
    create.add_argument("--description")
    create.add_argument("--product-info")
    create.add_argument("--category")
    create.add_argument("--selling-points")
    create.add_argument("--target-audience")

    upload = subparsers.add_parser("upload")
    add_common(upload, 120.0)
    upload.add_argument("--project-id", required=True)
    upload.add_argument("--file", required=True)
    upload.add_argument(
        "--type",
        required=True,
        choices=["MAIN", "ANGLE", "DETAIL", "REFERENCE", "PACKAGING", "NUTRITION", "INGREDIENT"],
    )
    upload.add_argument("--mime-type")
    upload.add_argument("--variant-id")

    analyze = subparsers.add_parser("analyze")
    add_common(analyze, 330.0)
    analyze.add_argument("--project-id", required=True)
    analyze.add_argument("--model-id")

    plan = subparsers.add_parser("plan")
    add_common(plan, 330.0)
    plan.add_argument("--project-id", required=True)
    plan.add_argument("--model-id")
    plan.add_argument("--auto-decide-counts", action="store_true")
    plan.add_argument("--palette-style", choices=["safe", "contrast", "bold"])
    plan.add_argument("--preview-config", help="JSON object or @path/to/file.json")

    patch_section = subparsers.add_parser("patch-section")
    add_common(patch_section)
    patch_section.add_argument("--project-id", required=True)
    patch_section.add_argument("--section-id", required=True)
    patch_section.add_argument("--patch", required=True, help="JSON object or @path/to/file.json")

    generate = subparsers.add_parser("generate")
    add_common(generate, 390.0)
    generate.add_argument("--project-id", required=True)
    generate.add_argument("--section-id", required=True)
    generate.add_argument("--action", choices=["generate", "regenerate", "edit"], default="generate")
    generate.add_argument("--model-id")
    generate.add_argument("--reference-asset-id", action="append", default=[])
    generate.add_argument("--edit-mode", choices=["repaint", "enhance"], default="repaint")

    tasks = subparsers.add_parser("tasks")
    add_common(tasks)
    tasks.add_argument("--project-id", required=True)

    scores = subparsers.add_parser("scores")
    add_common(scores)
    scores.add_argument("--project-id", required=True)

    wait_score = subparsers.add_parser("wait-score")
    add_common(wait_score)
    wait_score.add_argument("--project-id", required=True)
    wait_score.add_argument("--asset-id", required=True)
    wait_score.add_argument("--wait-timeout", type=float, default=180.0)
    wait_score.add_argument("--poll-interval", type=float, default=5.0)

    download = subparsers.add_parser("download")
    add_common(download, 60.0)
    download.add_argument("--url", required=True)
    download.add_argument("--file-output", required=True)

    subparsers.add_parser("self-test")

    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "self-test":
            result = run_self_test()
            sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
            return 0
        result = run_command(MotuClient(args.base_url, args.timeout), args)
        encoded = (json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        if args.json_output:
            atomic_write(Path(args.json_output).expanduser().resolve(), encoded)
        sys.stdout.buffer.write(encoded)
        return 0
    except (ApiError, OSError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
