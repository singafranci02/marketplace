"""
background_agent.py — Agent Liveness Monitor
=============================================
Sends a heartbeat for every registered agent every 60 seconds.
Agents that miss a check-in for more than 3 minutes are marked INACTIVE
and filtered from the /api/agents discovery endpoint.

Usage:
    python3 background_agent.py

Run this alongside the Next.js dev server. Requires a valid API key in .env:
    AGENTMARKET_API_KEY=sk-<your-key>
    AGENTMARKET_API_BASE=http://localhost:3000
"""

import json
import time
import datetime
import urllib.request
import urllib.error
from pathlib import Path

_ENV_PATH = Path(__file__).parent / ".env"
DB_PATH   = Path(__file__).parent / "database.json"

HEARTBEAT_INTERVAL = 60  # seconds between pulses
STALE_THRESHOLD    = 3   # minutes before an agent is considered INACTIVE


def _read_env() -> tuple[str, str]:
    """Read AGENTMARKET_API_KEY and AGENTMARKET_API_BASE from .env."""
    api_key, api_base = "", "http://localhost:3000"
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text().splitlines():
            if line.startswith("AGENTMARKET_API_KEY="):
                api_key = line.split("=", 1)[1].strip()
            elif line.startswith("AGENTMARKET_API_BASE="):
                api_base = line.split("=", 1)[1].strip()
    return api_key, api_base


def _send_heartbeat(agent_id: str, api_key: str, api_base: str) -> bool:
    """POST /api/heartbeat for a single agent. Returns True on success."""
    url  = f"{api_base}/api/heartbeat"
    data = json.dumps({"agent_id": agent_id}).encode()
    req  = urllib.request.Request(
        url,
        data    = data,
        headers = {
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method  = "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except urllib.error.HTTPError as e:
        print(f"    HTTP {e.code}: {e.read().decode()[:120]}")
        return False
    except Exception as e:
        print(f"    Error: {e}")
        return False


def main() -> None:
    if not DB_PATH.exists():
        print("[HEARTBEAT] database.json not found — no agents to monitor.")
        return

    db        = json.loads(DB_PATH.read_text())
    agent_ids = [a["agent_id"] for a in db.get("agents", [])]

    if not agent_ids:
        print("[HEARTBEAT] No agents found in database.json.")
        return

    print(f"[HEARTBEAT] Monitoring {len(agent_ids)} agent(s)")
    print(f"[HEARTBEAT] Interval: {HEARTBEAT_INTERVAL}s · INACTIVE after: {STALE_THRESHOLD}m")
    print(f"[HEARTBEAT] Starting pulse loop — Ctrl+C to stop\n")

    while True:
        api_key, api_base = _read_env()

        if not api_key:
            print("[HEARTBEAT] WARNING: AGENTMARKET_API_KEY not set in .env — skipping beat")
            time.sleep(HEARTBEAT_INTERVAL)
            continue

        ts = datetime.datetime.utcnow().strftime("%H:%M:%S UTC")
        for agent_id in agent_ids:
            ok     = _send_heartbeat(agent_id, api_key, api_base)
            symbol = "●" if ok else "✗"
            print(f"  [{ts}] {symbol} {agent_id[:24]}…")

        time.sleep(HEARTBEAT_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[HEARTBEAT] Stopped.")
