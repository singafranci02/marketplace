"""
negotiate_deal.py — A2A Protocol Negotiation Engine
====================================================
Simulates a Buyer Agent and Seller Agent negotiating a 10-seat CRM trial
using the A2A Protocol message format (v0.3).

Message flow:
  1. Buyer → Seller : Request for Quote (RFQ)
  2. Seller → Buyer : Quote response
  3. Buyer          : check_internal_budget() policy check
  4. Buyer → Seller : Accept / Counter / Reject
  5. Seller → Buyer : Final confirmation
  6. Both           : Sign and emit the deal Artifact

Every handshake is appended to negotiation_log.jsonl as an audit trail.
"""

import json
import os
import uuid
import base64
import datetime
import dataclasses
import urllib.request
import urllib.error
from pathlib import Path
from typing import Literal

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    load_pem_private_key, load_pem_public_key,
    Encoding, PublicFormat,
)
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BUYER_AGENT_ID  = "bafybeibuyer0000acmecorp000000000000000000000000000000000001"
SELLER_AGENT_ID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"  # SydneySaaS

BUYER_COMPANY   = "Acme Corp"
SELLER_COMPANY  = "Sydney SaaS Solutions Pty Ltd"

# Internal buyer policy: maximum authorised spend for a CRM trial (USD / month)
BUYER_BUDGET_USD      = 500
SELLER_ASKING_PRICE   = 420   # Seller's initial quote (per month for 10 seats)
SELLER_FLOOR_PRICE    = 380   # Minimum the seller will accept

AUDIT_LOG_PATH    = Path(__file__).parent / "negotiation_log.jsonl"
KEYS_DIR          = Path(__file__).parent / "agent-keys"
_ENV_PATH         = Path(__file__).parent / ".env"

# Maps agent_id → key file name for the ECDHE handshake
_AGENT_KEY_MAP = {
    BUYER_AGENT_ID:  "buyer-acmecorp",
    SELLER_AGENT_ID: "sydney-saas",
}


def _agent_id_to_key_name(agent_id: str) -> str:
    key = _AGENT_KEY_MAP.get(agent_id)
    if not key:
        raise ValueError(f"No key mapping for agent: {agent_id}")
    return key

# ---------------------------------------------------------------------------
# A2A Message primitives
# ---------------------------------------------------------------------------

MessageRole = Literal["buyer", "seller", "system"]

@dataclasses.dataclass
class A2AMessage:
    """A single A2A protocol message, modelled on A2A v0.3 Task Message format."""
    message_id:   str
    task_id:      str
    from_agent:   str        # agent_id
    to_agent:     str        # agent_id
    role:         MessageRole
    method:       str        # JSON-RPC style method name
    payload:      dict
    timestamp:    str = dataclasses.field(
        default_factory=lambda: datetime.datetime.utcnow().isoformat() + "Z"
    )

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclasses.dataclass
class DealArtifact:
    """
    The signed deal artifact — the final contract emitted when negotiation succeeds.
    Both parties include their Ed25519 signature over the canonical artifact body.
    """
    artifact_id:    str
    task_id:        str
    artifact_type:  str   = "deal_contract"
    schema_version: str   = "1.0"
    status:         str   = "ACCEPTED"
    parties: dict         = dataclasses.field(default_factory=dict)
    terms: dict           = dataclasses.field(default_factory=dict)
    policy_check: dict    = dataclasses.field(default_factory=dict)
    signatures: dict      = dataclasses.field(default_factory=dict)
    issued_at: str        = dataclasses.field(
        default_factory=lambda: datetime.datetime.utcnow().isoformat() + "Z"
    )

    def canonical_body(self) -> bytes:
        """Deterministic JSON serialisation for signing (no signatures field)."""
        body = {
            "artifact_id":    self.artifact_id,
            "task_id":        self.task_id,
            "artifact_type":  self.artifact_type,
            "schema_version": self.schema_version,
            "status":         self.status,
            "parties":        self.parties,
            "terms":          self.terms,
            "policy_check":   self.policy_check,
            "issued_at":      self.issued_at,
        }
        return json.dumps(body, sort_keys=True, separators=(",", ":")).encode()

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


# ---------------------------------------------------------------------------
# Audit logger
# ---------------------------------------------------------------------------

def _log(event_type: str, data: dict) -> None:
    """Append a single JSON line to the audit trail."""
    record = {
        "event_type": event_type,
        "logged_at":  datetime.datetime.utcnow().isoformat() + "Z",
        **data,
    }
    with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")
    print(f"  [AUDIT] {event_type}")


