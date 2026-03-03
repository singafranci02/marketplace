"""
dispute_manager.py — Phase 35 Dispute Oracle Manager
=====================================================
Polls Supabase for DISPUTED ip_licenses and submits open_dispute
instructions on Solana on behalf of the buyer (using PLATFORM_SOLANA_KEYPAIR
as a buyer-proxy, same pattern as solana-listener.ts autoReleaseFunds).

Also provides helpers used by solana-listener.ts (via spawn) to build the
resolve_dispute instruction once the platform admin makes a decision.

Usage:
    python3 dispute_manager.py              # one-shot: poll + submit all pending
    python3 dispute_manager.py --watch      # loop every 60 s

Env vars required:
    SUPABASE_URL                — Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY   — Supabase service role key (bypasses RLS)
    SOLANA_RPC_URL              — Solana RPC endpoint (defaults to devnet)
    A2A_CLEARINGHOUSE_PROGRAM_ID — Anchor program ID (base58)
    PLATFORM_SOLANA_KEYPAIR     — Buyer-proxy keypair as JSON int array [0..64]
"""

from __future__ import annotations

import hashlib
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from typing import Optional

try:
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from solders.hash import Hash
    from solders.instruction import Instruction, AccountMeta
    from solders.message import Message
    from solders.transaction import Transaction
    from solana.rpc.api import Client
    SOLDERS_AVAILABLE = True
except ImportError:
    SOLDERS_AVAILABLE = False

# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)

def _supabase_headers() -> dict:
    key = _env("SUPABASE_SERVICE_ROLE_KEY")
    return {
        "apikey":        key,
        "Authorization": f"Bearer {key}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }

def _supabase_get(path: str) -> list:
    url = f"{_env('SUPABASE_URL')}/rest/v1/{path}"
    req = urllib.request.Request(url, headers=_supabase_headers())
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())

