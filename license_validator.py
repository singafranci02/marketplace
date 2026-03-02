"""
license_validator.py — Cryptographic Access Gate for Licensed IP
================================================================
Ship this file inside every piece of escrowed IP (trading bots, smart contracts,
memecoin art packs). Call LicenseValidator.guard() at the top of your code.
If no valid signed license exists for the requesting agent, execution halts.

Requirements:
    pip install cryptography requests

Usage (licensor wraps their IP with this):
    from license_validator import LicenseValidator

    LicenseValidator.guard(
        agent_id  = "bafybeibuyer0000acmecorp...",   # the agent running this code
        vault_id  = "your-vault-uuid-here",
        api_key   = "sk-your-api-key",
        key_path  = "agent-keys/buyer-acmecorp.pem",
        api_base  = "https://your-dashboard-domain.com",
    )
    # ↑ Raises SecurityException immediately if no valid license exists.
    # Everything below this line is your actual IP code.

    # Optionally retrieve the AES-256 content key (to decrypt IPFS payload):
    key = LicenseValidator(agent_id, vault_id, api_key, key_path, api_base).get_content_key()
"""

from __future__ import annotations

import base64
import hashlib
import sys
import uuid
from typing import Optional

try:
    import requests
except ImportError:
    print("[license_validator] ERROR: 'requests' not installed. Run: pip install requests")
    sys.exit(1)

try:
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives.hashes import SHA256
    from cryptography.hazmat.primitives.serialization import (
        load_pem_private_key, Encoding, PrivateFormat, NoEncryption
    )
except ImportError:
    print("[license_validator] ERROR: 'cryptography' not installed. Run: pip install cryptography")
    sys.exit(1)


class SecurityException(Exception):
    """Raised when no valid license is found. Halts execution of the licensed IP."""


# ─────────────────────────────────────────────────────────────────────────────
# Low-level crypto: Ed25519 seed → X25519 scalar
# This is the standard conversion defined in RFC 8032 / libsodium
# (crypto_sign_ed25519_sk_to_curve25519). The private X25519 scalar is derived
# by hashing the 32-byte Ed25519 seed with SHA-512 and clamping the first half.
# ─────────────────────────────────────────────────────────────────────────────
def _ed25519_seed_to_x25519_scalar(seed: bytes) -> bytes:
    h = hashlib.sha512(seed).digest()
    scalar = bytearray(h[:32])
    scalar[0]  &= 248   # clear bits 0, 1, 2  (cofactor)
    scalar[31] &= 127   # clear bit 255
    scalar[31] |= 64    # set bit 254
    return bytes(scalar)


# ─────────────────────────────────────────────────────────────────────────────
# Unwrap a content key that was wrapped by the server for this specific agent.
# The server used ECDH(ephemeral_priv, agent_x25519_pub) → HKDF → AES-GCM.
# We reverse: ECDH(agent_x25519_priv, ephemeral_pub) → HKDF → AES-GCM decrypt.
# ─────────────────────────────────────────────────────────────────────────────
def _unwrap_content_key(
    wrapped_key_b64:   str,
    ephemeral_pub_b64: str,
    wrap_iv_b64:       str,
    wrap_auth_tag_b64: str,
    key_path:          str,
) -> bytes:
    # 1. Load Ed25519 private key → extract raw seed bytes
    with open(key_path, "rb") as f:
        ed_priv = load_pem_private_key(f.read(), password=None)
    seed = ed_priv.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())

    # 2. Derive X25519 private scalar from Ed25519 seed
    x25519_scalar = _ed25519_seed_to_x25519_scalar(seed)
    x25519_priv   = X25519PrivateKey.from_private_bytes(x25519_scalar)

    # 3. ECDH with the server's ephemeral X25519 public key
    eph_pub_bytes = base64.b64decode(_pad_b64(ephemeral_pub_b64))
    eph_pub       = X25519PublicKey.from_public_bytes(eph_pub_bytes)
    shared_secret = x25519_priv.exchange(eph_pub)

    # 4. HKDF-SHA256 (matches server: salt=empty, info=AGENTMARKET-KEY-WRAP-v1)
    wrapping_key = HKDF(
        algorithm = SHA256(),
        length    = 32,
        salt      = None,
        info      = b"AGENTMARKET-KEY-WRAP-v1",
    ).derive(shared_secret)

    # 5. AES-256-GCM decrypt
    wrap_iv       = base64.b64decode(_pad_b64(wrap_iv_b64))
    wrap_auth_tag = base64.b64decode(_pad_b64(wrap_auth_tag_b64))
    wrapped_key   = base64.b64decode(_pad_b64(wrapped_key_b64))

    decryptor = Cipher(
        algorithms.AES(wrapping_key),
        modes.GCM(wrap_iv, wrap_auth_tag),
    ).decryptor()
    content_key = decryptor.update(wrapped_key) + decryptor.finalize()
    return content_key


