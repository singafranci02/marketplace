"use client";

interface DealArtifact {
  artifact_id: string;
  task_id: string;
  artifact_type: string;
  schema_version: string;
  status: string;
  verified?: boolean;
  chain_valid?: boolean;
  artifact_hash?: string;
  isNew?: boolean;
  tx_hash?: string;
  on_chain_status?: string;
  parties: {
    buyer: { agent_id: string; company: string };
    seller: { agent_id: string; company: string; legal_entity_id: string };
  };
  terms: {
    product: string;
    seats: number;
    trial_days: number;
    price_usd_monthly: number;
    currency: string;
    start_date: string;
    auto_renew: boolean;
    cancellation_notice_days: number;
  };
  policy_check: {
    policy_engine_version: string;
    checked_at: string;
    proposed_price_usd: number;
    budget_ceiling_usd: number;
    monthly_per_seat_usd: number;
    seats: number;
    trial_days: number;
    decision: "APPROVED" | "REJECTED";
    reason: string;
  };
  signatures: {
    buyer_signature: string;
    seller_signature: string;
    algorithm: string;
  };
  issued_at: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

const COLS = [
  "#", "TIMESTAMP (UTC)", "BUYER", "SELLER", "PRODUCT", "SEATS", "PRICE / MO", "POLICY", "STATUS", "SIG", "CHAIN", "ON-CHAIN",
];

export function ArtifactsTable({ artifacts }: { artifacts: DealArtifact[] }) {
  if (artifacts.length === 0) {
    return (
      <div
        className="py-16 text-center"
        style={{ border: "1px dashed #1a1a1a" }}
      >
        <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "#333" }}>
          NO DEALS YET — RUN{" "}
          <code style={{ color: "#02f8c5" }}>python3 negotiate_deal.py</code>
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" style={{ border: "1px solid #1a1a1a" }}>
      <table className="min-w-full text-xs font-mono">
        <thead style={{ borderBottom: "1px solid #1a1a1a" }}>
          <tr>
            {COLS.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left tracking-widest uppercase"
                style={{ color: "#333", fontWeight: 600 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {artifacts.map((a, idx) => (
            <tr
              key={a.artifact_id}
              style={{ borderTop: "1px solid #0d0d0d" }}
              className={`transition-colors${a.isNew ? " row-new" : ""}`}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.background = "#050505";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
              }}
            >
              <td className="px-4 py-3" style={{ color: "#333" }}>{idx + 1}</td>

              <td className="whitespace-nowrap px-4 py-3" style={{ color: "#666" }}>
                {formatDate(a.issued_at)}
              </td>

              <td className="px-4 py-3 font-semibold text-white">
                {a.parties.buyer.company}
              </td>

              <td className="px-4 py-3">
                <div className="font-semibold text-white">{a.parties.seller.company}</div>
                <div style={{ color: "#333" }}>{a.parties.seller.legal_entity_id}</div>
              </td>

              <td className="px-4 py-3" style={{ color: "#888" }}>{a.terms.product}</td>

              <td className="px-4 py-3 tabular-nums" style={{ color: "#666" }}>
                {a.terms.seats}
              </td>

              <td className="whitespace-nowrap px-4 py-3 font-bold" style={{ color: "#02f8c5" }}>
                ${a.terms.price_usd_monthly.toLocaleString()} {a.terms.currency}
              </td>

              <td className="px-4 py-3">
                <span
                  style={{
                    color: a.policy_check.decision === "APPROVED" ? "#02f8c5" : "#ff4444",
                    border: `1px solid ${a.policy_check.decision === "APPROVED" ? "#02f8c522" : "#ff444422"}`,
                    background: a.policy_check.decision === "APPROVED" ? "#02f8c508" : "#ff444408",
                  }}
                  className="inline-block px-2 py-0.5"
                >
                  {a.policy_check.decision === "APPROVED" ? "✓ " : "✗ "}
                  {a.policy_check.decision}
                </span>
                <div className="mt-0.5" style={{ color: "#333" }}>
                  ≤${a.policy_check.budget_ceiling_usd}
                </div>
              </td>

              <td className="px-4 py-3">
                <span
                  className="inline-block px-2 py-0.5"
                  style={{
                    color: "#888",
                    border: "1px solid #1a1a1a",
                  }}
                >
                  {a.status}
                </span>
              </td>

              <td className="px-4 py-3 whitespace-nowrap">
                {a.verified === undefined ? (
                  <span className="text-xs font-mono" style={{ color: "#333" }}>—</span>
                ) : (
                  <span
                    className="inline-block px-2 py-0.5 text-xs font-mono"
                    style={{
                      color:      a.verified ? "#02f8c5" : "#ff4444",
                      border:     `1px solid ${a.verified ? "#02f8c522" : "#ff444422"}`,
                      background: a.verified ? "#02f8c508" : "#ff444408",
                    }}
                  >
                    {a.verified ? "✓ ED25519" : "✗ INVALID"}
                  </span>
                )}
              </td>

              <td className="px-4 py-3 whitespace-nowrap">
                {a.chain_valid === undefined ? (
                  <span className="text-xs font-mono" style={{ color: "#333" }}>—</span>
                ) : idx === 0 ? (
                  <span
                    className="inline-block px-2 py-0.5 text-xs font-mono"
                    style={{ color: "#888", border: "1px solid #1a1a1a" }}
                  >
                    ⬤ GENESIS
                  </span>
                ) : (
                  <span
                    className="inline-block px-2 py-0.5 text-xs font-mono"
                    style={{
                      color:      a.chain_valid ? "#02f8c5" : "#ff4444",
                      border:     `1px solid ${a.chain_valid ? "#02f8c522" : "#ff444422"}`,
                      background: a.chain_valid ? "#02f8c508" : "#ff444408",
                    }}
                  >
                    {a.chain_valid ? "✓ LINKED" : "✗ BROKEN"}
                  </span>
                )}
              </td>

              <td className="px-4 py-3 whitespace-nowrap">
                {a.on_chain_status === "VERIFIED_ON_CHAIN" ? (
                  <span
                    className="inline-block px-2 py-0.5 text-xs font-mono"
                    style={{ color: "#02f8c5", border: "1px solid #02f8c522", background: "#02f8c508" }}
                  >
                    ⛓️ VERIFIED
                  </span>
                ) : a.on_chain_status === "PENDING_ON_CHAIN" ? (
                  <span
                    className="inline-block px-2 py-0.5 text-xs font-mono"
                    style={{ color: "#f5a623", border: "1px solid #f5a62322", background: "#f5a62308" }}
                  >
                    ⏳ PENDING
                  </span>
                ) : (
                  <span className="text-xs font-mono" style={{ color: "#333" }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
