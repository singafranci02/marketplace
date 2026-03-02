interface JsonRpcMethod {
  method: string;
  description: string;
}

interface AgentCard {
  agent_id: string;
  name: string;
  owner: string;
  legal_entity_id: string;
  capabilities: JsonRpcMethod[];
  compliance: string[];
  description: string;
  endpoint: string;
  verified: boolean;
  joined_at: string;
  status?: "ACTIVE" | "INACTIVE";
  liquidity_score_sol?: string;  // Phase 29: multi-factor DeFi score
  trust_tier?: string;           // Phase 29: UNVERIFIED | ATTESTED | AUDITED | STAKED
}

const TIER_COLORS: Record<string, string> = {
  STAKED:     "#f8c502",
  AUDITED:    "#02f8c5",
  ATTESTED:   "#888",
  UNVERIFIED: "#444",
};

function TrustTierBadge({ tier }: { tier: string }) {
  const color = TIER_COLORS[tier] ?? "#444";
  return (
    <span
      className="text-xs font-mono px-1.5 py-0.5"
      style={{
        color,
        border:     `1px solid ${color}33`,
        background: `${color}0a`,
        letterSpacing: "0.04em",
      }}
    >
      {tier}
    </span>
  );
}

function PowerLevelBar({ score }: { score: string }) {
  const val  = parseFloat(score) || 0;
  // Normalize: 100 SOL score = full bar
  const pct  = Math.min(val / 100, 1) * 100;
  const color = val === 0 ? "#222" : "#02f8c5";

  return (
    <div>
      <div
        style={{
          display:        "flex",
          justifyContent: "space-between",
          marginBottom:   4,
        }}
      >
        <span
          style={{
            fontSize:      10,
            color:         "#555",
            fontFamily:    "monospace",
            letterSpacing: "0.08em",
          }}
        >
          POWER LEVEL
        </span>
        <span style={{ fontSize: 10, color: "#888", fontFamily: "monospace" }}>
          {val.toFixed(4)}
        </span>
      </div>
      <div style={{ height: 2, background: "#111" }}>
        <div
          style={{
            height:     "100%",
            width:      `${pct}%`,
            background: color,
            boxShadow:  pct > 0 ? `0 0 4px ${color}` : "none",
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}

function ComplianceBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs font-mono rounded-sm"
      style={{ border: "1px solid #333", color: "#aaa" }}
    >
      {label}
    </span>
  );
}

function CapabilityTag({ method }: { method: string }) {
  const short = method.split(".")[1] ?? method;
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs font-mono"
      style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#bbb" }}
    >
      {short}
    </span>
  );
}

export function AgentGrid({ agents }: { agents: AgentCard[] }) {
  return (
    <section
      id="vault"
      className="px-6 py-20 max-w-5xl mx-auto"
      style={{ borderTop: "1px solid #1a1a1a" }}
    >
      <div className="flex items-center justify-between mb-10">
        <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#888" }}>
          VERIFIED IP LICENSORS
        </p>
        <p className="text-xs font-mono" style={{ color: "#666" }}>
          {agents.length} LISTED · {agents.filter(a => a.status !== "INACTIVE").length} ACTIVE · MARKETPLACE_SIGNED
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.agent_id}
            className="agent-card p-5 space-y-4"
            style={{ background: "#030303" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold tracking-wide uppercase">
                  {agent.name}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "#aaa" }}>
                  {agent.owner}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <span
                  className="text-xs font-mono px-1.5 py-0.5"
                  style={{
                    color:      agent.status === "INACTIVE" ? "#555" : "#02f8c5",
                    border:     `1px solid ${agent.status === "INACTIVE" ? "#222" : "#02f8c522"}`,
                    background: agent.status === "INACTIVE" ? "transparent" : "#02f8c508",
                  }}
                >
                  {agent.status === "INACTIVE" ? "OFFLINE" : "LIVE"}
                </span>
                {agent.trust_tier && (
                  <TrustTierBadge tier={agent.trust_tier} />
                )}
                {agent.verified && (
                  <span
                    className="text-xs font-mono px-1.5 py-0.5 rounded-sm"
                    style={{ color: "#02f8c5", border: "1px solid #02f8c522", background: "#02f8c508" }}
                  >
                    ✓
                  </span>
                )}
              </div>
            </div>

            {/* Legal ID */}
            <p className="data" style={{ color: "#777" }}>
              {agent.legal_entity_id}
            </p>

            {/* Description */}
            <p className="text-xs leading-relaxed" style={{ color: "#aaa" }}>
              {agent.description}
            </p>

            {/* Capabilities */}
            <div className="flex flex-wrap gap-1.5">
              {agent.capabilities.slice(0, 3).map((c) => (
                <CapabilityTag key={c.method} method={c.method} />
              ))}
            </div>

            {/* Compliance */}
            <div className="flex flex-wrap gap-1.5">
              {agent.compliance.map((c) => (
                <ComplianceBadge key={c} label={c} />
              ))}
            </div>

            {/* Power Level bar — Phase 29 */}
            {agent.liquidity_score_sol !== undefined && (
              <PowerLevelBar score={agent.liquidity_score_sol} />
            )}

            {/* Footer */}
            <div
              className="flex items-center justify-between pt-2"
              style={{ borderTop: "1px solid #111" }}
            >
              <p className="data" style={{ color: "#666" }}>
                {agent.endpoint.replace("https://", "")}
              </p>
              <a
                href={`/api/agents?id=${agent.agent_id}`}
                className="text-xs font-mono tracking-widest uppercase card-link"
              >
                VIEW CARD →
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
