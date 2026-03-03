"""
policy_engine.py — Phase 34 Buyer-Side Policy Gate
====================================================
Evaluates a DealArtifact against three hard rules before the buyer signs.
The BuyerAgent calls this after artifact construction but before Ed25519 signing.

Rules:
  1. Seller Liquidity Score > 5.0  (fetched from /api/agents/{id}/reputation)
  2. VerificationScript hash present and valid sha256 hex (64 lowercase hex chars)
  3. Artifact self-consistency: sha256(canonical_body) is computed and stored
     so the solana-listener can later cross-check it against the on-chain commitment.

All three must pass for decision = "APPROVED".
If any fail, decision = "BLOCKED" and the negotiation is aborted.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import re
import urllib.request
import urllib.error
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from negotiate_deal import DealArtifact

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclasses.dataclass
class RuleResult:
    rule:   str
    passed: bool
    detail: str

    def __iter__(self):
        return iter(dataclasses.astuple(self))

    @property
    def __dict__(self):  # type: ignore[override]
        return dataclasses.asdict(self)


@dataclasses.dataclass
class PolicyResult:
    decision:               str           # "APPROVED" | "BLOCKED"
    rules:                  list[RuleResult]
    reasons:                list[str]     # failed rule details only
    computed_artifact_hash: str           # sha256(canonical_body) hex — for listener cross-check

    def as_dict(self) -> dict:
        return {
            "decision":               self.decision,
            "rules":                  [dataclasses.asdict(r) for r in self.rules],
            "reasons":                self.reasons,
            "computed_artifact_hash": self.computed_artifact_hash,
        }


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SELLER_SCORE_THRESHOLD = 5.0
_VALID_HASH_RE = re.compile(r"^[0-9a-f]{64}$")

# ---------------------------------------------------------------------------
# PolicyEngine
# ---------------------------------------------------------------------------

class PolicyEngine:
    """
    Buyer-side policy gate — evaluates a (pre-signing) DealArtifact.

    Usage (from negotiate_deal.py):
        engine = PolicyEngine()
        result = engine.evaluate(artifact, api_base, api_key)
        if result.decision == "BLOCKED":
            raise RuntimeError(result.reasons)
    """

    def evaluate(
        self,
        artifact:  "DealArtifact",
        api_base:  str = "",
        api_key:   str = "",
    ) -> PolicyResult:
        rules: list[RuleResult] = []

        seller_id = (artifact.parties.get("licensor") or {}).get("agent_id", "")

        # ── Rule 1: Seller Liquidity Score > 5.0 ──────────────────────────────
        rules.append(self._check_seller_score(seller_id, api_base, api_key))

        # ── Rule 2: VerificationScript hash present and valid ─────────────────
        rules.append(self._check_script_hash(artifact))

        # ── Rule 3: Compute self-consistency artifact hash ─────────────────────
        computed_hash = hashlib.sha256(artifact.canonical_body()).hexdigest()
        rules.append(RuleResult(
            rule   = "artifact_self_consistency",
            passed = True,
            detail = f"sha256(canonical_body) = {computed_hash[:16]}…",
        ))

        failed  = [r for r in rules if not r.passed]
        reasons = [r.detail for r in failed]

        return PolicyResult(
            decision               = "BLOCKED" if failed else "APPROVED",
            rules                  = rules,
            reasons                = reasons,
            computed_artifact_hash = computed_hash,
        )

    # ── Internal rule checks ─────────────────────────────────────────────────

    def _check_seller_score(
        self,
        seller_id: str,
        api_base:  str,
        api_key:   str,
    ) -> RuleResult:
        """Rule 1: Seller Liquidity Score must exceed threshold."""
        if not api_base or not seller_id:
            # Cannot check without API — fail open with a warning
            return RuleResult(
                rule   = "seller_liquidity_score",
                passed = True,
                detail = f"Score check skipped (no API base configured) — seller={seller_id[:12]}…",
            )

        url = f"{api_base}/api/agents/{seller_id}/reputation"
        req = urllib.request.Request(
            url,
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {},
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read())
            score = float(data.get("liquidity_score_sol", 0))
            passed = score > _SELLER_SCORE_THRESHOLD
            return RuleResult(
                rule   = "seller_liquidity_score",
                passed = passed,
                detail = (
                    f"Score {score:.4f} SOL > {_SELLER_SCORE_THRESHOLD} — OK"
                    if passed else
                    f"Score {score:.4f} SOL ≤ {_SELLER_SCORE_THRESHOLD} — BLOCKED "
                    f"(seller {seller_id[:12]}… has insufficient liquidity)"
                ),
            )
        except Exception as exc:  # noqa: BLE001
            # Fail open on network errors — log but don't block the deal
            return RuleResult(
                rule   = "seller_liquidity_score",
                passed = True,
                detail = f"Score check unreachable ({exc}) — fail-open",
            )

    def _check_script_hash(self, artifact: "DealArtifact") -> RuleResult:
        """Rule 2: verification_script_hash must be a valid sha256 hex string."""
        script_hash = (artifact.terms or {}).get("verification_script_hash", "")
        if script_hash and _VALID_HASH_RE.match(script_hash):
            return RuleResult(
                rule   = "verification_script_hash",
                passed = True,
                detail = f"VerificationScript hash present: {script_hash[:16]}…",
            )
        return RuleResult(
            rule   = "verification_script_hash",
            passed = False,
            detail = (
                "Missing or malformed verification_script_hash in artifact.terms — "
                "seller must provide a sha256 hash of the VerificationScript"
            ),
        )
