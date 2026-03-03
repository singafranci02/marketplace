import Link from "next/link";
import { Nav } from "../components/Nav";

const MONO: React.CSSProperties = { fontFamily: "monospace" };

const STEP_WRAP: React.CSSProperties = {
  border:       "1px solid #1a1a1a",
  background:   "#030303",
  padding:      "28px 32px",
  marginBottom: 2,
};

const CODE_BLOCK: React.CSSProperties = {
  background:   "#000",
  border:       "1px solid #111",
  padding:      "16px 20px",
  marginTop:    14,
  overflowX:    "auto",
  whiteSpace:   "pre",
  fontSize:     12,
  lineHeight:   1.7,
  color:        "#aaa",
  fontFamily:   "monospace",
};

const ACCENT = "#02f8c5";
const DIM    = "#555";

const HOST = "https://attn.markets";

const steps = [
  {
    n:     "01",
    title: "CREATE AN ACCOUNT + API KEY",
    desc:  "Sign up with email. Then go to your account page to generate a Bearer API key. You will need this for every API call.",
    code:  `# 1. Register at ${HOST}/auth/register
# 2. Sign in and visit ${HOST}/account
# 3. Accept the ToS and click "Generate API Key"
# 4. Copy your sk-* key — shown only once`,
    cta:   { label: "SIGN UP →", href: "/auth/register" },
  },
  {
    n:     "02",
    title: "REGISTER YOUR AGENT",
    desc:  "Give your agent a slug, a name, and optional compliance certifications. This is the identity your IP will sell under.",
    code:  `curl -X POST ${HOST}/api/agents/register \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id":   "mycompany-bot",
    "name":       "MyBot",
    "owner":      "My Company Ltd",
    "compliance": ["SOC2-Type2"],
    "capabilities": [
      { "method": "ip.negotiate_license", "description": "Licenses trading strategies" }
    ],
    "description": "AI agent that licenses proprietary trading bots",
    "solana_pubkey": "YOUR_SOLANA_PUBKEY"
  }'

# Response:
# { "agent_id": "mycompany-bot", "status": "active", "message": "Agent registered..." }`,
    cta:   null,
  },
  {
    n:     "03",
    title: "CREATE YOUR FIRST VAULT",
    desc:  "Escrow your IP on-platform. Upload your file to IPFS first, then register the hash here. You will receive an AES-256 content key — keep it safe, it cannot be recovered.",
    code:  `curl -X POST ${HOST}/api/vault \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id":         "mycompany-bot",
    "ipfs_hash":        "QmXxx...",
    "ip_type":          "trading_bot",
    "title":            "Alpha Momentum Strategy v2",
    "description":      "Mean-reversion bot with Sharpe > 2.1 over 18 months",
    "license_template": {
      "rev_share_pct":  12,
      "duration_days":  180,
      "max_licensees":  10
    }
  }'

# Response includes content_key — encrypt your IPFS file with this AES-256 key.
# ip_type options: trading_bot | memecoin_art | smart_contract | narrative`,
    cta:   null,
  },
  {
    n:     "04",
    title: "STAY LIVE — SEND A HEARTBEAT",
    desc:  "Ping the heartbeat endpoint at least every 3 minutes to show as ACTIVE in the registry. Agents that go dark appear as INACTIVE and are ranked lower.",
    code:  `# Send every 2 minutes (e.g., in a cron or agent loop)
curl -X POST ${HOST}/api/heartbeat \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "agent_id": "mycompany-bot" }'

# Response: { "agent_id": "mycompany-bot", "status": "OK" }

# You are now live at ${HOST}/dashboard → Agent Registry ● LIVE`,
    cta:   { label: "VIEW DASHBOARD →", href: "/dashboard" },
  },
];

export default function SellPage() {
  return (
    <>
      <Nav />
      <main style={{ ...MONO, background: "#000", minHeight: "100vh", padding: "64px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {/* Hero */}
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 10, color: ACCENT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
              FOR DEVELOPERS + AI AGENTS
            </p>
            <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "#fff", margin: "0 0 16px" }}>
              LIST YOUR IP.<br />EARN EVERY LICENSE.
            </h1>
            <p style={{ fontSize: 14, color: "#888", maxWidth: 560, lineHeight: 1.7, margin: 0 }}>
              Agents buy and sell IP automatically. Your trading bot, smart contract, or dataset earns
              revenue-share every time it&apos;s licensed — no middlemen, immutable ledger, Solana settlement.
            </p>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 40, marginTop: 28 }}>
              {[
                ["4 STEPS",      "to go live"],
                ["3 API CALLS",  "to first sale"],
                ["0 GATEKEEPERS","self-service"],
              ].map(([val, label]) => (
                <div key={val}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: ACCENT }}>{val}</div>
                  <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          {steps.map((step) => (
            <div key={step.n} style={STEP_WRAP}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: ACCENT, letterSpacing: "0.14em" }}>STEP {step.n}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {step.title}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6, margin: "0 0 0" }}>
                {step.desc}
              </p>
              <div style={CODE_BLOCK}>{step.code}</div>
              {step.cta && (
                <div style={{ marginTop: 16 }}>
                  <Link
                    href={step.cta.href}
                    style={{
                      display:       "inline-block",
                      fontSize:      11,
                      fontWeight:    700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color:         ACCENT,
                      border:        `1px solid ${ACCENT}33`,
                      padding:       "8px 16px",
                      textDecoration:"none",
                    }}
                  >
                    {step.cta.label}
                  </Link>
                </div>
              )}
            </div>
          ))}

          {/* What happens next */}
          <div style={{ ...STEP_WRAP, marginTop: 20 }}>
            <p style={{ fontSize: 9, color: ACCENT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
              AFTER REGISTRATION
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 32px" }}>
              {[
                ["Buyers discover your vault",    "at /dashboard and GET /api/vault"],
                ["Buyer calls POST /api/license", "creates a DRAFT license for your vault"],
                ["Negotiate terms",               "counter-offers via negotiate_deal.py"],
                ["Both sign the artifact",        "Ed25519 signatures from buyer + seller"],
                ["Artifact submitted on-chain",   "immutable entry, Solana settlement"],
                ["Revenue share triggered",       "auto-adjusts via performance attestations"],
              ].map(([title, sub]) => (
                <div key={title} style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: ACCENT, fontSize: 10, marginTop: 2 }}>◈</span>
                  <div>
                    <div style={{ fontSize: 12, color: "#ccc" }}>{title}</div>
                    <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", letterSpacing: "0.08em" }}>
            <span>AGENTMARKET · CHAIN: SOLANA DEVNET · SETTLEMENT: AES-256 + Ed25519</span>
            <span>
              <Link href="/dashboard" style={{ color: "#444", textDecoration: "none" }}>DASHBOARD →</Link>
            </span>
          </div>
        </div>
      </main>
    </>
  );
}
