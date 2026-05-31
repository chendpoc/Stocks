"""Start trader-agent on :8000 — always the build that mounts /api/intel."""

from __future__ import annotations

import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parents[2]
HOST = "127.0.0.1"
PORT = 8000
MIN_INTEL_ROUTES = 14


def _health() -> dict | None:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{PORT}/health", timeout=2) as response:
            return json.loads(response.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def _port_open() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        return sock.connect_ex((HOST, PORT)) == 0


def _can_bind() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((HOST, PORT))
            return True
        except OSError:
            return False


def _assert_intel_in_source() -> int:
    main_py = BACKEND_ROOT / "app" / "main.py"
    text = main_py.read_text(encoding="utf-8")
    if 'include_router(intel_router, prefix="/api/intel")' not in text:
        print(f"ERROR: {main_py} does not mount intel_router at /api/intel", file=sys.stderr)
        return 1

    sys.path.insert(0, str(BACKEND_ROOT))
    import app.main as main_module  # noqa: PLC0415

    count = sum(
        1
        for route in main_module.create_app().routes
        if getattr(route, "path", None) and "/api/intel" in route.path
    )
    if count < MIN_INTEL_ROUTES:
        print(
            f"ERROR: create_app() exposes {count} intel routes (need >= {MIN_INTEL_ROUTES})",
            file=sys.stderr,
        )
        return 1
    print(f"Code check OK: create_app() has {count} /api/intel routes", flush=True)
    return 0


def _free_port() -> None:
    if sys.platform == "win32":
        ps = (
            f"$p={PORT}; "
            "Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | "
            "ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; "
            "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
            "Where-Object { $_.CommandLine -match 'uvicorn' } | "
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=False, cwd=str(REPO_ROOT))
    else:
        subprocess.run(
            ["sh", "-c", f"lsof -ti :{PORT} | xargs -r kill -9"],
            check=False,
            cwd=str(REPO_ROOT),
        )


def _wait_for_bind(max_wait_s: float = 12.0) -> bool:
    for _ in range(3):
        _free_port()
        deadline = time.monotonic() + max_wait_s / 3
        while time.monotonic() < deadline:
            if _can_bind():
                return True
            time.sleep(0.5)
    return _can_bind()


def main() -> int:
    if _assert_intel_in_source() != 0:
        return 1

    body = _health() if _port_open() else None
    intel_count = int((body or {}).get("intel_route_count", 0))
    if intel_count >= MIN_INTEL_ROUTES:
        print(
            f"Backend already OK on http://{HOST}:{PORT} "
            f"(intel_route_count={intel_count}). Ctrl+C any old terminal if you need a clean restart."
        )
        return 0

    if _port_open():
        print(
            f"Port {PORT} is in use without intel (health={body}). Stopping old listeners…",
            file=sys.stderr,
        )
        if not _wait_for_bind():
            print(
                f"ERROR: port {PORT} still busy.\n"
                "  1. Close every terminal running trader-agent:backend:dev (Ctrl+C)\n"
                "  2. npm run trader-agent:backend:stop\n"
                "  3. Task Manager → end python.exe on port 8000",
                file=sys.stderr,
            )
            return 1
        print(f"Port {PORT} is free; starting intel-enabled backend…")

    if not _can_bind():
        print(f"ERROR: cannot bind http://{HOST}:{PORT}", file=sys.stderr)
        return 1

    python = REPO_ROOT / ".venv" / "Scripts" / "python.exe"
    if not python.exists():
        python = Path(sys.executable)

    cmd = [
        str(python),
        "-m",
        "uvicorn",
        "app.main:create_app",
        "--factory",
        "--app-dir",
        str(BACKEND_ROOT),
        "--reload",
        "--reload-dir",
        str(BACKEND_ROOT),
        "--host",
        HOST,
        "--port",
        str(PORT),
    ]
    print("Starting backend (agent + knowledge + /api/intel):")
    print("  ", " ".join(cmd))
    print(f"After startup, verify: npm run trader-agent:backend:verify")
    print(f"Swagger: http://{HOST}:{PORT}/docs")
    return subprocess.call(cmd, cwd=str(REPO_ROOT))


if __name__ == "__main__":
    raise SystemExit(main())
