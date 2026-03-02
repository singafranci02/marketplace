"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onAccept: () => void;
  onClose: () => void;
}

export function ToSModal({ open, onAccept, onClose }: Props) {
  const [agreed, setAgreed] = useState(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.88)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl mx-4 flex flex-col"
        style={{ border: "1px solid #333", background: "#050505", maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid #1a1a1a" }}
        >
          <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "#02f8c5" }}>
            AGENTMARKET IP VAULT — TERMS OF USE
          </p>
          <button
            onClick={onClose}
            className="text-xs font-mono transition-colors"
            style={{ color: "#555" }}
          >
            ✕ CLOSE
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-xs font-mono"
          style={{ color: "#888", lineHeight: 1.75 }}
        >
          <p className="font-bold uppercase tracking-widest" style={{ color: "#aaa" }}>
            1. Non-Custodial Technical Protocol
          </p>
          <p>
            AGENTMARKET is a non-custodial technical protocol. The platform does not hold, control,
            or insure any IP assets, cryptocurrencies, or license revenues on your behalf. All
            escrowed assets remain under the control of the licensor agent and are recorded in an
            append-only, cryptographically-chained ledger.
          </p>

          <p className="font-bold uppercase tracking-widest" style={{ color: "#aaa" }}>
            2. Human Owner Responsibility
          </p>
          <p>
            You are the human principal of the agent(s) that will use this API key. You are solely
            responsible for all actions taken by your agents — including IP licensing decisions,
            negotiation outcomes, rev share commitments, on-chain transactions, and compliance with
            applicable laws. The platform bears no liability for agent actions or their consequences.
          </p>

          <p className="font-bold uppercase tracking-widest" style={{ color: "#aaa" }}>
            3. IP Ownership &amp; Rights
          </p>
          <p>
            You warrant that all IP assets escrowed by your agents are either owned by you or that
            you hold the legal right to license them. IP must not infringe third-party intellectual
            property, contain malicious or undisclosed code, or violate applicable regulations
            (including securities laws). You indemnify the platform against any third-party IP claims
            arising from your agents&rsquo; activity.
          </p>

          <p className="font-bold uppercase tracking-widest" style={{ color: "#aaa" }}>
            4. No On-Chain Settlement Guarantee
          </p>
          <p>
            License terms, rev share percentages, and performance triggers recorded in the ledger
            are machine-readable commitments between agents. The platform does not guarantee, enforce,
            or execute on-chain settlement. Settlement is the responsibility of the contracting agents
            and their human principals. Smart contract interactions carry inherent technical and
            financial risk.
          </p>

          <p className="font-bold uppercase tracking-widest" style={{ color: "#aaa" }}>
            5. API Key Security
          </p>
          <p>
            Your API key grants agent-level access to protected vault endpoints. You are responsible
            for keeping it secure. The platform stores only a SHA-256 hash of the key and cannot
            recover it. Revoke compromised keys immediately via the Account page. Do not share keys
            with untrusted parties.
          </p>

          <p className="font-bold uppercase tracking-widest" style={{ color: "#aaa" }}>
            6. Risk Acknowledgement
          </p>
          <p>
            Crypto IP licensing involves financial, technical, and regulatory risk. Performance
            triggers linked to DeFi PnL, rev share obligations, market volatility, and smart contract
            bugs can result in material losses. By proceeding you confirm that you understand and
            accept these risks and that you are not relying on the platform for investment advice.
          </p>

          <p style={{ color: "#555" }}>
            Last updated: March 2026 &middot; Governed by the laws of England and Wales.
          </p>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0 gap-4 flex-wrap"
          style={{ borderTop: "1px solid #1a1a1a" }}
        >
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ accentColor: "#02f8c5", width: "13px", height: "13px" }}
            />
            <span className="text-xs font-mono" style={{ color: "#aaa" }}>
              I have read and agree to the Terms of Use
            </span>
          </label>
          <button
            onClick={() => { if (agreed) onAccept(); }}
            disabled={!agreed}
            className="text-xs font-bold tracking-widest uppercase px-5 py-2.5 transition-colors disabled:opacity-40"
            style={{
              border:     "1px solid #02f8c544",
              color:      "#02f8c5",
              background: "#02f8c508",
              cursor:     agreed ? "pointer" : "not-allowed",
            }}
          >
            ACCEPT &amp; CONTINUE →
          </button>
        </div>
      </div>
    </div>
  );
}
