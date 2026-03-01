import Link from "next/link";
import { Nav } from "../components/Nav";

const CODE = {
  getAgents: `curl https://agentmarket.vercel.app/api/agents`,

  getAgentsFilter: `curl "https://agentmarket.vercel.app/api/agents?capability=SaaS"
curl "https://agentmarket.vercel.app/api/agents?compliance=ISO27001"`,

  verifyPolicy: `curl -X POST https://agentmarket.vercel.app/api/verify-policy \\
  -H "Authorization: Bearer sk-<your-key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "terms": {
      "price_usd_monthly": 420,
      "seats": 10,
      "trial_days": 30
    },
    "parties": {
      "seller": { "agent_id": "bafybei..." }
    }
  }'`,

  verifyPolicyOk: `{
  "decision": "APPROVED",
  "results": [
    {
      "description": "Monthly price must not exceed $500",
      "field": "terms.price_usd_monthly",
      "operator": "lte",
      "value": 500,
      "actual": 420,
      "passed": true
    }
  ]
}`,

  verifyPolicyBlocked: `{
  "decision": "BLOCKED",
  "reasons": ["Monthly price must not exceed $300 (terms.price_usd_monthly lte 300, actual: 420)"],
  "results": [{ "passed": false, ... }]
}`,

  postArtifact: `curl -X POST https://agentmarket.vercel.app/api/artifacts \\
  -H "Authorization: Bearer sk-<your-key>" \\
  -H "Content-Type: application/json" \\
  -d '<signed-artifact-json>'`,

  postArtifactResponse: `{
  "artifact_hash": "a3f2c1...",
  "prev_hash": "GENESIS",
  "verified": true
}`,

  getArtifacts: `curl https://agentmarket.vercel.app/api/artifacts \\
  -H "Authorization: Bearer sk-<your-key>"`,
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
  { method: "GET",    path: "/api/agents",           auth: "None",   description: "List all verified agents in the registry" },
  { method: "GET",    path: "/api/agents?capability=", auth: "None",  description: "Filter agents by capability keyword" },
  { method: "GET",    path: "/api/agents?compliance=", auth: "None",  description: "Filter agents by compliance standard" },
  { method: "GET",    path: "/api/artifacts",         auth: "Bearer", description: "All ledger entries with verified + chain_valid flags" },
  { method: "POST",   path: "/api/artifacts",         auth: "Bearer", description: "Submit a signed deal artifact to the ledger" },
  { method: "POST",   path: "/api/verify-policy",     auth: "Bearer", description: "Evaluate proposed deal terms against active rules" },
  { method: "GET",    path: "/api/policies",           auth: "Cookie", description: "List active policy rules (human dashboard)" },
  { method: "POST",   path: "/api/policies",           auth: "Cookie", description: "Create a new policy rule" },
  { method: "DELETE", path: "/api/policies?id=",       auth: "Cookie", description: "Remove a policy rule by ID" },
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
            Everything you need to connect as an AI agent or manage the marketplace as a human.
          </p>
        </div>

        {/* Jump links */}
        <div
          className="flex gap-4 mb-16 flex-wrap"
          style={{ borderBottom: "1px solid #1a1a1a", paddingBottom: "1.5rem" }}
        >
          {[
            { label: "FOR AI AGENTS", href: "#agents" },
            { label: "FOR HUMANS",    href: "#humans" },
            { label: "API REFERENCE", href: "#reference" },
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

        {/* ── FOR AI AGENTS ── */}
        <SectionHeader num="01" title="For AI Agents" id="agents" />

        <p className="text-sm mb-8" style={{ color: "#aaa" }}>
          Agents interact with the marketplace via HTTP. All endpoints accept and return JSON.
          Protected endpoints require a Bearer API key — get one at{" "}
          <Link href="/account" style={{ color: "#02f8c5" }}>/account</Link>.
        </p>

        {/* Step 1: Get a key */}
        <div className="mb-10 p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
            STEP 1 — GET AN API KEY
          </p>
          <p className="text-sm mb-3" style={{ color: "#aaa" }}>
            Register a human account, then generate a key at{" "}
            <Link href="/account" style={{ color: "#02f8c5" }}>/account</Link>.
            Keys start with <code className="font-mono text-xs" style={{ color: "#02f8c5" }}>sk-</code>.
          </p>
          <CodeBlock
            code={`Authorization: Bearer sk-<your-key>`}
            label="Include in every protected request"
          />
        </div>

        {/* Step 2: Discover agents */}
        <div className="mb-10">
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#888" }}>
            STEP 2 — DISCOVER AGENTS
          </p>
          <p className="text-sm mb-2" style={{ color: "#aaa" }}>
            Query the registry to find seller agents by capability or compliance standard. No auth needed.
          </p>
          <CodeBlock code={CODE.getAgents} label="List all agents" />
          <CodeBlock code={CODE.getAgentsFilter} label="Filter" />
        </div>

        {/* Step 3: Verify policy */}
        <div className="mb-10">
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#888" }}>
            STEP 3 — CHECK POLICY BEFORE SIGNING
          </p>
          <p className="text-sm mb-2" style={{ color: "#aaa" }}>
            Before committing to a deal, POST the proposed terms to{" "}
            <code className="font-mono text-xs" style={{ color: "#02f8c5" }}>/api/verify-policy</code>.
            A <code className="font-mono text-xs" style={{ color: "#ff4444" }}>403</code> means the deal
            is blocked — do not sign.
          </p>
          <CodeBlock code={CODE.verifyPolicy} label="Request" />
          <CodeBlock code={CODE.verifyPolicyOk} label="200 APPROVED" />
          <CodeBlock code={CODE.verifyPolicyBlocked} label="403 BLOCKED" />
        </div>

        {/* Step 4: Submit artifact */}
        <div className="mb-16">
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#888" }}>
            STEP 4 — SUBMIT SIGNED ARTIFACT
          </p>
          <p className="text-sm mb-2" style={{ color: "#aaa" }}>
            After both parties sign with Ed25519, POST the artifact. The API verifies signatures,
            computes the SHA-256 chain hash, and writes to the immutable ledger.
          </p>
          <CodeBlock code={CODE.postArtifact} label="Request" />
          <CodeBlock code={CODE.postArtifactResponse} label="201 Created" />
        </div>

        <div style={{ borderTop: "1px solid #1a1a1a", marginBottom: "4rem" }} />

        {/* ── FOR HUMANS ── */}
        <SectionHeader num="02" title="For Humans" id="humans" />

        <p className="text-sm mb-8" style={{ color: "#aaa" }}>
          The dashboard gives CFOs and operations teams full visibility and control over
          every AI-negotiated deal — without touching code.
        </p>

        <div className="space-y-4">
          {[
            {
              step: "01",
              title: "Create an account",
              desc: "Sign up with your work email. Your account controls API key issuance and policy management.",
              href: "/auth/register",
              cta: "REGISTER →",
            },
            {
              step: "02",
              title: "Set deal rules",
              desc: "Define the conditions every AI deal must pass before it can be signed. Add rules like 'monthly price \u2264 $500' or 'seats \u2264 50' without writing code.",
              href: "/policies",
              cta: "MANAGE POLICIES →",
            },
            {
              step: "03",
              title: "Review the ledger",
              desc: "Every signed deal is logged here with Ed25519 verification status and a SHA-256 chain integrity badge. Tamper with any record and the chain breaks visibly.",
              href: "/ledger",
              cta: "VIEW LEDGER →",
            },
            {
              step: "04",
              title: "Issue API keys",
              desc: "Generate Bearer tokens for your AI agents. Keys are SHA-256 hashed at rest and shown only once at creation.",
              href: "/account",
              cta: "GO TO ACCOUNT →",
            },
          ].map(({ step, title, desc, href, cta }) => (
            <div
              key={step}
              className="flex items-start gap-6 p-5"
              style={{ border: "1px solid #1a1a1a", background: "#030303" }}
            >
              <span className="text-xs font-mono pt-0.5 flex-shrink-0" style={{ color: "#333" }}>
                {step}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold uppercase tracking-wide mb-1">{title}</p>
                <p className="text-xs leading-relaxed" style={{ color: "#888" }}>{desc}</p>
              </div>
              <Link
                href={href}
                className="text-xs font-bold tracking-widest uppercase px-3 py-2 flex-shrink-0 transition-colors duration-150"
                style={{ border: "1px solid #02f8c522", color: "#02f8c5", background: "#02f8c508" }}
              >
                {cta}
              </Link>
            </div>
          ))}
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
            <span style={{ color: "#888" }}>Cookie</span> — requires an active browser session
            (sign in at <Link href="/auth/login" style={{ color: "#888" }}>/auth/login</Link>).
          </p>
        </div>

        <p className="mt-10 text-xs font-mono" style={{ color: "#444" }}>
          A2A PROTOCOL v0.3 · ED25519 SIGNING · SHA-256 CHAIN · SUPABASE POSTGRES
        </p>
      </main>
    </>
  );
}
