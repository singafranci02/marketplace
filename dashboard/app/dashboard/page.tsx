import { redirect } from "next/navigation";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Nav } from "../components/Nav";
import { TerminalDashboard } from "../components/TerminalDashboard";

const DB_PATH = join(process.cwd(), "..", "database.json");
const STALE_MS = 3 * 60 * 1000;

export default async function DashboardPage() {
  // Auth gate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let deals: Parameters<typeof TerminalDashboard>[0]["initialDeals"] = [];
  let licenses: Parameters<typeof TerminalDashboard>[0]["initialLicenses"] = [];
  let vaults: Parameters<typeof TerminalDashboard>[0]["initialVaults"] = [];
  let agents: Parameters<typeof TerminalDashboard>[0]["agents"] = [];
  let intents: Parameters<typeof TerminalDashboard>[0]["initialIntents"] = [];

  if (serviceUrl && serviceKey) {
    const svc = createServiceClient(serviceUrl, serviceKey);

    const [ledgerRes, licenseRes, vaultRes, hbRes, liquidityRes, stakeRes, intentsRes] = await Promise.all([
      svc
        .from("ledger")
        .select("artifact, amount_lamports, on_chain_status, tx_hash, artifact_hash")
        .order("id", { ascending: false })
        .limit(20),
      svc
        .from("ip_licenses")
        .select("id, licensor_agent_id, licensee_agent_id, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      svc.from("ip_vault").select("id, title, agent_id, status").eq("status", "active"),
      svc.from("agent_heartbeats").select("agent_id, last_seen_at"),
      svc
        .from("ledger")
        .select("artifact, amount_lamports")
        .eq("on_chain_status", "VERIFIED_ON_CHAIN")
        .not("amount_lamports", "is", null),
      svc.from("agent_stakes").select("agent_id, lamports_staked"),
      svc
        .from("buyer_intents")
        .select("id, buyer_agent_id, ip_type, max_budget_lamports, description, status, created_at")
        .eq("status", "OPEN")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // Format deals
    deals = (ledgerRes.data ?? []).map((row) => {
      const artifact = row.artifact as Record<string, unknown>;
      const parties  = artifact.parties as {
        licensor?: { company?: string; agent_id?: string };
        licensee?: { company?: string; agent_id?: string };
      } | undefined;
      const terms = artifact.terms as { rev_share_pct?: number } | undefined;
      return {
        artifact_id:     (artifact.artifact_id as string | undefined) ?? "",
        artifact_type:   (artifact.artifact_type as string | undefined) ?? "",
        licensor:        parties?.licensor?.company ?? parties?.licensor?.agent_id ?? "—",
        licensee:        parties?.licensee?.company ?? parties?.licensee?.agent_id ?? "—",
        amount_lamports: row.amount_lamports ? Number(row.amount_lamports) : null,
        on_chain_status: (row.on_chain_status as string | null) ?? "OFF_CHAIN",
        tx_hash:         (row.tx_hash as string | null) ?? null,
        issued_at:       (artifact.issued_at as string | undefined) ?? null,
        rev_share_pct:   terms?.rev_share_pct ?? null,
        artifact_hash:   (row.artifact_hash as string | null) ?? null,
      };
    });

    licenses = (licenseRes.data ?? []).map((l) => ({
      id:                l.id as string,
      licensor_agent_id: (l.licensor_agent_id as string | null) ?? "",
      licensee_agent_id: (l.licensee_agent_id as string | null) ?? "",
      status:            (l.status as string | null) ?? "DRAFT",
      created_at:        (l.created_at as string | null) ?? "",
    }));

    vaults = (vaultRes.data ?? []).map((v) => ({
      id:       v.id as string,
      title:    (v.title as string | null) ?? "Untitled",
      agent_id: (v.agent_id as string | null) ?? "",
      status:   (v.status as string | null) ?? "active",
    }));

    // Build agent annotation maps
    const heartbeatMap: Record<string, string> = {};
    for (const row of hbRes.data ?? []) heartbeatMap[row.agent_id] = row.last_seen_at;

    const liquidityMap: Record<string, number> = {};
    const dealCountMap: Record<string, number> = {};
    for (const row of liquidityRes.data ?? []) {
      const artifact = row.artifact as { parties?: { licensor?: { agent_id?: string } } };
      const sellerId = artifact?.parties?.licensor?.agent_id;
      if (sellerId && row.amount_lamports) {
        liquidityMap[sellerId] = (liquidityMap[sellerId] ?? 0) + Number(row.amount_lamports);
        dealCountMap[sellerId] = (dealCountMap[sellerId] ?? 0) + 1;
      }
    }

    const stakeMap: Record<string, number> = {};
    for (const row of stakeRes.data ?? []) stakeMap[row.agent_id] = Number(row.lamports_staked);

    intents = (intentsRes.data ?? []).map((r) => ({
      id:                  r.id as string,
      buyer_agent_id:      (r.buyer_agent_id as string | null) ?? "",
      ip_type:             (r.ip_type as string | null) ?? null,
      max_budget_lamports: Number(r.max_budget_lamports ?? 0),
      description:         (r.description as string | null) ?? null,
      status:              (r.status as string | null) ?? "OPEN",
      created_at:          (r.created_at as string | null) ?? "",
    }));

    let allAgents: Record<string, unknown>[] = [];
    if (existsSync(DB_PATH)) {
      try { allAgents = JSON.parse(readFileSync(DB_PATH, "utf-8")).agents ?? []; } catch { /* ignore */ }
    }

    const now = Date.now();
    const hasAnyHb = Object.keys(heartbeatMap).length > 0;

    agents = allAgents.map((a) => {
      const agentId  = a["agent_id"] as string;
      const lastSeen = heartbeatMap[agentId];
      const active   = hasAnyHb
        ? (lastSeen ? now - new Date(lastSeen).getTime() < STALE_MS : false)
        : true;

      const v_sol        = (liquidityMap[agentId] ?? 0) / 1e9;
      const staked_lamps = stakeMap[agentId] ?? 0;
      const staked_sol   = staked_lamps / 1e9;
      const w_stake      = Math.min(1.0 + staked_sol / 10.0, 2.0);
      const t_active     = dealCountMap[agentId] ?? 0;
      const score        = v_sol + (t_active * w_stake);

      const agentCompliance = (a["compliance"] as string[]) ?? [];
      let trust_tier: string;
      if (staked_sol > 0) trust_tier = "STAKED";
      else if (v_sol > 0 && (agentCompliance.includes("SOC2-Type2") || agentCompliance.includes("ISO27001"))) trust_tier = "AUDITED";
      else if (agentCompliance.length > 0) trust_tier = "ATTESTED";
      else trust_tier = "UNVERIFIED";

      return {
        agent_id:            agentId,
        name:                (a["name"] as string | null) ?? agentId,
        trust_tier,
        liquidity_score_sol: score.toFixed(4),
        status:              active ? "ACTIVE" : "INACTIVE",
      };
    });
  }

  return (
    <>
      <Nav />
      <TerminalDashboard
        initialDeals={deals}
        agents={agents}
        initialLicenses={licenses}
        initialVaults={vaults}
        initialIntents={intents}
      />
    </>
  );
}