def _read_env() -> tuple[str, str]:
    """Read AGENTMARKET_API_KEY and AGENTMARKET_API_BASE from marketplace/.env."""
    api_key, api_base = "", "http://localhost:3000"
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text().splitlines():
            if line.startswith("AGENTMARKET_API_KEY="):
                api_key = line.split("=", 1)[1].strip()
            elif line.startswith("AGENTMARKET_API_BASE="):
                api_base = line.split("=", 1)[1].strip()
    return api_key, api_base


def _verify_policy(proposed_artifact: dict) -> dict:
    """
    Call /api/verify-policy before signing.
    Raises RuntimeError if the policy engine blocks the deal (HTTP 403).
    Returns the policy evaluation result dict.
    """
    api_key, api_base = _read_env()
    url  = f"{api_base}/api/verify-policy"
    data = json.dumps(proposed_artifact).encode()
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
            n = len(result.get("results", []))
            print(f"  [POLICY] {result['decision']} — {n} rule(s) checked")
            return result
    except urllib.error.HTTPError as e:
        body = json.loads(e.read().decode())
        reasons = "; ".join(body.get("reasons", ["Policy check failed"]))
        print(f"  [POLICY] BLOCKED — {reasons}")
        raise RuntimeError(f"Policy engine blocked this deal: {reasons}")


def _post_artifact(artifact: dict) -> None:
    """POST the signed artifact to the Next.js API → Supabase ledger."""
    api_key, api_base = _read_env()
    url  = f"{api_base}/api/artifacts"
    data = json.dumps(artifact).encode()
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
            print(f"  [LEDGER] Posted to {url} → HTTP {resp.status}")
    except urllib.error.HTTPError as e:
        print(f"  [LEDGER] HTTP {e.code}: {e.read().decode()}")
        raise


# ---------------------------------------------------------------------------
# Signing helper
# ---------------------------------------------------------------------------

def _sign(canonical_body: bytes, key_name: str) -> str:
    """
    Ed25519 signature over canonical_body using the agent's private key file.
    key_name maps to agent-keys/{key_name}.pem (e.g. "buyer-acmecorp").
    Returns a base64url-encoded 64-byte Ed25519 signature.
    """
    key_file = KEYS_DIR / f"{key_name}.pem"
    if not key_file.exists():
        raise FileNotFoundError(
            f"Private key not found: {key_file}\n"
            "Run: python3 generate_keys.py"
        )
    private_key: Ed25519PrivateKey = load_pem_private_key(  # type: ignore[assignment]
        key_file.read_bytes(), password=None
    )
    sig_bytes = private_key.sign(canonical_body)
    return base64.urlsafe_b64encode(sig_bytes).decode()


# ---------------------------------------------------------------------------
# Encryption helpers (AES-256-GCM) and ECDHE handshake
# ---------------------------------------------------------------------------

def _load_ed25519_public_key(agent_id: str):
    """Load Ed25519 public key PEM from database.json for the given agent_id."""
    db_path = Path(__file__).parent / "database.json"
    db = json.loads(db_path.read_text())
    for agent in db.get("agents", []):
        if agent["agent_id"] == agent_id:
            return load_pem_public_key(agent["public_key"].encode())
    raise ValueError(f"Public key not found for agent: {agent_id}")


def _encrypt(payload: dict, session_key: bytes) -> dict:
    """AES-256-GCM encrypt a dict payload. Returns an envelope dict."""
    iv = os.urandom(12)  # 96-bit nonce (GCM standard)
    aesgcm = AESGCM(session_key)
    ciphertext = aesgcm.encrypt(iv, json.dumps(payload).encode(), None)
    return {
        "encrypted":  True,
        "algorithm":  "AES-256-GCM",
        "iv":         base64.urlsafe_b64encode(iv).decode(),
        "ciphertext": base64.urlsafe_b64encode(ciphertext).decode(),
    }


def _decrypt(envelope: dict, session_key: bytes) -> dict:
    """AES-256-GCM decrypt an envelope produced by _encrypt()."""
    iv         = base64.urlsafe_b64decode(envelope["iv"])
    ciphertext = base64.urlsafe_b64decode(envelope["ciphertext"])
    aesgcm     = AESGCM(session_key)
    return json.loads(aesgcm.decrypt(iv, ciphertext, None))