def _pad_b64(s: str) -> str:
    """Add missing base64 padding."""
    return s + "=" * (-len(s) % 4)


def _get_hardware_id() -> str:
    """Return a stable SHA-256 fingerprint of this machine's MAC address.
    Used as backward-compat fallback for pre-Phase 28 licenses.
    """
    return hashlib.sha256(str(uuid.getnode()).encode()).hexdigest()


def _get_solana_pubkey(agent_id: str, db_path: Optional[str] = None) -> Optional[str]:
    """Return the agent's Solana pubkey from database.json, or None if not found.
    Used for Phase 28 cNFT token-gating: checks that this agent still holds the license NFT.
    """
    import json
    from pathlib import Path
    try:
        path = Path(db_path) if db_path else Path(__file__).parent / "database.json"
        with open(path) as f:
            db = json.load(f)
        for agent in db.get("agents", []):
            if agent.get("agent_id") == agent_id:
                return agent.get("solana_pubkey")
    except Exception:
        pass
    return None


# ─────────────────────────────────────────────────────────────────────────────
# LicenseValidator
# ─────────────────────────────────────────────────────────────────────────────
class LicenseValidator:
    """
    Validates that an agent holds a valid, non-expired, non-revoked license
    for a specific vault entry before the licensed IP can execute.

    Parameters:
        agent_id  — the agent_id of the agent running the licensed code
        vault_id  — the vault UUID of the escrowed IP
        api_key   — Bearer sk-* API key (obtained from /developer page)
        key_path  — path to the agent's Ed25519 private key PEM file
        api_base  — base URL of the dashboard (e.g. https://markets.acme.com)
    """

    def __init__(
        self,
        agent_id: str,
        vault_id: str,
        api_key:  str,
        key_path: str,
        api_base: str = "http://localhost:3000",
    ):
        self.agent_id = agent_id
        self.vault_id = vault_id
        self.api_key  = api_key
        self.key_path = key_path
        self.api_base = api_base.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_key}"}

    # ── Public API ────────────────────────────────────────────────────────────

    @staticmethod
    def guard(
        agent_id: str,
        vault_id: str,
        api_key:  str,
        key_path: str,
        api_base: str = "http://localhost:3000",
    ) -> None:
        """
        One-liner guard — call at the top of every licensed IP file.
        Raises SecurityException immediately if no valid license is found.

        Example:
            LicenseValidator.guard(
                agent_id="bafybeibuyer...", vault_id="uuid...",
                api_key="sk-...", key_path="agent-keys/buyer.pem",
            )
        """
        v = LicenseValidator(agent_id, vault_id, api_key, key_path, api_base)
        if not v.check():
            raise SecurityException(
                f"[LICENSE DENIED] No valid license for vault {vault_id} "
                f"(agent: {agent_id}). Execution halted."
            )
        print(f"[LicenseValidator] ✓ License valid for vault {vault_id[:8]}… "
              f"(agent: {agent_id[:12]}…)")

    def check(self, verify_hardware: bool = True) -> bool:
        """
        Check license validity via /api/license/check (no download quota cost).
        Returns True if a valid, non-expired, non-revoked license exists.

        Phase 28: cNFT token-gating check.
          If the license carries a cnft_asset_id, the token_holder field is compared
          against this agent's Solana pubkey. Raises SecurityException on mismatch —
          meaning the license NFT was transferred (resold) and this agent lost access.

        Phase 27 backward compat: if no cnft_asset_id but a hardware_id exists, the
          hardware check is performed as a fallback.
        """
        try:
            resp = requests.get(
                f"{self.api_base}/api/license/check",
                params  = {"vault_id": self.vault_id, "agent_id": self.agent_id},
                headers = self._headers,
                timeout = 10,
            )
            if resp.status_code != 200:
                return False
            data = resp.json()

            # Phase 28: cNFT token-gating check (primary)
            if data.get("cnft_asset_id") and data.get("token_holder"):
                local_wallet = _get_solana_pubkey(self.agent_id)
                if local_wallet and local_wallet != data["token_holder"]:
                    raise SecurityException(
                        "[LICENSE DENIED] cNFT ownership mismatch — this license NFT is no "
                        "longer held by this agent. If the NFT was transferred or sold, access "
                        "has been revoked. Contact the original licensor."
                    )

            # Phase 27 backward compat: hardware binding (for pre-Phase 28 licenses)
            elif verify_hardware and data.get("hardware_id"):
                local_hw = _get_hardware_id()
                if local_hw != data["hardware_id"]:
                    raise SecurityException(
                        "[LICENSE DENIED] Hardware ID mismatch — this license is bound "
                        "to a different machine. Contact the licensor to transfer the license."
                    )

            return bool(data.get("valid"))
        except SecurityException:
            raise
        except Exception as e:
            raise SecurityException(
                f"[LICENSE CHECK FAILED] Could not reach clearinghouse: {e}"
            ) from e

    def get_content_key(self) -> bytes:
        """
        Retrieve and unwrap the AES-256 content key.
        Returns the 32-byte plaintext content key.
        Raises SecurityException if the license is invalid or key retrieval fails.
        """
        try:
            resp = requests.get(
                f"{self.api_base}/api/vault/{self.vault_id}/decrypt-key",
                params  = {"agent_id": self.agent_id},
                headers = {**self._headers, "X-Hardware-ID": _get_hardware_id()},
                timeout = 15,
            )
        except Exception as e:
            raise SecurityException(f"[KEY RETRIEVAL FAILED] Network error: {e}") from e

        if resp.status_code == 403:
            data = resp.json()
            raise SecurityException(f"[LICENSE DENIED] {data.get('error', 'Access denied')}")
        if resp.status_code == 429:
            raise SecurityException("[LICENSE DENIED] Daily download limit reached. Contact the licensor.")
        if resp.status_code != 200:
            raise SecurityException(f"[KEY RETRIEVAL FAILED] HTTP {resp.status_code}: {resp.text[:200]}")

        data = resp.json()

        # Validate that we got a wrapped key response (Phase 24 format)
        required = {"wrapped_key", "ephemeral_pub", "wrap_iv", "wrap_auth_tag"}
        if not required.issubset(data):
            raise SecurityException(
                "[KEY FORMAT ERROR] Server returned unexpected format — "
                "ensure the dashboard is running Phase 24 or later."
            )

        try:
            return _unwrap_content_key(
                wrapped_key_b64   = data["wrapped_key"],
                ephemeral_pub_b64 = data["ephemeral_pub"],
                wrap_iv_b64       = data["wrap_iv"],
                wrap_auth_tag_b64 = data["wrap_auth_tag"],
                key_path          = self.key_path,
            )
        except Exception as e:
            raise SecurityException(f"[KEY UNWRAP FAILED] Crypto error: {e}") from e

    # ── Optional helper ───────────────────────────────────────────────────────

    def decrypt_ipfs_file(self, encrypted_bytes: bytes) -> bytes:
        """
        Convenience method: retrieve content key then decrypt an AES-256-GCM
        IPFS payload. Payload format: IV(12B) || AuthTag(16B) || Ciphertext.
        """
        content_key = self.get_content_key()
        iv       = encrypted_bytes[:12]
        auth_tag = encrypted_bytes[12:28]
        ciphertext = encrypted_bytes[28:]
        decryptor = Cipher(
            algorithms.AES(content_key),
            modes.GCM(iv, auth_tag),
        ).decryptor()
        return decryptor.update(ciphertext) + decryptor.finalize()


