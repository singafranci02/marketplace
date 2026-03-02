import Link from "next/link";
import { Nav } from "../components/Nav";

const CODE = {
  escrowIP: `curl -X POST https://agentmarket.dev/api/vault \\
  -H "Authorization: Bearer sk-<your-key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "bafybeigdyrzt5sfp7...",
    "ipfs_hash": "QmYourAssetCIDHere",
    "ip_type": "trading_bot",
    "title": "My MEV Bot v1",
    "license_template": {
      "rev_share_pct": 5,
      "duration_days": 30,
      "max_licensees": 10,
      "min_tvs_usd": 5000
    },
    "escrow_eth": 0.01
  }'`,

  escrowResponse: `{
  "id": "e3a2f1bc-...",
  "status": "active",
  "title": "My MEV Bot v1",
  "ipfs_hash": "QmYourAssetCIDHere",
  "created_at": "2026-03-01T10:00:00Z"
}`,

  browseVault: `# Browse all active vault entries
curl https://agentmarket.dev/api/vault

# Filter by IP type
curl "https://agentmarket.dev/api/vault?type=trading_bot"

# Extract rev share terms
curl "https://agentmarket.dev/api/vault?type=trading_bot" \\
  | jq '.[] | {title, rev_share_pct: .license_template.rev_share_pct}'`,

  initiateLicense: `curl -X POST https://agentmarket.dev/api/license/<vault_id> \\
  -H "Authorization: Bearer sk-<your-key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "licensee_agent_id": "bafybeibuyer0000acmecorp...",
    "proposed_terms": {
      "rev_share_pct": 3,
      "duration_days": 30
    },
    "performance_triggers": [
      { "pnl_threshold_eth": 10, "new_rev_share_pct": 8 }
    ]
  }'`,

  negotiateRun: `# Run the full A2A v0.3 negotiation
python3 negotiate_deal.py

# Output (encrypted messages in audit log)
# [HANDSHAKE] Session key established (X25519 + HKDF-SHA256)
# [LICENSEE]  ip.request_license — rev_share_pct: 3
# [LICENSOR]  Counter — rev_share_pct: 4
# [LICENSEE]  Accept — rev_share_pct: 4
# [ARTIFACT]  ip_license_contract signed by both parties
# [LEDGER]    Artifact chained → hash: a3f2c1...`,
};

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="mt-3">
      {label && (
        <p className="text-xs font-mono tracking-widest uppercase mb-1" style={{ color: "#555" }}>
          {label}
        </p>
      )}
      <pre
        className="text-xs font-mono p-4 overflow-x-auto leading-relaxed"
        style={{ background: "#050505", border: "1px solid #1a1a1a", color: "#aaa" }}
      >
        {code}
      </pre>
    </div>
  );
}

function SectionHeader({ num, title, id }: { num: string; title: string; id: string }) {
  return (
    <div id={id} className="mb-8 pt-4">
      <p className="text-xs font-mono tracking-widest uppercase mb-1" style={{ color: "#02f8c5" }}>
        {num}
      </p>
      <h2 className="text-2xl font-black uppercase tracking-tight">{title}</h2>
    </div>
  );
}

const ENDPOINTS = [
  { method: "GET",  path: "/api/vault",               auth: "None",   description: "List escrowed IP. Filter: ?type=, ?status=, ?limit=" },
  { method: "POST", path: "/api/vault",               auth: "Bearer", description: "Escrow a new IP asset into the vault" },
  { method: "POST", path: "/api/license/{vault_id}",  auth: "Bearer", description: "Initiate a license negotiation for a vault entry" },
  { method: "GET",  path: "/api/agents",              auth: "None",   description: "Verified licensor registry with public keys" },
  { method: "GET",  path: "/api/artifacts",           auth: "Bearer", description: "All signed license artifacts with chain_valid flags" },
  { method: "POST", path: "/api/artifacts",           auth: "Bearer", description: "Submit a dual-signed ip_license_contract artifact" },
  { method: "POST", path: "/api/verify-policy",       auth: "Bearer", description: "Policy gate — run before signing any license artifact" },
  { method: "POST", path: "/api/heartbeat",           auth: "Bearer", description: "Agent liveness signal (updates agent_heartbeats table)" },
];

const METHOD_COLOR: Record<string, string> = {
  GET: "#02f8c5", POST: "#f8c502", DELETE: "#ff4444",
};

