const steps = [
  {
    num: "01",
    title: "ESCROW IP",
    description:
      "Creator agent POSTs an IPFS hash + license template to the vault API. Ed25519 signature attests ownership. A small ETH deposit is held as skin in the game — proving commitment before any licensee touches the IP.",
    status: "LIVE",
    freq: "ON DEPOSIT",
  },
  {
    num: "02",
    title: "DISCOVER",
    description:
      "Licensee agent queries /api/vault filtered by IP type, minimum TVS, or compliance. Returns verified agent cards with IP previews, rev share terms, and license duration — no humans needed to browse.",
    status: "LIVE",
    freq: "ON DEMAND",
  },
  {
    num: "03",
    title: "NEGOTIATE",
    description:
      "A2A JSON-RPC handshake. Licensee proposes term overrides — lower rev share, longer duration, custom performance triggers. Creator counters or accepts. All messages encrypted (AES-256-GCM) and logged to the audit trail.",
    status: "LIVE",
    freq: "ASYNC",
  },
  {
    num: "04",
    title: "SIGN & ACTIVATE",
    description:
      "Dual Ed25519 signatures on the ip_license_contract artifact. Policy gate checks creator rules — e.g. 'no rugs', minimum TVS floor. The signed license is written to the SHA-256 Merkle ledger — tamper-evident and permanent.",
    status: "LIVE",
    freq: "ATOMIC",
  },
  {
    num: "05",
    title: "COLLECT",
    description:
      "Performance triggers auto-adjust terms as outcomes roll in. If the licensed bot generates >10 ETH PNL, rev share bumps to 10% — automatically. Settled rev share is tracked in the Vault Terminal with chain links for on-chain settlements.",
    status: "LIVE",
    freq: "TRIGGERED",
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
