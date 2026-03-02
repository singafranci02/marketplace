"""
ip_vault_filler.py — Mock IP vault seeder for AGENTMARKET.

Posts 3 sample IP vaults (trading bot, memecoin art, smart contract) to
POST /api/vault every 60 seconds. Simulates creator agents escrowing IP
into the vault for licensees to discover.

Run: python3 ip_vault_filler.py

Requires:
  - .env with AGENTMARKET_API_KEY and AGENTMARKET_API_BASE
  - Next.js dev server running (npm run dev in dashboard/)
  - Supabase ip_vault table created (see plan file for SQL)
"""

import json
import time
import uuid
import urllib.request
import urllib.error
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_ENV_PATH = Path(__file__).parent / ".env"

SELLER_AGENT_ID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"  # SydneySaaS
FREIGHT_AGENT_ID = "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354"  # GlobalFreight
CLOUDOPS_AGENT_ID = "bafybeihkoviema7g3gxyt6la22f56eupkmzh2yw4lxnxoqkj52ql73yvf4"  # CloudOps

MOCK_VAULTS = [
    {
        "agent_id":    SELLER_AGENT_ID,
        "ipfs_hash":   "QmMEVSnipeBotV1Yr2026Au",
        "ip_type":     "trading_bot",
        "title":       "MEV Snipe Bot v1",
        "description": "Pump.fun launch sniper with configurable slippage and MEV protection. "
                       "Battle-tested on Base mainnet. Fork-ready for AU meme season.",
        "license_template": {
            "rev_share_pct":  5,
            "duration_days":  30,
            "max_licensees":  10,
            "min_tvs_usd":    5000,
        },
        "escrow_eth": 0.01,
    },
    {
        "agent_id":    FREIGHT_AGENT_ID,
        "ipfs_hash":   "QmPepe2ArtPackLayered100",
        "ip_type":     "memecoin_art",
        "title":       "Pepe 2.0 Art Pack (100 variants)",
        "description": "Layered PNG + SVG memecoin art. 100 unique variants. Commercial license "
                       "for one token launch only. Ready for Pump.fun or Raydium.",
        "license_template": {
            "rev_share_pct":  2,
            "duration_days":  90,
            "max_licensees":  5,
            "min_tvs_usd":    1000,
        },
        "escrow_eth": 0.005,
    },
    {
        "agent_id":    CLOUDOPS_AGENT_ID,
        "ipfs_hash":   "QmPumpFunLauncherSolidityV2",
        "ip_type":     "smart_contract",
        "title":       "Pump.fun Launcher Template v2",
        "description": "Audited Solidity contract for bonding-curve token launches. "
                       "Includes anti-rug guardrails, liquidity lock hooks, and Base L2 optimisations. "
                       "Fork-ready, deploy in 10 minutes.",
        "license_template": {
            "rev_share_pct":  3,
            "duration_days":  180,
            "max_licensees":  20,
            "min_tvs_usd":    10000,
        },
        "escrow_eth": 0.05,
    },
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _post_vault(vault: dict, api_key: str, api_base: str, suffix: str = "") -> bool:
    """POST a vault entry to /api/vault. Returns True on success."""
    payload = dict(vault)
    if suffix:
        payload["title"] = f"{vault['title']} {suffix}"

    url  = f"{api_base}/api/vault"
    data = json.dumps(payload).encode()
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
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            print(f"  [VAULT] Posted: {payload['title']!r} → id: {result.get('id', '?')[:8]}…")
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  [VAULT] HTTP {e.code} for {payload['title']!r}: {body[:120]}")
        return False
    except Exception as e:
        print(f"  [VAULT] Error posting {payload['title']!r}: {e}")
        return False


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    api_key, api_base = _read_env()
    if not api_key:
        print("⚠  No AGENTMARKET_API_KEY in .env — requests will fail auth.")
        print("   Copy .env.example → .env and add your key from /account.\n")

    print(f"\n{'='*60}")
    print(f"  IP VAULT FILLER  |  target: {api_base}")
    print(f"{'='*60}")
    print(f"  Posting {len(MOCK_VAULTS)} vaults every 60s. Ctrl+C to stop.\n")

    run = 1
    while True:
        suffix = f"(run {run})" if run > 1 else ""
        print(f"[RUN {run}] Posting vaults…")
        ok = 0
        for vault in MOCK_VAULTS:
            if _post_vault(vault, api_key, api_base, suffix):
                ok += 1
            time.sleep(0.3)  # small delay between posts
        print(f"[RUN {run}] Done — {ok}/{len(MOCK_VAULTS)} posted. Sleeping 60s…\n")
        run += 1
        time.sleep(60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nStopped.")
