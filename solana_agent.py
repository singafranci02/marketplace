"""
solana_agent.py — Autonomous Solana transaction signer for A2A agents
=====================================================================
Allows buyer agents to call lock_funds() on the A2A Clearinghouse
Anchor program using their Ed25519 keypair stored in agent-keys/*.pem.

The same Ed25519 private key is used for:
  - DealArtifact signing (via cryptography library, in negotiate_deal.py)
  - Solana transaction signing (via solders, in this module)

This works because Solana uses Ed25519 for signatures, and the raw 32-byte
seed from the PEM file IS a valid Solana keypair seed.

Dependencies: pip install solders>=0.21.0 solana>=0.35.0 cryptography>=42.0.0
"""

import hashlib
import os
import struct
from pathlib import Path
from typing import Optional

try:
    from cryptography.hazmat.primitives.serialization import (
        load_pem_private_key,
        Encoding,
        PrivateFormat,
        NoEncryption,
    )
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
# Key loading
# ---------------------------------------------------------------------------

def _load_solana_keypair(agent_id: str) -> "Keypair":
    """
    Load the Ed25519 private key from agent-keys/{agent_id}.pem
    and return a solders Keypair for Solana transaction signing.

    The raw 32-byte private seed from the PEM file is used as the Solana
    keypair seed — the resulting public key matches solana_pubkey in database.json.
    """
    if not SOLDERS_AVAILABLE:
        raise ImportError(
            "Install Solana dependencies: pip install solders>=0.21.0 solana>=0.35.0"
        )
    pem_path = Path("agent-keys") / f"{agent_id}.pem"
    if not pem_path.exists():
        raise FileNotFoundError(f"Agent key not found: {pem_path}")

    with open(pem_path, "rb") as f:
        private_key = load_pem_private_key(f.read(), password=None)

    raw_seed = private_key.private_bytes(
        encoding=Encoding.Raw,
        format=PrivateFormat.Raw,
        encryption_algorithm=NoEncryption(),
    )
    return Keypair.from_seed(bytes(raw_seed))


def get_agent_solana_pubkey(agent_id: str) -> str:
    """Return the base58 Solana pubkey for an agent (derived from its PEM key)."""
    kp = _load_solana_keypair(agent_id)
    return str(kp.pubkey())


# ---------------------------------------------------------------------------
# Anchor instruction builder — no IDL required
# ---------------------------------------------------------------------------