# ─────────────────────────────────────────────────────────────────────────────
# CLI usage: python3 license_validator.py --vault-id X --agent-id Y --api-key sk-...
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Validate a license and retrieve content key")
    parser.add_argument("--vault-id",  required=True,  help="Vault UUID")
    parser.add_argument("--agent-id",  required=True,  help="Your agent ID")
    parser.add_argument("--api-key",   required=True,  help="Bearer sk-* API key")
    parser.add_argument("--key-path",  required=True,  help="Path to Ed25519 private key PEM")
    parser.add_argument("--api-base",  default="http://localhost:3000", help="Dashboard base URL")
    parser.add_argument("--get-key",   action="store_true", help="Also retrieve and print the content key")
    args = parser.parse_args()

    v = LicenseValidator(
        agent_id = args.agent_id,
        vault_id = args.vault_id,
        api_key  = args.api_key,
        key_path = args.key_path,
        api_base = args.api_base,
    )

    print(f"Checking license for vault {args.vault_id[:8]}… (agent: {args.agent_id[:12]}…)")
    valid = v.check()
    print(f"License valid: {valid}")

    if valid and args.get_key:
        key = v.get_content_key()
        print(f"Content key (base64): {base64.b64encode(key).decode()}")
        print(f"Content key length:   {len(key)} bytes")
