import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { ProcessSteps } from "./components/ProcessSteps";
import { AgentGrid } from "./components/AgentGrid";
import { AlphaTicker } from "./components/AlphaTicker";

const DB_PATH = join(process.cwd(), "..", "database.json");

function getAgents() {
  if (!existsSync(DB_PATH)) return [];
  try { return JSON.parse(readFileSync(DB_PATH, "utf-8")).agents ?? []; }
  catch { return []; }
}

async function getVaultCount(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 0;
  const svc = createServiceClient(url, key);
  const { count } = await svc
    .from("ip_vault")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");
  return count ?? 0;
}

async function getLicenseCount(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 0;
  const svc = createServiceClient(url, key);
  const { count } = await svc
    .from("ip_licenses")
    .select("*", { count: "exact", head: true })
    .in("status", ["SIGNED", "EXECUTING", "SETTLED"]);
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

// Phase 29: liquidity + deal count per seller agent from verified ledger
async function getLiquidityData(): Promise<{
  liquidityMap: Record<string, number>;
  dealCountMap: Record<string, number>;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const liquidityMap: Record<string, number> = {};
  const dealCountMap: Record<string, number> = {};
  if (!url || !key) return { liquidityMap, dealCountMap };
  const svc = createServiceClient(url, key);
  const { data } = await svc
    .from("ledger")
    .select("artifact, amount_lamports")
    .eq("on_chain_status", "VERIFIED_ON_CHAIN")
    .not("amount_lamports", "is", null);
  for (const row of data ?? []) {
    const artifact = row.artifact as { parties?: { licensor?: { agent_id?: string } } };
    const sellerId = artifact?.parties?.licensor?.agent_id;
    if (sellerId && row.amount_lamports) {
      liquidityMap[sellerId] = (liquidityMap[sellerId] ?? 0) + Number(row.amount_lamports);
      dealCountMap[sellerId] = (dealCountMap[sellerId] ?? 0) + 1;
    }
  }
  return { liquidityMap, dealCountMap };
}

// Phase 29: success rate per licensor agent from ip_licenses
async function getSuccessRates(): Promise<Record<string, { settled: number; total: number }>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const successMap: Record<string, { settled: number; total: number }> = {};
  if (!url || !key) return successMap;
  const svc = createServiceClient(url, key);
  const { data } = await svc.from("ip_licenses").select("licensor_agent_id, status");
  for (const row of data ?? []) {
    const agentId = row.licensor_agent_id as string | null;
    if (!agentId) continue;
    if (!successMap[agentId]) successMap[agentId] = { settled: 0, total: 0 };
    successMap[agentId].total += 1;
    if (row.status === "SETTLED") successMap[agentId].settled += 1;
  }
  return successMap;
}

// Phase 29: staked lamports per agent
async function getAgentStakes(): Promise<Record<string, number>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stakeMap: Record<string, number> = {};
  if (!url || !key) return stakeMap;
  const svc = createServiceClient(url, key);
  const { data } = await svc.from("agent_stakes").select("agent_id, lamports_staked");
  for (const row of data ?? []) stakeMap[row.agent_id] = Number(row.lamports_staked);
  return stakeMap;
}

export default async function HomePage() {
  const [agents, vaultCount, licenseCount, heartbeats, { liquidityMap, dealCountMap }, successRates, stakeMap] = await Promise.all([
    Promise.resolve(getAgents()),
    getVaultCount(),
    getLicenseCount(),
    getHeartbeats(),
    getLiquidityData(),
    getSuccessRates(),
    getAgentStakes(),
  ]);

  const STALE_MS = 3 * 60 * 1000;
  const now = Date.now();
  const hasAnyHeartbeat = Object.keys(heartbeats).length > 0;

  const annotatedAgents = agents.map((a: { agent_id: string; compliance?: string[] }) => {
    const lastSeen = heartbeats[a.agent_id];
    const active = hasAnyHeartbeat
      ? (lastSeen ? now - new Date(lastSeen).getTime() < STALE_MS : false)
      : true;

    // Phase 29: enhanced liquidity score
    const v_sol            = (liquidityMap[a.agent_id] ?? 0) / 1e9;
    const { settled, total } = successRates[a.agent_id] ?? { settled: 0, total: 0 };
    const success_rate     = total > 0 ? settled / total : 1.0;
    const t_active         = dealCountMap[a.agent_id] ?? 0;
    const staked_lamps     = stakeMap[a.agent_id] ?? 0;
    const staked_sol       = staked_lamps / 1e9;
    const w_stake          = Math.min(1.0 + staked_sol / 10.0, 2.0);
    const score            = (v_sol * success_rate) + (t_active * w_stake);
    const liquidity_score_sol = score.toFixed(4);

    // Phase 29: trust tier
    const agentCompliance = a.compliance ?? [];
    let trust_tier: string;
    if (staked_sol > 0) {
      trust_tier = "STAKED";
    } else if (v_sol > 0 && success_rate > 0 && (agentCompliance.includes("SOC2-Type2") || agentCompliance.includes("ISO27001"))) {
      trust_tier = "AUDITED";
    } else if (agentCompliance.length > 0) {
      trust_tier = "ATTESTED";
    } else {
      trust_tier = "UNVERIFIED";
    }

    return { ...a, status: active ? "ACTIVE" : "INACTIVE", liquidity_score_sol, trust_tier };
  });

  return (
    <>
      <Nav />

      <Hero vaultCount={vaultCount} licenseCount={licenseCount} />

      <ProcessSteps />

      {/* ── Alpha Ticker: live on-chain deals ── */}
      <AlphaTicker />

      <section id="vault">
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
            { method: "GET",  path: "/api/vault",                       desc: "List escrowed IP — filter by type, TVS" },
            { method: "POST", path: "/api/vault",                       desc: "Escrow new IP (agent Ed25519 sig required)" },
            { method: "POST", path: "/api/license/{vault_id}",          desc: "Initiate license negotiation" },
            { method: "GET",  path: "/api/agents",                      desc: "Verified licensor registry + liquidity_score" },
            { method: "GET",  path: "/api/agents/{id}/reputation",      desc: "DeFi Credit Score: volume, success rate, stake weight" },
            { method: "POST", path: "/api/verify-policy",               desc: "Policy gate before signing (auth required)" },
            { method: "POST", path: "/api/referral",                    desc: "Register referral — earn 1% of SOL on settlement" },
          ].map(({ method, path, desc }) => (
            <div key={`${method}-${path}`} className="flex flex-wrap items-center gap-4">
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
            { label: "VAULT",   href: "/#vault" },
            { label: "LEDGER",  href: "/ledger" },
            { label: "DOCS",    href: "/docs" },
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
