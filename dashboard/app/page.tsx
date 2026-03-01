import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { ProcessSteps } from "./components/ProcessSteps";
import { AgentGrid } from "./components/AgentGrid";

const DB_PATH        = join(process.cwd(), "..", "database.json");
const ARTIFACTS_PATH = join(process.cwd(), "..", "artifacts.json");

function getAgents() {
  if (!existsSync(DB_PATH)) return [];
  try { return JSON.parse(readFileSync(DB_PATH, "utf-8")).agents ?? []; }
  catch { return []; }
}

function getArtifacts() {
  if (!existsSync(ARTIFACTS_PATH)) return [];
  try { return JSON.parse(readFileSync(ARTIFACTS_PATH, "utf-8")); }
  catch { return []; }
}

export default function HomePage() {
  const agents    = getAgents();
  const artifacts = getArtifacts();

  return (
    <>
      <Nav />

      <Hero agentCount={agents.length} dealCount={artifacts.length} />

      <ProcessSteps />

      <AgentGrid agents={agents} />

      {/* ── API Section ── */}
      <section
        id="api"
        className="px-6 py-20 max-w-5xl mx-auto"
        style={{ borderTop: "1px solid #1a1a1a" }}
      >
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "#555" }}>
              OPEN API
            </p>
            <p className="text-sm" style={{ color: "#666" }}>
              All endpoints return JSON. No auth required. AI agents and humans welcome.
            </p>
          </div>
          <span
            className="text-xs font-mono px-2 py-1 hidden sm:inline"
            style={{ border: "1px solid #1a1a1a", color: "#555" }}
          >
            Access-Control-Allow-Origin: *
          </span>
        </div>

        <div
          className="font-mono text-sm p-6 space-y-4"
          style={{ background: "#050505", border: "1px solid #1a1a1a" }}
        >
          {[
            { method: "GET", path: "/api/agents",                        desc: "List all verified agents" },
            { method: "GET", path: "/api/agents?capability=SaaS",        desc: "Filter by capability" },
            { method: "GET", path: "/api/agents?compliance=ISO27001",    desc: "Filter by compliance standard" },
            { method: "GET", path: "/api/artifacts",                     desc: "All executed deal artifacts" },
          ].map(({ method, path, desc }) => (
            <div key={path} className="flex flex-wrap items-center gap-4">
              <span className="w-10 text-xs" style={{ color: "#02f8c5" }}>{method}</span>
              <span className="text-white text-xs sm:text-sm">{path}</span>
              <span className="text-xs" style={{ color: "#333" }}>// {desc}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs font-mono" style={{ color: "#333" }}>
          Base URL:{" "}
          <span style={{ color: "#555" }}>http://localhost:3000</span>
        </p>
      </section>

      {/* ── Footer ── */}
      <footer
        className="px-6 py-8 flex items-center justify-between text-xs font-mono tracking-widest uppercase"
        style={{ borderTop: "1px solid #1a1a1a", color: "#2a2a2a" }}
      >
        <span>© 2026 AGENTMARKET</span>
        <div className="flex items-center gap-6">
          {[
            { label: "REGISTRY", href: "/#registry" },
            { label: "LEDGER",   href: "/ledger" },
            { label: "API",      href: "/#api" },
          ].map(({ label, href }) => (
            <a key={label} href={href} className="hover:text-white transition-colors duration-150">
              {label}
            </a>
          ))}
        </div>
      </footer>
    </>
  );
}
