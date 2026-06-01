"""Start trader-agent on :8000 — always the build that mounts /api/intel."""

from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import NoReturn

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parents[2]
HOST = "127.0.0.1"
PORT = 8000
MIN_INTEL_ROUTES = 14

# Set by _run_uvicorn while the child is alive; used by signal handlers.
_uvicorn_proc: subprocess.Popen[bytes] | None = None


def _safe_print(text: str) -> None:
    """Print on Windows consoles that may use GBK (avoid UnicodeEncodeError)."""
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        print(text.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(
            sys.stdout.encoding or "utf-8", errors="replace"
        ), flush=True)


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


def _pids_via_netstat(port: int) -> list[int]:
    result = subprocess.run(
        ["netstat", "-ano"],
        capture_output=True,
        text=True,
        check=False,
        encoding="utf-8",
        errors="replace",
    )
    pids: list[int] = []
    for line in result.stdout.splitlines():
        upper = line.upper()
        if "LISTENING" not in upper or f":{port}" not in line:
            continue
        parts = line.split()
        if parts and parts[-1].isdigit():
            pids.append(int(parts[-1]))
    return pids


def _pids_listening_on_port(port: int) -> list[int]:
    if sys.platform != "win32":
        return []
    found: set[int] = set(_pids_via_netstat(port))
    script = (
        f"(Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue)"
        ".OwningProcess | Sort-Object -Unique"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
        check=False,
        cwd=str(REPO_ROOT),
    )
    for line in result.stdout.splitlines():
        token = line.strip()
        if token.isdigit():
            found.add(int(token))
    return sorted(found)


def _kill_pid_windows(pid: int, *, verbose: bool) -> None:
    if pid <= 0:
        return
    if verbose:
        _safe_print(f"  taskkill /F /T /PID {pid}")
    proc = subprocess.run(
        ["taskkill", "/F", "/T", "/PID", str(pid)],
        capture_output=True,
        text=True,
        check=False,
        encoding="utf-8",
        errors="replace",
    )
    if verbose and (proc.stdout or proc.stderr):
        msg = (proc.stdout or proc.stderr).strip()
        if msg:
            _safe_print(f"    {msg}")
    ps = (
        f"$ErrorActionPreference='Continue'; "
        f"Stop-Process -Id {pid} -Force -ErrorAction Continue 2>&1 | Out-String"
    )
    if verbose:
        _safe_print(f"  Stop-Process -Id {pid}")
    sp = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True,
        text=True,
        check=False,
        encoding="utf-8",
        errors="replace",
    )
    if verbose and sp.stdout.strip():
        _safe_print(f"    {sp.stdout.strip()}")


def _kill_repo_backend_pythons(*, verbose: bool) -> list[int]:
    """Kill python tied to this repo's backend (reload workers may omit 'uvicorn' in cmdline)."""
    if sys.platform != "win32":
        return []
    my_pid = os.getpid()
    parent_pid = os.getppid()
    ps = (
        f"$exclude = @({my_pid},{parent_pid}); "
        "Get-CimInstance Win32_Process | "
        "Where-Object { $_.Name -match '^python' -and $_.ProcessId -notin $exclude -and $_.CommandLine } | "
        "Where-Object { "
        "  $_.CommandLine -match 'app\\.main:create_app' "
        "  -or $_.CommandLine -match 'uvicorn' "
        "  -or ( $_.CommandLine -match 'trader-agent' -and $_.CommandLine -match '8000' ) "
        "} | "
        "Where-Object { "
        "  $_.CommandLine -notmatch 'dev_server\\.py' "
        "  -and $_.CommandLine -notmatch 'trader-cli' "
        "  -and $_.CommandLine -notmatch 'tsx' "
        "} | ForEach-Object { $_.ProcessId }"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True,
        text=True,
        check=False,
        encoding="utf-8",
        errors="replace",
    )
    pids: list[int] = []
    for line in result.stdout.splitlines():
        if line.strip().isdigit():
            pids.append(int(line.strip()))
    for pid in pids:
        if verbose:
            _safe_print(f"  repo backend python PID {pid}")
        _kill_pid_windows(pid, verbose=verbose)
    return pids