def _perform_handshake(buyer_key_name: str, seller_agent_id: str) -> bytes:
    """
    Ephemeral X25519 key exchange authenticated with Ed25519 signing keys.
    Returns a 32-byte AES-256 session key derived via HKDF-SHA256.
    Key separation: Ed25519 keys sign; ephemeral X25519 keys do DH (forward secrecy).
    """
    print("\n[CRYPTO] ── Key Exchange ──────────────────────────────────────────")

    # ── Buyer side ──────────────────────────────────────────────────────────
    buyer_eph_priv  = X25519PrivateKey.generate()
    buyer_eph_pub   = buyer_eph_priv.public_key()
    buyer_pub_bytes = buyer_eph_pub.public_bytes(Encoding.Raw, PublicFormat.Raw)

    buyer_ed25519_priv: Ed25519PrivateKey = load_pem_private_key(  # type: ignore
        (KEYS_DIR / f"{buyer_key_name}.pem").read_bytes(), password=None
    )
    buyer_sig = buyer_ed25519_priv.sign(b"KEY_EXCHANGE:" + buyer_pub_bytes)
    print(f"  [BUYER ] Ephemeral X25519 pub generated + signed with Ed25519")

    # ── Seller side ──────────────────────────────────────────────────────────
    seller_eph_priv  = X25519PrivateKey.generate()
    seller_eph_pub   = seller_eph_priv.public_key()
    seller_pub_bytes = seller_eph_pub.public_bytes(Encoding.Raw, PublicFormat.Raw)

    seller_key_name     = _agent_id_to_key_name(seller_agent_id)
    seller_ed25519_priv: Ed25519PrivateKey = load_pem_private_key(  # type: ignore
        (KEYS_DIR / f"{seller_key_name}.pem").read_bytes(), password=None
    )
    seller_sig = seller_ed25519_priv.sign(b"KEY_EXCHANGE:" + seller_pub_bytes)
    print(f"  [SELLER] Ephemeral X25519 pub generated + signed with Ed25519")

    # ── Mutual authentication: verify each other's handshake signatures ──────
    buyer_ed25519_pub  = buyer_ed25519_priv.public_key()
    seller_ed25519_pub = _load_ed25519_public_key(seller_agent_id)

    buyer_ed25519_pub.verify(buyer_sig, b"KEY_EXCHANGE:" + buyer_pub_bytes)
    seller_ed25519_pub.verify(seller_sig, b"KEY_EXCHANGE:" + seller_pub_bytes)
    print(f"  [CRYPTO] Signatures verified ✓")

    # ── Derive shared secret via X25519 DH ───────────────────────────────────
    shared_secret = buyer_eph_priv.exchange(seller_eph_pub)
    # Deterministic salt: XOR of both ephemeral public keys (same on both sides)
    salt = bytes(a ^ b for a, b in zip(buyer_pub_bytes, seller_pub_bytes))

    session_key = HKDF(
        algorithm = hashes.SHA256(),
        length    = 32,
        salt      = salt,
        info      = b"AGENTMARKET-NEGOTIATION-v1",
    ).derive(shared_secret)

    print(f"  [CRYPTO] Session key derived via HKDF-SHA256 (AES-256-GCM ready)")
    print(f"  [CRYPTO] All negotiation messages will be encrypted in the log")
    print("[CRYPTO] ─────────────────────────────────────────────────────────\n")
    return session_key


# ---------------------------------------------------------------------------
# Policy engine
# ---------------------------------------------------------------------------

def check_internal_budget(
    proposed_price_usd: float,
    seats: int,
    trial_days: int,
) -> dict:
    """
    CRITICAL policy gate — called by the Buyer Agent before it can commit.

    Mirrors the logic of the Policy Engine (Phase 2): if the monthly cost
    exceeds BUYER_BUDGET_USD, the deal is blocked and must be escalated.

    Returns a policy result dict that is embedded in the final artifact.
    """
    monthly_per_seat = proposed_price_usd / seats
    approved = proposed_price_usd <= BUYER_BUDGET_USD

    result = {
        "policy_engine_version": "1.0",
        "checked_at": datetime.datetime.utcnow().isoformat() + "Z",
        "proposed_price_usd": proposed_price_usd,
        "budget_ceiling_usd": BUYER_BUDGET_USD,
        "monthly_per_seat_usd": round(monthly_per_seat, 2),
        "seats": seats,
        "trial_days": trial_days,
        "decision": "APPROVED" if approved else "REJECTED",
        "reason": (
            "Price within authorised budget."
            if approved
            else f"Price ${proposed_price_usd} exceeds budget ceiling ${BUYER_BUDGET_USD}."
        ),
    }

    _log("policy_check", result)
    return result


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

