#!/usr/bin/env python3
"""Resolve or start a pinned Motu runtime for the commerce-image workflow."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API_CONTRACT = "motu-api/v2"
WORKFLOW_CONTRACT = "commerce-image-workflow/v2"
DEFAULT_REPOSITORY = "https://github.com/liyaow880715-afk/motu_new.git"
DEFAULT_PORTS = range(3000, 3020)


class BootstrapError(RuntimeError):
    pass


def cache_root() -> Path:
    configured = os.environ.get("MOTU_RUNTIME_CACHE", "").strip()
    return Path(configured).expanduser().resolve() if configured else (Path.home() / ".cache" / "motu-workflow").resolve()


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        handle.write((json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        temporary = handle.name
    os.replace(temporary, path)


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def fetch_health(base_url: str, timeout: float = 3.0) -> dict[str, Any]:
    request = Request(base_url.rstrip("/") + "/api/health", headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise BootstrapError(f"Motu health check failed for {base_url}: {error}") from error
    if not isinstance(payload, dict):
        raise BootstrapError(f"Motu health response is not an object: {base_url}")
    return payload.get("data", payload) if payload.get("success") is True else payload


def assert_compatible(health: dict[str, Any], require_providers: bool = True) -> None:
    if health.get("apiContract") != API_CONTRACT:
        raise BootstrapError(f"Expected {API_CONTRACT}, received {health.get('apiContract')!r}")
    if health.get("workflowContract") != WORKFLOW_CONTRACT:
        raise BootstrapError(f"Expected {WORKFLOW_CONTRACT}, received {health.get('workflowContract')!r}")
    readiness = health.get("readiness") or {}
    if readiness.get("core") is not True:
        raise BootstrapError("Motu core readiness is not satisfied")
    if require_providers and (readiness.get("providers") or {}).get("ready") is not True:
        raise BootstrapError("Motu provider roles are not ready")


def health_result(base_url: str, source: str, require_providers: bool = True) -> dict[str, Any]:
    health = fetch_health(base_url)
    assert_compatible(health, require_providers)
    return {"baseUrl": base_url.rstrip("/"), "source": source, "health": health}


def resolve_runtime(explicit_url: str | None, require_providers: bool = True) -> dict[str, Any] | None:
    candidates: list[tuple[str, str]] = []
    if explicit_url:
        candidates.append((explicit_url, "remote"))
    environment_url = os.environ.get("MOTU_BASE_URL", "").strip()
    if environment_url and environment_url != explicit_url:
        candidates.append((environment_url, "environment"))
    candidates.extend((f"http://127.0.0.1:{port}", "local-desktop") for port in DEFAULT_PORTS)

    errors: list[str] = []
    for url, source in candidates:
        try:
            return health_result(url, source, require_providers)
        except BootstrapError as error:
            errors.append(str(error))
    if explicit_url:
        raise BootstrapError("Explicit Motu service is unusable: " + errors[0])
    return None


def validate_version(version: str) -> None:
    lowered = version.strip().lower()
    if not version.strip() or lowered in {"main", "master", "latest", "head"}:
        raise BootstrapError("--version must be an immutable tag or commit, not a moving branch")


def run(command: list[str], cwd: Path, env: dict[str, str] | None = None, timeout: float = 1800) -> None:
    executable = shutil.which(command[0])
    if not executable:
        raise BootstrapError(f"Required executable was not found: {command[0]}")
    completed = subprocess.run(
        [executable, *command[1:]],
        cwd=cwd,
        env=env,
        timeout=timeout,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    if completed.returncode != 0:
        tail = "\n".join(completed.stdout.splitlines()[-30:])
        raise BootstrapError(f"Command failed ({' '.join(command)}):\n{tail}")


def ensure_source(repository: str, version: str) -> tuple[Path, str]:
    validate_version(version)
    root = cache_root()
    source_key = "".join(character if character.isalnum() or character in ".-_" else "_" for character in version)
    source = root / "sources" / source_key
    lock_path = source / ".motu-source.json"
    lock = read_json(lock_path)
    if source.exists() and lock.get("requestedVersion") == version and lock.get("commit"):
        return source, str(lock["commit"])
    if source.exists():
        raise BootstrapError(f"Cached source exists but does not match the requested version: {source}")

    source.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix="motu-source-", dir=source.parent))
    try:
        run(["git", "init", "--quiet"], temporary)
        run(["git", "remote", "add", "origin", repository], temporary)
        run(["git", "fetch", "--depth", "1", "origin", version], temporary)
        run(["git", "checkout", "--detach", "FETCH_HEAD"], temporary)
        git = shutil.which("git") or "git"
        commit = subprocess.check_output([git, "rev-parse", "HEAD"], cwd=temporary, text=True).strip()
        atomic_json(temporary / ".motu-source.json", {"repository": repository, "requestedVersion": version, "commit": commit})
        os.replace(temporary, source)
        return source, commit
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def runtime_paths(version: str) -> dict[str, Path]:
    key = "".join(character if character.isalnum() or character in ".-_" else "_" for character in version)
    root = cache_root() / "runtimes" / key
    return {
        "root": root,
        "state": root / "runtime.json",
        "secrets": root / "secrets.json",
        "database": root / "data" / "motu.db",
        "storage": root / "data" / "storage",
        "stdout": root / "logs" / "server.log",
    }


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def find_port() -> int:
    for port in range(3020, 3060):
        with socket.socket() as sock:
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise BootstrapError("No free local port in range 3020-3059")


def load_or_create_secrets(path: Path) -> dict[str, str]:
    data = read_json(path)
    if data.get("APP_SECRET") and data.get("ADMIN_SECRET"):
        return {"APP_SECRET": str(data["APP_SECRET"]), "ADMIN_SECRET": str(data["ADMIN_SECRET"])}
    data = {"APP_SECRET": secrets.token_urlsafe(48), "ADMIN_SECRET": secrets.token_urlsafe(32)}
    atomic_json(path, data)
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return data


def build_runtime(source: Path, paths: dict[str, Path], secrets_data: dict[str, str]) -> None:
    marker = paths["root"] / "build-complete.json"
    if marker.exists() and (source / ".next" / "standalone" / "server.js").exists():
        return
    paths["database"].parent.mkdir(parents=True, exist_ok=True)
    paths["storage"].mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update(
        {
            **secrets_data,
            "APP_RUNTIME": "desktop",
            "DATABASE_URL": "file:" + paths["database"].as_posix(),
            "STORAGE_ROOT": str(paths["storage"]),
        }
    )
    run(["npm", "ci", "--no-audit", "--no-fund"], source, env)
    run(["npm", "run", "prisma:deploy"], source, env)
    run(["npm", "run", "build"], source, env)
    atomic_json(marker, {"builtAt": time.time()})


def start_runtime(repository: str, version: str, require_providers: bool) -> dict[str, Any]:
    source, commit = ensure_source(repository, version)
    paths = runtime_paths(version)
    state = read_json(paths["state"])
    if state.get("pid") and pid_alive(int(state["pid"])):
        return health_result(str(state["baseUrl"]), "cached-web-runtime", require_providers)

    paths["root"].mkdir(parents=True, exist_ok=True)
    secrets_data = load_or_create_secrets(paths["secrets"])
    build_runtime(source, paths, secrets_data)
    port = find_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env.update(
        {
            **secrets_data,
            "APP_RUNTIME": "desktop",
            "NODE_ENV": "production",
            "HOSTNAME": "127.0.0.1",
            "PORT": str(port),
            "DATABASE_URL": "file:" + paths["database"].as_posix(),
            "STORAGE_ROOT": str(paths["storage"]),
        }
    )
    paths["stdout"].parent.mkdir(parents=True, exist_ok=True)
    log_handle = paths["stdout"].open("ab")
    flags = 0
    if os.name == "nt":
        flags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
    process = subprocess.Popen(
        [shutil.which("node") or "node", str(source / ".next" / "standalone" / "server.js")],
        cwd=source / ".next" / "standalone",
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        creationflags=flags,
        start_new_session=os.name != "nt",
    )
    log_handle.close()
    atomic_json(
        paths["state"],
        {"pid": process.pid, "baseUrl": base_url, "version": version, "commit": commit, "source": str(source)},
    )
    deadline = time.monotonic() + 90
    last_error = ""
    while time.monotonic() < deadline and process.poll() is None:
        try:
            return health_result(base_url, "cached-web-runtime", require_providers)
        except BootstrapError as error:
            last_error = str(error)
            time.sleep(1)
    if process.poll() is None:
        process.terminate()
    raise BootstrapError(f"Pinned Motu runtime did not become ready: {last_error}")


def stop_runtime(version: str) -> dict[str, Any]:
    paths = runtime_paths(version)
    state = read_json(paths["state"])
    pid = int(state.get("pid") or 0)
    if pid_alive(pid):
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + 10
        while pid_alive(pid) and time.monotonic() < deadline:
            time.sleep(0.2)
        if pid_alive(pid):
            raise BootstrapError(f"Runtime process {pid} did not stop cleanly")
    state["stoppedAt"] = time.time()
    state["pid"] = None
    atomic_json(paths["state"], state)
    return {"stopped": True, "version": version}


def run_self_test() -> dict[str, Any]:
    health = {
        "apiContract": API_CONTRACT,
        "workflowContract": WORKFLOW_CONTRACT,
        "readiness": {"core": True, "providers": {"ready": True}},
    }
    assert_compatible(health)
    try:
        validate_version("main")
    except BootstrapError:
        pass
    else:
        raise BootstrapError("moving branch was not rejected")
    return {"valid": True, "apiContract": API_CONTRACT, "workflowContract": WORKFLOW_CONTRACT}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    resolve = subparsers.add_parser("resolve")
    resolve.add_argument("--base-url")
    resolve.add_argument("--repository", default=os.environ.get("MOTU_REPOSITORY_URL", DEFAULT_REPOSITORY))
    resolve.add_argument("--version")
    resolve.add_argument("--start-web", action="store_true")
    resolve.add_argument("--allow-provider-unready", action="store_true")
    start = subparsers.add_parser("start")
    start.add_argument("--repository", default=os.environ.get("MOTU_REPOSITORY_URL", DEFAULT_REPOSITORY))
    start.add_argument("--version", required=True)
    start.add_argument("--allow-provider-unready", action="store_true")
    stop = subparsers.add_parser("stop")
    stop.add_argument("--version", required=True)
    status = subparsers.add_parser("status")
    status.add_argument("--version", required=True)
    subparsers.add_parser("self-test")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "self-test":
            result = run_self_test()
        elif args.command == "resolve":
            require_providers = not args.allow_provider_unready
            result = resolve_runtime(args.base_url, require_providers)
            if result is None and args.start_web:
                if not args.version:
                    raise BootstrapError("--version is required with --start-web")
                result = start_runtime(args.repository, args.version, require_providers)
            if result is None:
                raise BootstrapError("No compatible remote or desktop Motu service was found")
        elif args.command == "start":
            result = start_runtime(args.repository, args.version, not args.allow_provider_unready)
        elif args.command == "stop":
            result = stop_runtime(args.version)
        else:
            paths = runtime_paths(args.version)
            state = read_json(paths["state"])
            pid = int(state.get("pid") or 0)
            result = {**state, "running": pid_alive(pid)}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (BootstrapError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