def kill_backend_processes(*, verbose: bool = False) -> list[int]:
    """Stop :8000 listeners and uvicorn/reload python children (Windows-safe)."""
    killed_attempts: list[int] = []
    if sys.platform == "win32":
        for pass_i in range(2):
            port_pids = _pids_listening_on_port(PORT)
            if verbose and port_pids:
                _safe_print(f"Port {PORT} listener PID(s): {port_pids}")
            for pid in port_pids:
                killed_attempts.append(pid)
                if _process_exists(pid):
                    _kill_pid_windows(pid, verbose=verbose)
                elif verbose:
                    _safe_print(
                        f"  PID {pid} is a ghost entry in netstat (process already exited)"
                    )
            if pass_i == 0:
                time.sleep(0.35)
        killed_attempts.extend(_kill_repo_backend_pythons(verbose=verbose))
        time.sleep(0.35)
        return sorted(set(killed_attempts))
    else:
        subprocess.run(
            ["sh", "-c", f"lsof -ti :{PORT} | xargs -r kill -9 2>/dev/null; true"],
            check=False,
            cwd=str(REPO_ROOT),
        )
        subprocess.run(
            [
                "sh",
                "-c",
                "pkill -f 'uvicorn.*app.main:create_app' 2>/dev/null || true",
            ],
            check=False,
            cwd=str(REPO_ROOT),
        )


def _terminate_process_tree(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is not None:
        return
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=3)


def _shutdown_uvicorn(*_args: object) -> NoReturn:
    global _uvicorn_proc
    print("\nStopping backend (uvicorn + reload workers)…", flush=True)
    if _uvicorn_proc is not None:
        _terminate_process_tree(_uvicorn_proc)
        _uvicorn_proc = None
    kill_backend_processes()
    raise SystemExit(0)


def _wait_for_bind(max_wait_s: float = 12.0) -> bool:
    for _ in range(3):
        kill_backend_processes()
        deadline = time.monotonic() + max_wait_s / 3
        while time.monotonic() < deadline:
            if _can_bind():
                return True
            time.sleep(0.5)
    return _can_bind()


def _run_uvicorn(cmd: list[str]) -> int:
    global _uvicorn_proc
    signal.signal(signal.SIGINT, _shutdown_uvicorn)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _shutdown_uvicorn)

    _uvicorn_proc = subprocess.Popen(cmd, cwd=str(REPO_ROOT))
    try:
        return _uvicorn_proc.wait()
    except KeyboardInterrupt:
        _shutdown_uvicorn()
    finally:
        if _uvicorn_proc is not None and _uvicorn_proc.poll() is None:
            _terminate_process_tree(_uvicorn_proc)
        _uvicorn_proc = None
        kill_backend_processes()
    return 0


def _process_exists(pid: int) -> bool:
    if sys.platform == "win32":
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                f"if (Get-Process -Id {pid} -ErrorAction SilentlyContinue) {{ exit 0 }} else {{ exit 1 }}",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode == 0
    try:
        import os

        os.kill(pid, 0)
        return True
    except OSError:
        return False


def status_main() -> int:
    _safe_print(f"Port {PORT}: open={_port_open()} can_bind={_can_bind()}")
    body = _health()
    if body:
        _safe_print(f"/health: {body}")
    else:
        _safe_print("/health: no response")
    pids = _pids_listening_on_port(PORT)
    _safe_print(f"Listener PID(s) from netstat: {pids}")
    for pid in pids:
        _safe_print(f"  PID {pid} in tasklist: {_process_exists(pid)}")
    if sys.platform == "win32":
        for label, ps in (
            (
                "uvicorn/dev_server",
                "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
                "Where-Object { $_.CommandLine -match 'uvicorn' -or $_.CommandLine -match 'dev_server' } | "
                "ForEach-Object { Write-Output ($_.ProcessId.ToString() + ' | ' + $_.CommandLine) }",
            ),
            (
                "trader-agent backend",
                "Get-CimInstance Win32_Process | "
                "Where-Object { $_.Name -match 'python' -and $_.CommandLine -match 'trader-agent' } | "
                "ForEach-Object { Write-Output ($_.ProcessId.ToString() + ' | ' + $_.Name + ' | ' + $_.CommandLine) }",
            ),
        ):
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps],
                capture_output=True,
                text=True,
                check=False,
                encoding="utf-8",
                errors="replace",
            )
            lines = [ln.strip() for ln in result.stdout.splitlines() if ln.strip()]
            _safe_print(f"{label}:")
            if lines:
                for ln in lines:
                    _safe_print(f"  {ln[:240]}")
            else:
                _safe_print("  (none)")
    return 0


