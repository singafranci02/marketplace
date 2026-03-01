"""
generate_keys.py — One-time Ed25519 key pair generator for AGENTMARKET agents.

Run once:  python3 generate_keys.py

Creates:
  agent-keys/sydney-saas.pem       — SydneySaaS private key
  agent-keys/global-freight.pem    — GlobalFreight private key
  agent-keys/cloud-ops.pem         — CloudOps private key
  agent-keys/buyer-acmecorp.pem    — AcmeCorp buyer private key

Updates database.json with the matching real public keys and adds the buyer entry.
"""

import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
    PrivateFormat,
    NoEncryption,
)

BASE_DIR  = Path(__file__).parent
KEYS_DIR  = BASE_DIR / "agent-keys"
DB_PATH   = BASE_DIR / "database.json"

AGENTS = [
    {
        "key_name": "sydney-saas",
        "agent_id": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    },
    {
        "key_name": "global-freight",
        "agent_id": "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354",
    },
    {
        "key_name": "cloud-ops",
        "agent_id": "bafybeihkoviema7g3gxyt6la22f56eupkmzh2yw4lxnxoqkj52ql73yvf4",
    },
    {
        "key_name": "buyer-acmecorp",
        "agent_id": "bafybeibuyer0000acmecorp000000000000000000000000000000000001",
    },
]

BUYER_ENTRY = {
    "schema_version": "1.0",
    "a2a_version": "0.3.0",
    "agent_id": "bafybeibuyer0000acmecorp000000000000000000000000000000000001",
    "name": "AcmeCorpBuyer",
    "owner": "Acme Corp",
    "legal_entity_id": "US-EIN-123456789",
    "public_key": "__PLACEHOLDER__",
    "verification": {
        "type": "Marketplace_Signed",
        "issued_by": "AgentMarketplace Authority v1",
        "issued_at": "2025-01-01T00:00:00Z",
        "expires_at": "2027-01-01T00:00:00Z",
        "certificate_id": "cert-mp-004-us-acmecorpbuyer",
        "signature": "placeholder_buyer_cert",
    },
    "capabilities": [],
    "policy_endpoint": "https://policy.acmecorp.com/a2a/deals/approve",
    "compliance": ["SOC2-Type2"],
    "description": "Procurement buyer agent for Acme Corp. Discovers, negotiates, and commits to SaaS and service contracts on behalf of the company.",
    "endpoint": "https://agents.acmecorp.com/a2a",
    "pricing": None,
    "verified": True,
    "joined_at": "2025-01-01T00:00:00Z",
}


def generate_and_save() -> dict[str, str]:
    """Generate key pairs, save private keys, return {agent_id: public_key_pem}."""
    KEYS_DIR.mkdir(exist_ok=True)
    public_keys: dict[str, str] = {}

    for agent in AGENTS:
        key_file = KEYS_DIR / f"{agent['key_name']}.pem"

        if key_file.exists():
            print(f"  [skip] {key_file.name} already exists — not overwriting")
            # Load existing public key to keep database.json consistent
            from cryptography.hazmat.primitives.serialization import load_pem_private_key
            private_key = load_pem_private_key(key_file.read_bytes(), password=None)
        else:
            private_key = Ed25519PrivateKey.generate()
            pem_private = private_key.private_bytes(
                encoding=Encoding.PEM,
                format=PrivateFormat.PKCS8,
                encryption_algorithm=NoEncryption(),
            )
            key_file.write_bytes(pem_private)
            print(f"  [ok]   {key_file.name} written")

        public_key = private_key.public_key()
        pem_public = public_key.public_bytes(
            encoding=Encoding.PEM,
            format=PublicFormat.SubjectPublicKeyInfo,
        ).decode()

        public_keys[agent["agent_id"]] = pem_public

    return public_keys


def update_database(public_keys: dict[str, str]) -> None:
    """Replace placeholder public keys in database.json; add buyer entry if missing."""
    db = json.loads(DB_PATH.read_text())

    existing_ids = {a["agent_id"] for a in db["agents"]}

    for agent in db["agents"]:
        if agent["agent_id"] in public_keys:
            agent["public_key"] = public_keys[agent["agent_id"]]
            print(f"  [ok]   Updated public key for {agent['name']}")

    buyer_id = "bafybeibuyer0000acmecorp000000000000000000000000000000000001"
    if buyer_id not in existing_ids:
        buyer = dict(BUYER_ENTRY)
        buyer["public_key"] = public_keys[buyer_id]
        db["agents"].append(buyer)
        print(f"  [ok]   Added buyer agent: AcmeCorpBuyer")
    else:
        # Update existing buyer public key
        for agent in db["agents"]:
            if agent["agent_id"] == buyer_id:
                agent["public_key"] = public_keys[buyer_id]
                print(f"  [ok]   Updated buyer public key")

    DB_PATH.write_text(json.dumps(db, indent=2) + "\n")
    print(f"  [ok]   database.json updated")


if __name__ == "__main__":
    print("\n=== AGENTMARKET KEY GENERATION ===\n")

    print("Generating Ed25519 key pairs...")
    public_keys = generate_and_save()

    print("\nUpdating database.json...")
    update_database(public_keys)

    print("\n✓ Done. Private keys are in agent-keys/ (gitignored, never commit them).")
    print("  Run python3 negotiate_deal.py to test Ed25519 signing.\n")
