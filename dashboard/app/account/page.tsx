import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "../components/Nav";
import { ApiKeyManager } from "../components/ApiKeyManager";
import { getSolBalance } from "@/lib/solana";

const ACCENT = "#02f8c5";
const DIM    = "#555";

const TIER_COLOR: Record<string, string> = {
  STAKED:     "#f8c502",
  AUDITED:    "#02f8c5",
  ATTESTED:   "#888",
  UNVERIFIED: "#444",
};

function trustTier(compliance: string[], staked_sol: number, earned_sol: number): string {
  if (staked_sol > 0) return "STAKED";
  if (earned_sol > 0 && (compliance.includes("SOC2-Type2") || compliance.includes("ISO27001"))) return "AUDITED";
  if (compliance.length > 0) return "ATTESTED";
  return "UNVERIFIED";
}

function shortPubkey(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  // ── Portfolio data ────────────────────────────────────────────────────────
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  type AgentRow = {
    agent_id:     string;
    name:         string;
    solana_pubkey: string | null;
    compliance:   string[];
    joined_at:    string;
  };

  type AgentCard = AgentRow & {
    live_sol:    string;
    earned_sol:  number;
    staked_sol:  number;
    tier:        string;
  };

  let agentCards: AgentCard[] = [];

  if (serviceUrl && serviceKey) {
    const svc = createServiceClient(serviceUrl, serviceKey);

    const [agentsRes, dealsRes, stakesRes] = await Promise.all([
      svc
        .from("registered_agents")
        .select("agent_id, name, solana_pubkey, compliance, joined_at")
        .eq("user_id", user.id)
        .eq("status", "active"),
      svc
        .from("ledger")
        .select("artifact, amount_lamports")
        .eq("on_chain_status", "VERIFIED_ON_CHAIN")
        .not("amount_lamports", "is", null),
      svc.from("agent_stakes").select("agent_id, lamports_staked"),
    ]);

    const myAgents = (agentsRes.data ?? []) as AgentRow[];

    // Build lookup maps
    const earnedMap: Record<string, number> = {};
    for (const row of dealsRes.data ?? []) {
      const art     = row.artifact as { parties?: { licensor?: { agent_id?: string } } };
      const sellerId = art?.parties?.licensor?.agent_id;
      if (sellerId && row.amount_lamports) {
        earnedMap[sellerId] = (earnedMap[sellerId] ?? 0) + Number(row.amount_lamports);
      }
    }

    const stakeMap: Record<string, number> = {};
    for (const row of stakesRes.data ?? []) stakeMap[row.agent_id] = Number(row.lamports_staked);

    // Fetch live SOL balances in parallel
    const balances = await Promise.all(
      myAgents.map((a) => (a.solana_pubkey ? getSolBalance(a.solana_pubkey) : Promise.resolve("0.0000")))
    );

    agentCards = myAgents.map((a, i) => {
      const earned_sol = (earnedMap[a.agent_id] ?? 0) / 1e9;
      const staked_sol = (stakeMap[a.agent_id] ?? 0) / 1e9;
      return {
        ...a,
        live_sol:   balances[i],
        earned_sol,
        staked_sol,
        tier: trustTier(a.compliance ?? [], staked_sol, earned_sol),
      };
    });
  }

  return (
    <>
      <Nav />
      <main className="px-6 py-16 max-w-3xl mx-auto" style={{ fontFamily: "monospace" }}>

        {/* Header */}
        <div className="mb-10">
          <p className="text-xs tracking-widest uppercase mb-2" style={{ color: ACCENT }}>
            ACCOUNT
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tight">API KEYS</h1>
          <p className="mt-2 text-sm" style={{ color: "#aaa" }}>{user.email}</p>
        </div>

        {/* Description */}
        <div className="mb-8 p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
            VAULT AGENT AUTHENTICATION
          </p>
          <p className="text-sm" style={{ color: "#aaa" }}>
            Generate an API key for your IP licensor or licensee agent. Required to escrow IP
            assets, initiate license negotiations, and submit signed artifacts to the ledger. Include
            it in the{" "}
            <code className="text-xs" style={{ color: ACCENT }}>Authorization</code>{" "}
            header on all protected vault endpoints.
          </p>
          <p className="mt-3 text-xs" style={{ color: "#666" }}>
            Authorization: Bearer sk-&lt;your-key&gt;
          </p>
        </div>

        <ApiKeyManager initialKeys={apiKeys ?? []} />

        <p className="mt-8 text-xs" style={{ color: "#444" }}>
          KEYS ARE HASHED WITH SHA-256 · SHOWN ONCE AT CREATION · CANNOT BE RECOVERED
        </p>

        {/* ── MY AGENTS / PORTFOLIO ─────────────────────────────────────────── */}
        <div style={{ marginTop: 48 }}>
          <p className="text-xs tracking-widest uppercase mb-1" style={{ color: ACCENT }}>
            MY AGENTS
          </p>
          <h2 className="text-xl font-black uppercase tracking-tight mb-6">PORTFOLIO</h2>

          {agentCards.length === 0 ? (
            <div className="p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
              <p className="text-sm" style={{ color: "#888" }}>
                No agents registered yet.
              </p>
              <p className="mt-3 text-xs" style={{ color: DIM }}>
                Register your first agent to start selling IP:
              </p>
              <div className="mt-3 flex gap-4">
                <Link
                  href="/sell"
                  style={{
                    display:       "inline-block",
                    fontSize:      11,
                    fontWeight:    700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color:         ACCENT,
                    border:        `1px solid ${ACCENT}33`,
                    padding:       "7px 14px",
                    textDecoration: "none",
                  }}
                >
                  VIEW ONBOARDING GUIDE →
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {agentCards.map((agent) => (
                <div
                  key={agent.agent_id}
                  style={{ border: "1px solid #1a1a1a", background: "#030303", padding: "20px 24px" }}
                >
                  {/* Agent name + tier */}
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ color: ACCENT, fontSize: 11 }}>◈</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {agent.name}
                      </span>
                      <span style={{ fontSize: 10, color: "#555" }}>
                        {agent.agent_id}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: TIER_COLOR[agent.tier] ?? "#555" }}>
                      {agent.tier}
                    </span>
                  </div>

                  {/* Metrics grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 24px", marginBottom: 14 }}>
                    {[
                      ["LIVE BALANCE",    `${agent.live_sol} SOL`],
                      ["EARNED (SETTLED)", `${agent.earned_sol.toFixed(4)} SOL`],
                      ["STAKED",          `${agent.staked_sol.toFixed(4)} SOL`],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc" }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Wallet row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>WALLET</span>
                    {agent.solana_pubkey ? (
                      <>
                        <span style={{ fontSize: 11, color: "#888" }}>
                          {shortPubkey(agent.solana_pubkey)}
                        </span>
                        <a
                          href={`https://explorer.solana.com/address/${agent.solana_pubkey}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize:      10,
                            fontWeight:    700,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color:         ACCENT,
                            textDecoration: "none",
                          }}
                        >
                          VIEW ON EXPLORER →
                        </a>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: DIM }}>—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs" style={{ color: "#444" }}>
          BALANCES SHOWN FROM SOLANA DEVNET · SETTLEMENT: AES-256 + Ed25519 + SOLANA
        </p>
      </main>
    </>
  );
}
