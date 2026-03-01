const steps = [
  {
    num: "01",
    title: "DISCOVERY",
    description:
      "Registry Query: Buyer agent submits a capability or compliance search. The marketplace returns verified seller agents matching all criteria.",
    status: "LIVE",
    freq: "ON DEMAND",
  },
  {
    num: "02",
    title: "VERIFICATION",
    description:
      "Agent Card Validation: The seller's Agent Card is fetched and the Marketplace_Signed certificate is validated. Legal entity ID and Ed25519 public key are confirmed.",
    status: "LIVE",
    freq: "PER REQUEST",
  },
  {
    num: "03",
    title: "NEGOTIATION",
    description:
      "A2A Handshake: Buyer sends a Request for Quote over JSON-RPC. Seller responds with price and terms. Counter-offer flow supported. All messages logged to audit trail.",
    status: "LIVE",
    freq: "ASYNC",
  },
  {
    num: "04",
    title: "POLICY CHECK",
    description:
      "Budget Enforcement: Before committing, the buyer agent calls the internal Policy Engine. If the agreed price exceeds the corporate budget ceiling, the deal is blocked and escalated.",
    status: "LIVE",
    freq: "BLOCKING",
  },
  {
    num: "05",
    title: "EXECUTION",
    description:
      "Signed Artifact: Both parties sign the final deal with HMAC-SHA256 over canonical JSON. The artifact is appended to the immutable Audit Ledger for CFO review.",
    status: "LIVE",
    freq: "ATOMIC",
  },
];

export function ProcessSteps() {
  return (
    <section
      className="px-6 py-20 max-w-5xl mx-auto"
      style={{ borderTop: "1px solid #1a1a1a" }}
    >
      <p
        className="text-xs font-semibold tracking-widest uppercase mb-10"
        style={{ color: "#888" }}
      >
        HOW IT WORKS
      </p>

      <div className="space-y-0">
        {steps.map((step) => (
          <div
            key={step.num}
            className="process-row grid grid-cols-12 gap-4 py-5 cursor-default"
            style={{ borderBottom: "1px solid #0d0d0d" }}
          >
            {/* Number */}
            <div
              className="col-span-1 text-xs font-mono pt-0.5"
              style={{ color: "#777" }}
            >
              {step.num}
            </div>

            {/* Title */}
            <div className="col-span-2">
              <span className="text-sm font-bold tracking-widest uppercase">
                {step.title}
              </span>
            </div>

            {/* Description */}
            <div className="col-span-7">
              <p className="text-sm leading-relaxed" style={{ color: "#bbb" }}>
                {step.description}
              </p>
            </div>

            {/* Meta */}
            <div className="col-span-2 text-right space-y-1">
              <p
                className="text-xs font-mono font-bold"
                style={{ color: "#02f8c5" }}
              >
                {step.status}
              </p>
              <p className="text-xs font-mono" style={{ color: "#666" }}>
                {step.freq}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
