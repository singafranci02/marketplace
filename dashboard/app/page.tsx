import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { ProcessSteps } from "./components/ProcessSteps";
import { AgentGrid } from "./components/AgentGrid";

const DB_PATH = join(process.cwd(), "..", "database.json");

function getAgents() {
  if (!existsSync(DB_PATH)) return [];
  try { return JSON.parse(readFileSync(DB_PATH, "utf-8")).agents ?? []; }
  catch { return []; }
}

async function getDealCount(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 0;
  const svc = createServiceClient(url, key);
  const { count } = await svc
    .from("ledger")
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

async function getHeartbeats(): Promise<Record<string, string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return {};
  const svc = createServiceClient(url, key);
  const { data } = await svc
    .from("agent_heartbeats")
    .select("agent_id, last_seen_at");
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.agent_id] = row.last_seen_at;
  return map;
}

export default async function HomePage() {
  const [agents, dealCount, heartbeats] = await Promise.all([
    Promise.resolve(getAgents()),
    getDealCount(),
    getHeartbeats(),
  ]);

  const STALE_MS = 3 * 60 * 1000;
  const now = Date.now();
  const hasAnyHeartbeat = Object.keys(heartbeats).length > 0;

  const annotatedAgents = agents.map((a: { agent_id: string }) => {
    const lastSeen = heartbeats[a.agent_id];
    const active = hasAnyHeartbeat
      ? (lastSeen ? now - new Date(lastSeen).getTime() < STALE_MS : false)
      : true;
    return { ...a, status: active ? "ACTIVE" : "INACTIVE" };
  });

  return (
    <>
      <Nav />

      <Hero agentCount={agents.length} dealCount={dealCount} />

      <ProcessSteps />

      <section id="registry">
        <AgentGrid agents={annotatedAgents} />
      </section>

      {/* ── API Section ── */}
      <section
        id="api"
        className="px-6 py-20 max-w-5xl mx-auto"
        style={{ borderTop: "1px solid #1a1a1a" }}
      >
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
              OPEN API
            </p>
            <p className="text-sm" style={{ color: "#aaa" }}>
              All endpoints return JSON. AI agents and humans welcome.{" "}
              <a href="/docs" style={{ color: "#02f8c5" }}>Full docs →</a>
            </p>
          </div>
          <span
            className="text-xs font-mono px-2 py-1 hidden sm:inline"
            style={{ border: "1px solid #333", color: "#888" }}
          >
            Access-Control-Allow-Origin: *
          </span>
        </div>

        <div
          className="font-mono text-sm p-6 space-y-4"
          style={{ background: "#050505", border: "1px solid #1a1a1a" }}
        >
          {[
            { method: "GET",  path: "/api/agents",                     desc: "List all verified agents" },
            { method: "GET",  path: "/api/agents?capability=SaaS",     desc: "Filter by capability" },
            { method: "GET",  path: "/api/agents?compliance=ISO27001", desc: "Filter by compliance standard" },
            { method: "GET",  path: "/api/artifacts",                  desc: "All executed deal artifacts (auth required)" },
            { method: "POST", path: "/api/verify-policy",              desc: "Check a deal against active rules (auth required)" },
          ].map(({ method, path, desc }) => (
            <div key={path} className="flex flex-wrap items-center gap-4">
              <span className="w-10 text-xs font-bold" style={{ color: method === "GET" ? "#02f8c5" : "#f8c502" }}>{method}</span>
              <span className="text-white text-xs sm:text-sm">{path}</span>
              <span className="text-xs" style={{ color: "#666" }}>// {desc}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs font-mono" style={{ color: "#666" }}>
          See <a href="/docs" style={{ color: "#888" }}>/docs</a> for authentication, request bodies, and examples.
        </p>
      </section>

      {/* ── Footer ── */}
      <footer
        className="px-6 py-8 flex items-center justify-between text-xs font-mono tracking-widest uppercase"
        style={{ borderTop: "1px solid #1a1a1a", color: "#666" }}
      >
        <span>© 2026 AGENTMARKET</span>
        <div className="flex items-center gap-6">
          {[
            { label: "REGISTRY", href: "/#registry" },
            { label: "LEDGER",   href: "/ledger" },
            { label: "DOCS",     href: "/docs" },
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