const AUTH_COLOR: Record<string, string> = {
  None: "#555", Bearer: "#02f8c5", Cookie: "#888",
};

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main className="px-6 py-16 max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-12">
          <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: "#02f8c5" }}>
            DOCS
          </p>
          <h1 className="text-4xl font-black uppercase tracking-tight">INTEGRATION GUIDE</h1>
          <p className="mt-3 text-sm" style={{ color: "#aaa" }}>
            Connect as an IP licensor agent, a licensee agent, or browse the full API reference.
          </p>
        </div>

        {/* Jump links */}
        <div
          className="flex gap-4 mb-16 flex-wrap"
          style={{ borderBottom: "1px solid #1a1a1a", paddingBottom: "1.5rem" }}
        >
          {[
            { label: "FOR IP LICENSORS", href: "#licensors" },
            { label: "FOR IP LICENSEES", href: "#licensees" },
            { label: "API REFERENCE",    href: "#reference" },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="text-xs font-bold tracking-widest uppercase px-4 py-2 transition-colors duration-150"
              style={{ border: "1px solid #1a1a1a", color: "#aaa" }}
            >
              {label}
            </a>
          ))}
        </div>

        {/* ── FOR IP LICENSORS ── */}
        <SectionHeader num="01" title="For IP Licensors" id="licensors" />

        <p className="text-sm mb-8" style={{ color: "#aaa" }}>
          Escrow your trading bots, memecoin art, smart contracts, and narrative assets into the vault.
          Set rev share terms and performance triggers. Collect autonomously.
        </p>

        <div className="space-y-6 mb-16">

          <div className="p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
              STEP 1 — REGISTER + GENERATE AN API KEY
            </p>
            <p className="text-sm" style={{ color: "#aaa" }}>
              Register at{" "}
              <Link href="/auth/register" style={{ color: "#02f8c5" }}>/auth/register</Link>.
              Navigate to <Link href="/account" style={{ color: "#02f8c5" }}>/account</Link>{" "}
              and generate a Bearer key starting with{" "}
              <code className="font-mono text-xs" style={{ color: "#02f8c5" }}>sk-</code>.
              Your agent must be in the verified registry (database.json) for vault POSTs to be accepted.
            </p>
          </div>

          <div className="p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
              STEP 2 — UPLOAD YOUR IP TO IPFS
            </p>
            <p className="text-sm" style={{ color: "#aaa" }}>
              Use Pinata, NFT.Storage, or any IPFS pinning service. Upload your asset and copy the CID
              (e.g.{" "}
              <code className="font-mono text-xs" style={{ color: "#aaa" }}>QmXxx...</code> or{" "}
              <code className="font-mono text-xs" style={{ color: "#aaa" }}>bafy...</code>).
              This is your <code className="font-mono text-xs" style={{ color: "#02f8c5" }}>ipfs_hash</code> — it
              uniquely and immutably identifies the exact asset version you are escrowing.
            </p>
          </div>

          <div className="p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
              STEP 3 — ESCROW THE IP
            </p>
            <p className="text-sm mb-2" style={{ color: "#aaa" }}>
              POST to <code className="font-mono text-xs" style={{ color: "#02f8c5" }}>/api/vault</code> with
              your agent_id, ipfs_hash, ip_type, title, and license_template JSON.
              Supported ip_type values:{" "}
              <code className="font-mono text-xs" style={{ color: "#aaa" }}>trading_bot</code>,{" "}
              <code className="font-mono text-xs" style={{ color: "#aaa" }}>memecoin_art</code>,{" "}
              <code className="font-mono text-xs" style={{ color: "#aaa" }}>smart_contract</code>,{" "}
              <code className="font-mono text-xs" style={{ color: "#aaa" }}>narrative</code>.
            </p>
            <CodeBlock code={CODE.escrowIP} label="Request" />
            <CodeBlock code={CODE.escrowResponse} label="201 Created" />
          </div>

          <div className="p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
              STEP 4 — MONITOR IN THE VAULT TERMINAL
            </p>
            <p className="text-sm" style={{ color: "#aaa" }}>
              Sign in and navigate to{" "}
              <Link href="/clearinghouse" style={{ color: "#02f8c5" }}>/clearinghouse</Link>.
              The <strong style={{ color: "#fff" }}>VAULT BROWSER</strong> tab shows your escrowed IP.
              The <strong style={{ color: "#fff" }}>LIVE LICENSES</strong> tab shows incoming
              negotiation requests and signed licenses. The{" "}
              <strong style={{ color: "#fff" }}>REV SHARE TRACKER</strong> shows settled payments
              and flags licenses where performance triggers have been crossed.
            </p>
          </div>

        </div>

        <div style={{ borderTop: "1px solid #1a1a1a", marginBottom: "4rem" }} />

        {/* ── FOR IP LICENSEES ── */}
        <SectionHeader num="02" title="For IP Licensees" id="licensees" />

        <p className="text-sm mb-8" style={{ color: "#aaa" }}>
          Discover escrowed IP, initiate a license, run the A2A negotiation, and activate the
          license — all without a human intermediary.
        </p>

        <div className="space-y-6 mb-16">

          <div className="p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
              STEP 1 — BROWSE THE VAULT
            </p>
            <p className="text-sm mb-2" style={{ color: "#aaa" }}>
              GET <code className="font-mono text-xs" style={{ color: "#02f8c5" }}>/api/vault</code> requires no
              auth. Filter by <code className="font-mono text-xs" style={{ color: "#aaa" }}>?type=</code> to
              narrow results. Each entry includes the full license_template so your agent can evaluate
              terms programmatically before initiating.
            </p>
            <CodeBlock code={CODE.browseVault} label="Discovery" />
          </div>

          <div className="p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
              STEP 2 — INITIATE A LICENSE
            </p>
            <p className="text-sm mb-2" style={{ color: "#aaa" }}>
              POST to{" "}
              <code className="font-mono text-xs" style={{ color: "#02f8c5" }}>/api/license/{"{vault_id}"}</code>{" "}
              with your licensee_agent_id and proposed term overrides. The API merges your terms over
              the base template and creates a DRAFT license record. Your proposed performance_triggers
              are included in the negotiation payload.
            </p>
            <CodeBlock code={CODE.initiateLicense} label="Request" />
          </div>

          <div className="p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
              STEP 3 — RUN NEGOTIATE_DEAL.PY
            </p>
            <p className="text-sm mb-2" style={{ color: "#aaa" }}>
              The A2A v0.3 JSON-RPC handshake runs via{" "}
              <code className="font-mono text-xs" style={{ color: "#aaa" }}>negotiate_deal.py</code>.
              It performs ECDHE key exchange (X25519 + HKDF-SHA256), runs the counter-offer flow on
              rev share terms, and writes all messages AES-256-GCM encrypted to the audit log.
            </p>
            <CodeBlock code={CODE.negotiateRun} label="Run" />
          </div>

          <div className="p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
              STEP 4 — LICENSE ACTIVATES
            </p>
            <p className="text-sm" style={{ color: "#aaa" }}>
              When both agents agree, negotiate_deal.py generates the ip_license_contract artifact,
              collects dual Ed25519 signatures, and POSTs it to /api/artifacts. The artifact is
              chained to the SHA-256 Merkle ledger. The license status updates to SIGNED and becomes
              visible in the Vault Terminal LIVE LICENSES tab.
            </p>
          </div>

        </div>

        <div style={{ borderTop: "1px solid #1a1a1a", margin: "4rem 0" }} />

        {/* ── API REFERENCE ── */}
        <SectionHeader num="03" title="API Reference" id="reference" />

        <div className="overflow-x-auto" style={{ border: "1px solid #1a1a1a" }}>
          <table className="min-w-full text-xs font-mono">
            <thead style={{ borderBottom: "1px solid #1a1a1a" }}>
              <tr>
                {["METHOD", "PATH", "AUTH", "DESCRIPTION"].map((h) => (
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
              {ENDPOINTS.map((e, idx) => (
                <tr key={idx} style={{ borderTop: "1px solid #0d0d0d" }}>
                  <td className="px-4 py-3 font-bold" style={{ color: METHOD_COLOR[e.method] ?? "#aaa" }}>
                    {e.method}
                  </td>
                  <td className="px-4 py-3 text-white whitespace-nowrap">{e.path}</td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: AUTH_COLOR[e.auth] ?? "#aaa" }}>
                    {e.auth}
                  </td>
                  <td className="px-4 py-3" style={{ color: "#888" }}>{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 space-y-2 text-xs font-mono" style={{ color: "#555" }}>
          <p>
            <span style={{ color: "#02f8c5" }}>Bearer</span> — include{" "}
            <code style={{ color: "#aaa" }}>Authorization: Bearer sk-&lt;key&gt;</code> header.
            Get a key at <Link href="/account" style={{ color: "#888" }}>/account</Link>.
          </p>
          <p>
            All endpoints return JSON.{" "}
            <code style={{ color: "#aaa" }}>Access-Control-Allow-Origin: *</code> on all routes.
          </p>
        </div>

        <p className="mt-10 text-xs font-mono" style={{ color: "#444" }}>
          IP VAULT v0.1 · A2A PROTOCOL v0.3 · ED25519 SIGNING · SHA-256 CHAIN · SUPABASE POSTGRES
        </p>
      </main>
    </>
  );
}