class SellerAgent:
    """
    SydneySaaS — the seller side.
    Responds to RFQs and issues confirmations.
    """

    def __init__(self, task_id: str):
        self.agent_id   = SELLER_AGENT_ID
        self.company    = SELLER_COMPANY
        self.task_id    = task_id
        self.session_key: bytes | None = None

    def _send(self, method: str, to: str, payload: dict) -> A2AMessage:
        logged_payload = (
            _encrypt(payload, self.session_key)
            if self.session_key
            else payload
        )
        msg = A2AMessage(
            message_id = str(uuid.uuid4()),
            task_id    = self.task_id,
            from_agent = self.agent_id,
            to_agent   = to,
            role       = "seller",
            method     = method,
            payload    = logged_payload,
        )
        _log("message_sent", msg.to_dict())
        # Return message with plaintext payload so the receiving agent can read it
        return dataclasses.replace(msg, payload=payload)

    def handle_rfq(self, rfq: A2AMessage) -> A2AMessage:
        """Receive RFQ and return a quote."""
        print(f"\n[SELLER] Received RFQ from {rfq.from_agent}")
        print(f"         Product: {rfq.payload['product']}, "
              f"Seats: {rfq.payload['seats']}, "
              f"Trial days: {rfq.payload['trial_days']}")

        quote_price = SELLER_ASKING_PRICE
        response = self._send(
            method  = "procurement.negotiate_trial",
            to      = rfq.from_agent,
            payload = {
                "quote_id":          str(uuid.uuid4()),
                "in_reply_to":       rfq.message_id,
                "product":           rfq.payload["product"],
                "seats":             rfq.payload["seats"],
                "trial_days":        rfq.payload["trial_days"],
                "price_usd_monthly": quote_price,
                "currency":          "USD",
                "valid_until":       (
                    datetime.datetime.utcnow() + datetime.timedelta(hours=24)
                ).isoformat() + "Z",
                "terms": "Trial includes full feature access. Auto-renews at standard rate unless cancelled 7 days prior.",
            },
        )
        print(f"[SELLER] Quote sent: ${quote_price}/month for "
              f"{rfq.payload['seats']} seats")
        return response

    def handle_counter(self, counter: A2AMessage) -> A2AMessage:
        """Receive a counter-offer and decide to accept or hold."""
        counter_price = counter.payload["counter_price_usd"]
        print(f"\n[SELLER] Counter received: ${counter_price}/month")

        # Seller accepts anything at or above floor price
        if counter_price >= SELLER_FLOOR_PRICE:
            accepted_price = counter_price
            decision = "ACCEPTED"
            print(f"[SELLER] Counter accepted at ${accepted_price}/month")
        else:
            accepted_price = SELLER_FLOOR_PRICE
            decision = "COUNTER"
            print(f"[SELLER] Counter rejected; holding at floor ${SELLER_FLOOR_PRICE}/month")

        return self._send(
            method  = "procurement.negotiate_trial",
            to      = counter.from_agent,
            payload = {
                "in_reply_to":       counter.message_id,
                "decision":          decision,
                "final_price_usd":   accepted_price,
                "currency":          "USD",
            },
        )

    def confirm_deal(self, buyer_acceptance: A2AMessage) -> A2AMessage:
        """Issue final confirmation once buyer accepts."""
        print(f"\n[SELLER] Buyer accepted. Issuing deal confirmation.")
        return self._send(
            method  = "procurement.negotiate_trial",
            to      = buyer_acceptance.from_agent,
            payload = {
                "in_reply_to":  buyer_acceptance.message_id,
                "status":       "DEAL_CONFIRMED",
                "message":      "Trial activated. Onboarding email will follow within 24h.",
            },
        )


