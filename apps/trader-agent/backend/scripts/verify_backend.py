"""Verify :8000 serves agent + knowledge + /api/intel."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

HOST = "127.0.0.1"
PORT = 8000
MIN_INTEL_ROUTES = 14


def main() -> int:
    url = f"http://{HOST}:{PORT}/health"
    try:
        with urllib.request.urlopen(url, timeout=3) as response:
            body = json.loads(response.read().decode())
    except urllib.error.URLError as exc:
        print(f"FAIL: cannot reach {url} ({exc})", file=sys.stderr)
        return 1

    intel_count = int(body.get("intel_route_count", 0))
    if body.get("status") != "ok" or intel_count < MIN_INTEL_ROUTES:
        print(f"FAIL: health={body} (need intel_route_count >= {MIN_INTEL_ROUTES})", file=sys.stderr)
        return 1

    ingest_url = f"http://{HOST}:{PORT}/api/intel/market/ingest"
    req = urllib.request.Request(ingest_url, method="POST", data=b"")
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            if response.status != 200:
                print(f"FAIL: POST {ingest_url} -> HTTP {response.status}", file=sys.stderr)
                return 1
    except urllib.error.HTTPError as exc:
        print(f"FAIL: POST {ingest_url} -> HTTP {exc.code}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"FAIL: POST {ingest_url} ({exc})", file=sys.stderr)
        return 1

    print(f"OK: backend on :{PORT} (intel_route_count={intel_count}, ingest=200)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