def _build_lock_funds_instruction(
    buyer_pubkey: "Pubkey",
    program_id: "Pubkey",
    task_id_bytes: bytes,
    seller_pubkey: "Pubkey",
    amount_lamports: int,
) -> "Instruction":
    """
    Manually build the Anchor lock_funds instruction without an IDL.

    Instruction data layout (Borsh):
      [0:8]   Anchor discriminator = sha256("global:lock_funds")[:8]
      [8:40]  task_id              32 bytes  (sha256 of artifact_id)
      [40:72] seller               32 bytes  (Pubkey raw bytes)
      [72:80] amount_lamports      8 bytes   (little-endian u64)

    Accounts (in order):
      0. buyer         writable, signer
      1. escrow PDA    writable, not signer  (seeds: ["escrow", task_id])
      2. system_program not writable, not signer
    """
    # Discriminator: sha256("global:lock_funds")[:8]
    discriminator = hashlib.sha256(b"global:lock_funds").digest()[:8]

    # Serialize args
    seller_bytes   = bytes(seller_pubkey)
    amount_bytes   = struct.pack("<Q", amount_lamports)
    data           = discriminator + task_id_bytes + seller_bytes + amount_bytes

    # PDA for escrow account
    escrow_pda, _ = Pubkey.find_program_address(
        [b"escrow", task_id_bytes],
        program_id,
    )

    # System program
    system_program = Pubkey.from_string("11111111111111111111111111111111")

    accounts = [
        AccountMeta(pubkey=buyer_pubkey,   is_signer=True,  is_writable=True),
        AccountMeta(pubkey=escrow_pda,     is_signer=False, is_writable=True),
        AccountMeta(pubkey=system_program, is_signer=False, is_writable=False),
    ]

    return Instruction(program_id=program_id, accounts=accounts, data=bytes(data))


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def execute_lock_funds(
    buyer_agent_id: str,
    artifact_id: str,
    seller_pubkey_b58: str,
    amount_sol: float,
    rpc_url: Optional[str] = None,
    program_id_b58: Optional[str] = None,
) -> str:
    """
    Build, sign, and submit a lock_funds instruction to the A2A Clearinghouse.

    Args:
        buyer_agent_id:   Agent ID of the buyer (must have a PEM key in agent-keys/)
        artifact_id:      The DealArtifact's artifact_id (used to derive task_id PDA seed)
        seller_pubkey_b58: Seller's Solana public key (base58)
        amount_sol:       Amount of SOL to lock (e.g. 1.5)
        rpc_url:          Solana RPC URL (defaults to SOLANA_RPC_URL env var or devnet)
        program_id_b58:   Anchor program ID (defaults to A2A_CLEARINGHOUSE_PROGRAM_ID env var)

    Returns:
        Transaction signature string

    Raises:
        ValueError: If program ID is not configured
        ImportError: If solders/solana packages not installed
        Exception: On RPC or transaction failure
    """
    if not SOLDERS_AVAILABLE:
        raise ImportError(
            "Install: pip install solders>=0.21.0 solana>=0.35.0"
        )

    # Resolve config from env vars
    rpc_url        = rpc_url or os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com")
    program_id_b58 = program_id_b58 or os.environ.get("A2A_CLEARINGHOUSE_PROGRAM_ID")

    if not program_id_b58:
        raise ValueError(
            "A2A_CLEARINGHOUSE_PROGRAM_ID not set. "
            "Deploy the Anchor program first: anchor build && anchor deploy --provider.cluster devnet"
        )

    # Load buyer keypair
    buyer_kp = _load_solana_keypair(buyer_agent_id)
    buyer_pk = buyer_kp.pubkey()

    # Compute task_id (must match Anchor PDA seed and solana_task_id in the artifact)
    task_id_bytes = bytes.fromhex(hashlib.sha256(artifact_id.encode()).hexdigest())

    program_id     = Pubkey.from_string(program_id_b58)
    seller_pubkey  = Pubkey.from_string(seller_pubkey_b58)
    amount_lamps   = int(amount_sol * 1_000_000_000)

    # Build instruction
    instruction = _build_lock_funds_instruction(
        buyer_pubkey     = buyer_pk,
        program_id       = program_id,
        task_id_bytes    = task_id_bytes,
        seller_pubkey    = seller_pubkey,
        amount_lamports  = amount_lamps,
    )

    # Fetch recent blockhash
    client        = Client(rpc_url)
    blockhash_resp = client.get_latest_blockhash()
    recent_blockhash = Hash.from_string(str(blockhash_resp.value.blockhash))

    # Build and sign transaction
    msg = Message.new_with_blockhash(
        [instruction],
        buyer_pk,
        recent_blockhash,
    )
    tx = Transaction([buyer_kp], msg, recent_blockhash)

    # Submit
    resp = client.send_transaction(tx)
    if resp.value is None:
        raise RuntimeError(f"Transaction failed: {resp}")

    sig = str(resp.value)
    print(f"  [SOLANA] lock_funds submitted: {sig}")
    print(f"  [SOLANA] Explorer: https://explorer.solana.com/tx/{sig}?cluster=devnet")
    return sig


# ---------------------------------------------------------------------------
# Quick self-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    if not SOLDERS_AVAILABLE:
        print("ERROR: Install dependencies: pip install solders>=0.21.0 solana>=0.35.0")
        sys.exit(1)

    # Test: load keypair for buyer-acmecorp and print pubkey
    try:
        kp = _load_solana_keypair("buyer-acmecorp")
        print(f"[OK] buyer-acmecorp pubkey: {kp.pubkey()}")
        print(f"     (Should match database.json solana_pubkey for buyer-acmecorp)")
    except FileNotFoundError as e:
        print(f"[SKIP] {e}")

    # Show what lock_funds instruction data looks like
    import uuid
    test_artifact_id = f"artifact-{uuid.uuid4()}"
    test_task_id     = bytes.fromhex(hashlib.sha256(test_artifact_id.encode()).hexdigest())
    discriminator    = hashlib.sha256(b"global:lock_funds").digest()[:8]
    print(f"\n[OK] Anchor discriminator for lock_funds: {discriminator.hex()}")
    print(f"[OK] task_id for test artifact: {test_task_id.hex()[:16]}...")
    print("\nRun execute_lock_funds() after deploying the Anchor program.")