class BuyerAgent:
    """
    Acme Corp — the buyer side.
    Sends RFQs, enforces internal budget policy, and signs the final artifact.
    """

    def __init__(self, task_id: str):
        self.agent_id    = BUYER_AGENT_ID
        self.company     = BUYER_COMPANY
        self.task_id     = task_id
        self.agreed_price: float | None = None
        self.session_key: bytes | None = None

    def _send(self, method: str, to: str, payload: dict) -> A2AMessage:
        logged_payload = (
            _encrypt(payload, self.session_key)
            if self.session_key
            else payload
        )
        msg = A2AMessage(
            message_id = str(uuid.uuid4()),
            task_id    = self.task_id,
            from_agent = self.agent_id,
            to_agent   = to,
            role       = "buyer",
            method     = method,
            payload    = logged_payload,
        )
        _log("message_sent", msg.to_dict())
        # Return message with plaintext payload so the receiving agent can read it
        return dataclasses.replace(msg, payload=payload)

    def send_rfq(self, to: str) -> A2AMessage:
        """Initiate the negotiation with a Request for Quote."""
        print(f"\n[BUYER] Sending RFQ to {to}")
        rfq = self._send(
            method  = "procurement.evaluate_vendor",
            to      = to,
            payload = {
                "rfq_id":     str(uuid.uuid4()),
                "product":    "CRM Platform Trial",
                "seats":      10,
                "trial_days": 30,
                "currency":   "USD",
                "notes":      "Require SSO, data export, and dedicated onboarding support.",
            },
        )
        print(f"[BUYER] RFQ sent: 10-seat CRM trial, 30 days")
        return rfq

    def evaluate_quote(
        self, quote: A2AMessage, seats: int, trial_days: int
    ) -> tuple[A2AMessage, dict]:
        """
        CRITICAL: Run check_internal_budget() before agreeing to anything.
        Returns the next buyer message and the policy result.
        """
        price = quote.payload["price_usd_monthly"]
        print(f"\n[BUYER] Quote received: ${price}/month")
        print(f"[BUYER] Running internal policy check...")

        policy = check_internal_budget(price, seats, trial_days)

        if policy["decision"] == "APPROVED":
            # Price is within budget — accept directly
            print(f"[BUYER] Policy APPROVED — accepting quote at ${price}/month")
            self.agreed_price = price
            response = self._send(
                method  = "procurement.negotiate_trial",
                to      = quote.from_agent,
                payload = {
                    "in_reply_to": quote.message_id,
                    "decision":    "ACCEPTED",
                    "price_usd":   price,
                    "message":     "Accepted. Please confirm the trial activation.",
                },
            )
        else:
            # Price too high — send counter at budget ceiling
            counter_price = BUYER_BUDGET_USD
            print(f"[BUYER] Policy REJECTED — sending counter at ${counter_price}/month")
            response = self._send(
                method  = "procurement.negotiate_trial",
                to      = quote.from_agent,
                payload = {
                    "in_reply_to":       quote.message_id,
                    "decision":          "COUNTER",
                    "counter_price_usd": counter_price,
                    "message":           f"Our budget ceiling is ${counter_price}/month. Can you accommodate?",
                },
            )

        return response, policy

    def accept_final(self, seller_response: A2AMessage) -> tuple[A2AMessage, float]:
        """Accept seller's final price after counter negotiation."""
        final_price = seller_response.payload["final_price_usd"]
        print(f"\n[BUYER] Seller final price: ${final_price}/month")

        # Re-run policy check on the final negotiated price
        policy = check_internal_budget(final_price, 10, 30)

        if policy["decision"] == "APPROVED":
            self.agreed_price = final_price
            msg = self._send(
                method  = "procurement.negotiate_trial",
                to      = seller_response.from_agent,
                payload = {
                    "in_reply_to": seller_response.message_id,
                    "decision":    "ACCEPTED",
                    "price_usd":   final_price,
                    "message":     "Accepted. Please confirm.",
                },
            )
            print(f"[BUYER] Accepted final price at ${final_price}/month")
            return msg, final_price
        else:
            raise RuntimeError(
                f"Negotiation failed: final price ${final_price} exceeds budget ${BUYER_BUDGET_USD}."
            )


# ---------------------------------------------------------------------------
# Artifact generator
# ---------------------------------------------------------------------------

