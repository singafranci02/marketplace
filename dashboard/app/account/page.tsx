import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { Nav } from "../components/Nav";
import { ApiKeyManager } from "../components/ApiKeyManager";
import { SolanaWalletProvider } from "../components/WalletProvider";
import { AccountPortfolio, type AgentCardData } from "../components/AccountPortfolio";
import { WalletAuthGenerator } from "../components/WalletAuthGenerator";
import { getSolBalance } from "@/lib/solana";

const ACCENT = "#02f8c5";
const DIM    = "#555";

function trustTier(compliance: string[], staked_sol: number, earned_sol: number): string {
  if (staked_sol > 0) return "STAKED";
  if (earned_sol > 0 && (compliance.includes("SOC2-Type2") || compliance.includes("ISO27001"))) return "AUDITED";
  if (compliance.length > 0) return "ATTESTED";
  return "UNVERIFIED";
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
    agent_id:      string;
    name:          string;
    solana_pubkey: string | null;
    compliance:    string[];
    joined_at:     string;
  };

  let agentCards: AgentCardData[] = [];

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

    const earnedMap: Record<string, number> = {};
    for (const row of dealsRes.data ?? []) {
      const art      = row.artifact as { parties?: { licensor?: { agent_id?: string } } };
      const sellerId = art?.parties?.licensor?.agent_id;
      if (sellerId && row.amount_lamports) {
        earnedMap[sellerId] = (earnedMap[sellerId] ?? 0) + Number(row.amount_lamports);
      }
    }

    const stakeMap: Record<string, number> = {};
    for (const row of stakesRes.data ?? []) stakeMap[row.agent_id] = Number(row.lamports_staked);

    const balances = await Promise.all(
      myAgents.map((a) => (a.solana_pubkey ? getSolBalance(a.solana_pubkey) : Promise.resolve("0.0000")))
    );

    agentCards = myAgents.map((a, i): AgentCardData => {
      const earned_sol = (earnedMap[a.agent_id] ?? 0) / 1e9;
      const staked_sol = (stakeMap[a.agent_id] ?? 0) / 1e9;
      return {
        ...a,
        compliance:  a.compliance ?? [],
        live_sol:    balances[i],
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

        {/* Agent-Led Auth: generate key by signing a wallet challenge */}
        <div style={{ marginTop: 24, borderTop: "1px solid #111", paddingTop: 20 }}>
          <p style={{ fontSize: 9, color: ACCENT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4, fontFamily: "monospace" }}>
            AGENT-LED AUTH
          </p>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#fff", fontFamily: "monospace", marginBottom: 4 }}>
            GENERATE KEY WITH WALLET
          </p>
          <p style={{ fontSize: 11, color: "#888", fontFamily: "monospace", maxWidth: 480 }}>
            No email required. Sign a one-time cryptographic challenge with your Solana wallet.
            Designed for autonomous agents that onboard without human intervention.
          </p>
          <SolanaWalletProvider>
            <WalletAuthGenerator />
          </SolanaWalletProvider>
        </div>

        <p className="mt-8 text-xs" style={{ color: "#444" }}>
          KEYS ARE HASHED WITH SHA-256 · SHOWN ONCE AT CREATION · CANNOT BE RECOVERED
        </p>

        {/* ── MY AGENTS / PORTFOLIO ─────────────────────────────────────────── */}
        <SolanaWalletProvider>
          <AccountPortfolio agents={agentCards} />
        </SolanaWalletProvider>

        {/* Footer */}
        <p className="mt-8 text-xs" style={{ color: DIM }}>
          BALANCES SHOWN FROM SOLANA DEVNET · SETTLEMENT: AES-256 + Ed25519 + SOLANA
        </p>
      </main>
    </>
  );
}