def _supabase_post(table: str, payload: dict) -> dict:
    url  = f"{_env('SUPABASE_URL')}/rest/v1/{table}"
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(url, data=data, headers=_supabase_headers(), method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.loads(resp.read())
        return result[0] if isinstance(result, list) else result

def _supabase_patch(table: str, match: dict, payload: dict) -> None:
    qs   = "&".join(f"{k}=eq.{v}" for k, v in match.items())
    url  = f"{_env('SUPABASE_URL')}/rest/v1/{table}?{qs}"
    data = json.dumps(payload).encode()
    headers = {**_supabase_headers(), "Prefer": "return=minimal"}
    req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
    urllib.request.urlopen(req, timeout=10).close()

# ---------------------------------------------------------------------------
# Keypair loader — JSON int-array format (same as solana-listener.ts)
# ---------------------------------------------------------------------------

def _load_platform_keypair() -> "Keypair":
    if not SOLDERS_AVAILABLE:
        raise ImportError("Install: pip install solders>=0.21.0 solana>=0.35.0")
    raw = _env("PLATFORM_SOLANA_KEYPAIR")
    if not raw:
        raise ValueError("PLATFORM_SOLANA_KEYPAIR not set in environment")
    kp_bytes = bytes(json.loads(raw))  # JSON int array [0..63]
    return Keypair.from_bytes(kp_bytes)

# ---------------------------------------------------------------------------
# Anchor instruction builder — open_dispute
# ---------------------------------------------------------------------------

def build_open_dispute_ix(
    task_id_hex:      str,
    dispute_hash_hex: str,
    buyer_keypair:    "Keypair",
    program_id:       "Pubkey",
) -> "Instruction":
    """
    Build the open_dispute Anchor instruction (manual Borsh encoding, no IDL).

    Instruction data layout:
      [0:8]   discriminator = sha256("global:open_dispute")[:8]
      [8:40]  task_id       32 bytes
      [40:72] dispute_hash  32 bytes

    Accounts:
      0. buyer      writable, signer
      1. escrow PDA writable, not signer  (seeds: [b"escrow", task_id])
    """
    task_id_bytes      = bytes.fromhex(task_id_hex)
    dispute_hash_bytes = bytes.fromhex(dispute_hash_hex)

    discriminator = hashlib.sha256(b"global:open_dispute").digest()[:8]
    data          = discriminator + task_id_bytes + dispute_hash_bytes

    escrow_pda, _ = Pubkey.find_program_address(
        [b"escrow", task_id_bytes],
        program_id,
    )

    accounts = [
        AccountMeta(pubkey=buyer_keypair.pubkey(), is_signer=True,  is_writable=True),
        AccountMeta(pubkey=escrow_pda,             is_signer=False, is_writable=True),
    ]

    return Instruction(program_id=program_id, accounts=accounts, data=bytes(data))


def submit_open_dispute(
    task_id_hex:      str,
    dispute_hash_hex: str,
    rpc_url:          Optional[str] = None,
    program_id_b58:   Optional[str] = None,
) -> Optional[str]:
    """
    Build, sign, and submit an open_dispute instruction.

    Returns the Solana transaction signature, or None on error.
    Uses PLATFORM_SOLANA_KEYPAIR as buyer-proxy (same pattern as autoReleaseFunds).
    """
    if not SOLDERS_AVAILABLE:
        print("[DISPUTE] solders not installed — skipping on-chain open_dispute", file=sys.stderr)
        return None

    rpc_url        = rpc_url        or _env("SOLANA_RPC_URL", "https://api.devnet.solana.com")
    program_id_b58 = program_id_b58 or _env("A2A_CLEARINGHOUSE_PROGRAM_ID")

    if not program_id_b58:
        print("[DISPUTE] A2A_CLEARINGHOUSE_PROGRAM_ID not set — skipping on-chain call", file=sys.stderr)
        return None

    try:
        buyer_kp   = _load_platform_keypair()
        program_id = Pubkey.from_string(program_id_b58)
        ix         = build_open_dispute_ix(task_id_hex, dispute_hash_hex, buyer_kp, program_id)

        client           = Client(rpc_url)
        blockhash_resp   = client.get_latest_blockhash()
        recent_blockhash = Hash.from_string(str(blockhash_resp.value.blockhash))
        msg  = Message.new_with_blockhash([ix], buyer_kp.pubkey(), recent_blockhash)
        tx   = Transaction([buyer_kp], msg, recent_blockhash)
        resp = client.send_transaction(tx)

        if resp.value is None:
            print(f"[DISPUTE] open_dispute tx failed: {resp}", file=sys.stderr)
            return None

        sig = str(resp.value)
        print(f"[DISPUTE] open_dispute TX: {sig}")
        return sig

    except Exception as exc:  # noqa: BLE001
        print(f"[DISPUTE] open_dispute error: {exc}", file=sys.stderr)
        return None

# ---------------------------------------------------------------------------
# Poll-and-submit — main loop
# ---------------------------------------------------------------------------

def poll_and_submit() -> None:
    """
    Find all DISPUTED ip_licenses that don't yet have an on-chain dispute entry,
    submit open_dispute for each, and insert/update the disputes Supabase table.
    """
    supabase_url = _env("SUPABASE_URL")
    if not supabase_url:
        print("[DISPUTE] SUPABASE_URL not set — cannot poll", file=sys.stderr)
        return

    try:
        disputed = _supabase_get(
            "ip_licenses?status=eq.DISPUTED"
            "&select=id,artifact_id,custom_terms"
            "&limit=20"
        )
    except Exception as exc:
        print(f"[DISPUTE] Supabase query failed: {exc}", file=sys.stderr)
        return

    if not disputed:
        print("[DISPUTE] No DISPUTED licenses found.")
        return

    print(f"[DISPUTE] Found {len(disputed)} DISPUTED license(s).")

    for license_row in disputed:
        license_id  = license_row.get("id", "")
        artifact_id = license_row.get("artifact_id", "")
        custom_terms = license_row.get("custom_terms") or {}

        # task_id = sha256(artifact_id)
        if not artifact_id:
            continue
        task_id_hex = hashlib.sha256(artifact_id.encode()).hexdigest()

        # Check if a dispute row already exists (by task_id)
        try:
            existing = _supabase_get(f"disputes?task_id=eq.{task_id_hex}&limit=1")
        except Exception:
            existing = []

        if existing:
            # Already tracked — skip if on_chain_tx is already set
            if existing[0].get("on_chain_tx"):
                print(f"[DISPUTE] {task_id_hex[:16]}… already has on-chain dispute — skip")
                continue

        # Build dispute reason and hash
        reason       = (
            f"VerificationScript FAIL for artifact {artifact_id[:20]}…"
            f" — Phase 35 automatic dispute"
        )
        evidence_ipfs = custom_terms.get("ipfs_hash", "")
        dispute_hash_hex = hashlib.sha256(
            (reason + evidence_ipfs).encode()
        ).hexdigest()

        # Submit on-chain
        tx_sig = submit_open_dispute(task_id_hex, dispute_hash_hex)

        # Upsert disputes row
        row = {
            "license_id":    license_id,
            "artifact_id":   artifact_id,
            "task_id":       task_id_hex,
            "reason":        reason,
            "evidence_ipfs": evidence_ipfs or None,
            "dispute_hash":  dispute_hash_hex,
            "status":        "OPEN",
            "on_chain_tx":   tx_sig,
        }

        try:
            if existing:
                _supabase_patch("disputes", {"task_id": task_id_hex}, {"on_chain_tx": tx_sig})
                print(f"[DISPUTE] Updated disputes row for {task_id_hex[:16]}…")
            else:
                _supabase_post("disputes", row)
                print(f"[DISPUTE] Inserted disputes row for {task_id_hex[:16]}…")
        except Exception as exc:
            print(f"[DISPUTE] Supabase insert/update failed: {exc}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    watch_mode = "--watch" in sys.argv

    if watch_mode:
        print("[DISPUTE] Watch mode — polling every 60 s. Ctrl+C to stop.")
        try:
            while True:
                poll_and_submit()
                time.sleep(60)
        except KeyboardInterrupt:
            print("[DISPUTE] Stopped.")
    else:
        poll_and_submit()