def generate_signed_artifact(
    task_id: str,
    buyer: BuyerAgent,
    seller: SellerAgent,
    agreed_price: float,
    policy_result: dict,
) -> DealArtifact:
    """
    Build and sign the final deal Artifact.
    Both parties sign the canonical body with Ed25519 (per-agent private key).
"""
    artifact = DealArtifact(
        artifact_id = f"artifact-{uuid.uuid4()}",
        task_id     = task_id,
        parties = {
            "buyer": {
                "agent_id": buyer.agent_id,
                "company":  buyer.company,
            },
            "seller": {
                "agent_id": seller.agent_id,
                "company":  seller.company,
                "legal_entity_id": "AU-ABN-51824753556",
            },
        },
        terms = {
            "product":            "CRM Platform Trial",
            "seats":              10,
            "trial_days":         30,
            "price_usd_monthly":  agreed_price,
            "currency":           "USD",
            "start_date":         datetime.datetime.utcnow().date().isoformat(),
            "auto_renew":         False,
            "cancellation_notice_days": 7,
        },
        policy_check = policy_result,
    )

    # Gate: external policy engine must approve before signing
    print(f"\n[SYSTEM] Calling external policy engine...")
    policy_response = _verify_policy(artifact.to_dict())   # raises RuntimeError if 403
    reservation_id = policy_response.get("reservation_id")
    if reservation_id:
        artifact.policy_check["reservation_id"] = reservation_id
        print(f"  [ESCROW] Reservation locked: {reservation_id}")

    body = artifact.canonical_body()
    artifact.signatures = {
        "buyer_signature":  _sign(body, "buyer-acmecorp"),
        "seller_signature": _sign(body, "sydney-saas"),
        "algorithm": "Ed25519",
    }

    _log("artifact_signed", artifact.to_dict())
    _post_artifact(artifact.to_dict())
    return artifact


# ---------------------------------------------------------------------------
# Negotiation orchestrator
# ---------------------------------------------------------------------------

def run_negotiation() -> DealArtifact:
    """
    Orchestrates the full buyer ↔ seller negotiation.
    Returns the signed deal artifact on success.
    """
    task_id = f"task-{uuid.uuid4()}"
    print(f"\n{'='*60}")
    print(f"  A2A NEGOTIATION ENGINE  |  task_id: {task_id[:16]}...")
    print(f"{'='*60}")

    _log("negotiation_started", {
        "task_id":  task_id,
        "buyer":    BUYER_COMPANY,
        "seller":   SELLER_COMPANY,
        "product":  "CRM Platform Trial",
        "seats":    10,
    })

    buyer  = BuyerAgent(task_id)
    seller = SellerAgent(task_id)

    # ── Authenticated key exchange (ECDHE + Ed25519) ─────────────────────────
    session_key = _perform_handshake(
        buyer_key_name  = "buyer-acmecorp",
        seller_agent_id = SELLER_AGENT_ID,
    )
    buyer.session_key  = session_key
    seller.session_key = session_key
    # ─────────────────────────────────────────────────────────────────────────

    # Step 1: Buyer sends RFQ
    rfq = buyer.send_rfq(to=seller.agent_id)

    # Step 2: Seller responds with a quote
    quote = seller.handle_rfq(rfq)

    # Step 3: Buyer policy check + response
    buyer_response, policy = buyer.evaluate_quote(
        quote, seats=10, trial_days=30
    )

    # Step 4: Handle counter-offer flow if needed
    if buyer_response.payload.get("decision") == "COUNTER":
        # Seller responds to counter
        seller_final = seller.handle_counter(buyer_response)

        if seller_final.payload["decision"] == "ACCEPTED":
            # Buyer accepts the seller's counter-counter
            buyer_acceptance, agreed_price = buyer.accept_final(seller_final)
            # Re-fetch policy for the accepted price
            policy = check_internal_budget(agreed_price, 10, 30)
        else:
            # Seller held at floor; buyer must decide
            buyer_acceptance, agreed_price = buyer.accept_final(seller_final)
            policy = check_internal_budget(agreed_price, 10, 30)

        confirmation = seller.confirm_deal(buyer_acceptance)
    else:
        # Direct accept — seller confirms immediately
        agreed_price = buyer_response.payload["price_usd"]
        confirmation = seller.confirm_deal(buyer_response)

    print(f"\n[SYSTEM] {confirmation.payload['message']}")

    # Step 5: Generate and sign the deal artifact
    print(f"\n[SYSTEM] Generating signed deal artifact...")
    artifact = generate_signed_artifact(task_id, buyer, seller, agreed_price, policy)

    _log("negotiation_completed", {
        "task_id":       task_id,
        "artifact_id":   artifact.artifact_id,
        "agreed_price":  agreed_price,
        "status":        "SUCCESS",
    })

    return artifact


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    artifact = run_negotiation()

    print(f"\n{'='*60}")
    print("  SIGNED DEAL ARTIFACT")
    print(f"{'='*60}")
    print(json.dumps(artifact.to_dict(), indent=2))

    print(f"\n{'='*60}")
    print(f"  Audit trail written to: {AUDIT_LOG_PATH}")
    print(f"{'='*60}\n")