def _kill_venv_pythons_in_repo(*, verbose: bool) -> list[int]:
    """Last resort: any python.exe whose image path is under this repo .venv."""
    if sys.platform != "win32":
        return []
    ps = (
        f"$exclude = @({os.getpid()},{os.getppid()}); "
        "Get-Process python* -ErrorAction SilentlyContinue | "
        "Where-Object { $_.Path -like '*stock-community-summary*' -and $_.Id -notin $exclude } | "
        "ForEach-Object { $_.Id }"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True,
        text=True,
        check=False,
        encoding="utf-8",
        errors="replace",
    )
    pids = [int(x.strip()) for x in result.stdout.splitlines() if x.strip().isdigit()]
    for pid in pids:
        if verbose:
            _safe_print(f"  repo .venv python PID {pid}")
        _kill_pid_windows(pid, verbose=verbose)
    return pids


def stop_main() -> int:
    nuke = "--nuke" in sys.argv or "--nuke-venv" in sys.argv
    _safe_print(f"Stopping trader-agent on port {PORT}...")
    try:
        attempted = kill_backend_processes(verbose=True)
        if nuke or (_port_open() and _health() is not None):
            _safe_print("Trying repo .venv python cleanup (--nuke or backend still up)...")
            attempted.extend(_kill_venv_pythons_in_repo(verbose=True))
    except Exception as exc:  # noqa: BLE001
        _safe_print(f"Stop interrupted: {exc}")
        attempted = []

    if not _port_open():
        _safe_print(f"Backend stopped (port {PORT} free).")
        return 0

    pids = _pids_listening_on_port(PORT)
    alive = [p for p in pids if _process_exists(p)]
    still_serves = _health() is not None

    _safe_print(f"Port {PORT} still busy. netstat/listener PID(s): {pids}")
    if attempted:
        _safe_print(f"Tried to kill PID(s): {sorted(set(attempted))}")

    if still_serves:
        _safe_print(
            "HTTP /health still responds - backend is alive in another terminal/session."
        )
        _safe_print(
            "1) Find the terminal that shows uvicorn INFO logs and press Ctrl+C there"
        )
        _safe_print(
            "2) Task Manager -> Details -> end python.exe with uvicorn in command line"
        )
        _safe_print(
            "3) Or elevated PowerShell: "
            f"taskkill /F /T /PID {pids[0] if pids else '<pid from netstat -ano | findstr :8000>'}"
        )
    elif not alive and pids:
        _safe_print(
            f"PID(s) {pids} in netstat but not in Get-Process (stale socket). "
            "Wait 30-60s or reboot, then run stop again."
        )
    elif alive:
        _safe_print(f"Live process(es) still holding port: {alive}")

    return 1


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] in ("stop", "--stop"):
        return stop_main()
    if len(sys.argv) > 1 and sys.argv[1] in ("status", "--status"):
        return status_main()

    if _assert_intel_in_source() != 0:
        return 1

    body = _health() if _port_open() else None
    intel_count = int((body or {}).get("intel_route_count", 0))
    if intel_count >= MIN_INTEL_ROUTES:
        print(
            f"Backend already OK on http://{HOST}:{PORT} "
            f"(intel_route_count={intel_count}).",
            flush=True,
        )
        print(
            "It is running in another process (not this shell). "
            "Stop: npm run trader-agent:backend:stop | "
            "Diagnose: npm run trader-agent:backend:status | "
            "Or Ctrl+C in the terminal that shows uvicorn INFO logs.",
            flush=True,
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
                "  1. npm run trader-agent:backend:stop\n"
                "  2. Task Manager → end python.exe with uvicorn in command line",
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
    print("After startup, verify: npm run trader-agent:backend:verify")
    print(f"Swagger: http://{HOST}:{PORT}/docs")
    print("Ctrl+C stops uvicorn and reload workers (or: npm run trader-agent:backend:stop)")
    return _run_uvicorn(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
