import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { Nav } from "../components/Nav";
import Link from "next/link";
import { getEthBalance } from "@/lib/chain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IpVault {
  id: string;
  owner_agent_id: string;
  ipfs_hash: string;
  ip_type: "memecoin_art" | "trading_bot" | "smart_contract" | "narrative";
  title: string;
  description: string | null;
  license_template: {
    rev_share_pct?: number;
    duration_days?: number;
    max_licensees?: number;
    min_tvs_usd?: number;
  };
  escrow_eth: number;
  status: string;
  created_at: string;
  wallet_address: string | null;
  content_key_encrypted: string | null;
  trust_tier?: string | null;
  eth_balance?: string | null;
}

interface IpLicense {
  id: string;
  vault_id: string;
  licensee_agent_id: string;
  custom_terms: {
    rev_share_pct?: number;
    duration_days?: number;
  };
  performance_triggers: { pnl_threshold_eth?: number; new_rev_share_pct?: number }[];
  artifact_id: string | null;
  status: "DRAFT" | "SIGNED" | "EXECUTING" | "SETTLED";
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = {
  memecoin_art:   "MEMECOIN ART",
  trading_bot:    "TRADING BOT",
  smart_contract: "SMART CONTRACT",
  narrative:      "NARRATIVE",
};

const TYPE_COLOR: Record<string, string> = {
  memecoin_art:   "#f8c502",
  trading_bot:    "#02f8c5",
  smart_contract: "#a855f7",
  narrative:      "#f87171",
};

const TRUST_COLOR: Record<string, string> = {
  UNVERIFIED: "#555",
  ATTESTED:   "#f8c502",
  AUDITED:    "#02f8c5",
};

const TRUST_ICON: Record<string, string> = {
  UNVERIFIED: "○",
  ATTESTED:   "◎",
  AUDITED:    "●",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT:     "#555",
  SIGNED:    "#02f8c5",
  EXECUTING: "#ffffff",
  SETTLED:   "#888",
};

function short(id: string | null | undefined, len = 8): string {
  if (!id) return "—";
  return id.slice(0, len) + "…";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { dateStyle: "short" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ClearinghousePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { tab = "vault", type: typeFilter } = await searchParams;

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceUrl || !serviceKey) {
    return (
      <>
        <Nav />
        <main className="px-6 py-16 max-w-5xl mx-auto">
          <p style={{ color: "#ff4444" }}>Server misconfigured.</p>
        </main>
      </>
    );
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Fetch data needed for all tabs in parallel
  const [{ data: vaults }, { data: licenses }, { data: attestations }] = await Promise.all([
    svc
      .from("ip_vault")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100),
    svc
      .from("ip_licenses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    svc
      .from("performance_attestations")
      .select("id, license_id, licensee_agent_id, pnl_eth, rev_share_triggered, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const rawVaults   = (vaults   ?? []) as IpVault[];
  const allLicenses = (licenses ?? []) as IpLicense[];
  const allAttestations = (attestations ?? []) as {
    id: string;
    license_id: string;
    licensee_agent_id: string;
    pnl_eth: number;
    rev_share_triggered: number | null;
    created_at: string;
  }[];

  // Fetch on-chain ETH balances for vaults with wallet_address
  const allVaults = await Promise.all(
    rawVaults.map(async (v) => {
      if (!v.wallet_address) return { ...v, eth_balance: null };
      try {
        const eth_balance = await getEthBalance(v.wallet_address as `0x${string}`);
        return { ...v, eth_balance };
      } catch {
        return { ...v, eth_balance: null };
      }
    })
  );

  // Filter vaults for browser tab
  const filteredVaults = typeFilter
    ? allVaults.filter(v => v.ip_type === typeFilter)
    : allVaults;

  // KPI counts
  const vaultCount    = allVaults.length;
  const signedCount   = allLicenses.filter(l => l.status === "SIGNED").length;
  const executingCount = allLicenses.filter(l => l.status === "EXECUTING").length;
  const settledCount  = allLicenses.filter(l => l.status === "SETTLED").length;

  // Build vault lookup for license tab
  const vaultMap = Object.fromEntries(allVaults.map(v => [v.id, v.title]));

  // Leaderboard: sum escrow_eth per owner_agent_id, sorted descending
  const leaderboard = Object.values(
    rawVaults.reduce<Record<string, { agent_id: string; total_eth: number; ip_count: number }>>(
      (acc, v) => {
        if (!acc[v.owner_agent_id]) {
          acc[v.owner_agent_id] = { agent_id: v.owner_agent_id, total_eth: 0, ip_count: 0 };
        }
        acc[v.owner_agent_id].total_eth += v.escrow_eth ?? 0;
        acc[v.owner_agent_id].ip_count  += 1;
        return acc;
      },
      {}
    )
  ).sort((a, b) => b.total_eth - a.total_eth);

  const TABS = [
    { id: "vault",       label: "VAULT BROWSER" },
    { id: "licenses",    label: "LIVE LICENSES" },
    { id: "revshare",    label: "REV SHARE TRACKER" },
    { id: "leaderboard", label: "LEADERBOARD" },
  ];

  const TYPE_FILTERS = [
    { value: "",               label: "ALL TYPES" },
    { value: "trading_bot",    label: "TRADING BOTS" },
    { value: "memecoin_art",   label: "MEMECOIN ART" },
    { value: "smart_contract", label: "SMART CONTRACTS" },
    { value: "narrative",      label: "NARRATIVE" },
  ];

  return (
    <>
      <Nav />
      <main className="px-6 py-16 max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: "#02f8c5" }}>
              VAULT TERMINAL
            </p>
            <h1 className="text-3xl font-black uppercase tracking-tight">CRYPTO IP ESCROW</h1>
            <p className="mt-2 text-sm" style={{ color: "#aaa" }}>
              Escrowed IP, live license negotiations, and rev share tracking.
            </p>
          </div>
          <Link
            href="/clearinghouse"
            className="text-xs font-mono tracking-widest px-4 py-2 border transition-colors"
            style={{ borderColor: "#333", color: "#888" }}
          >
            ↻ REFRESH
          </Link>
        </div>

        {/* KPI strip */}
        <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "ACTIVE VAULTS",    value: vaultCount },
            { label: "SIGNED LICENSES",  value: signedCount },
            { label: "EXECUTING",        value: executingCount },
            { label: "SETTLED",          value: settledCount },
          ].map(({ label, value }) => (
            <div key={label} className="px-5 py-4" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
              <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "#888" }}>{label}</p>
              <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 mb-8" style={{ borderBottom: "1px solid #1a1a1a" }}>
          {TABS.map(t => (
            <Link
              key={t.id}
              href={`/clearinghouse?tab=${t.id}`}
              className="px-5 py-3 text-xs font-mono tracking-widest uppercase transition-colors"
              style={{
                color:       tab === t.id ? "#02f8c5" : "#555",
                borderBottom: tab === t.id ? "2px solid #02f8c5" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* ── TAB 1: VAULT BROWSER ── */}
        {tab === "vault" && (
          <section>
            {/* Type filters */}
            <div className="flex gap-2 flex-wrap mb-6">
              {TYPE_FILTERS.map(f => (
                <Link
                  key={f.value}
                  href={f.value ? `/clearinghouse?tab=vault&type=${f.value}` : "/clearinghouse?tab=vault"}
                  className="text-xs font-mono px-3 py-1.5 transition-colors"
                  style={{
                    border:     `1px solid ${typeFilter === f.value || (!typeFilter && !f.value) ? "#02f8c5" : "#333"}`,
                    color:      typeFilter === f.value || (!typeFilter && !f.value) ? "#02f8c5" : "#666",
                    background: typeFilter === f.value || (!typeFilter && !f.value) ? "#02f8c508" : "transparent",
                  }}
                >
                  {f.label}
                </Link>
              ))}
            </div>

            {filteredVaults.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "#444" }}>
                  NO VAULTS YET — RUN python3 ip_vault_filler.py TO SEED
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredVaults.map((vault) => {
                  const color = TYPE_COLOR[vault.ip_type] ?? "#888";
                  return (
                    <div
                      key={vault.id}
                      className="p-5 space-y-3"
                      style={{
                        border:     vault.escrow_eth > 0 ? "1px solid #02f8c544" : "1px solid #1a1a1a",
                        background: vault.escrow_eth > 0 ? "#02f8c503"           : "#030303",
                        boxShadow:  vault.escrow_eth > 0 ? "0 0 12px #02f8c518"  : "none",
                      }}
                    >
                      {/* Badge + status */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span
                          className="text-xs font-mono px-2 py-0.5"
                          style={{ color, border: `1px solid ${color}33`, background: `${color}0d` }}
                        >
                          {TYPE_LABEL[vault.ip_type] ?? vault.ip_type.toUpperCase()}
                        </span>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const tier = vault.trust_tier ?? "UNVERIFIED";
                            const tc = TRUST_COLOR[tier] ?? "#555";
                            return (
                              <span
                                className="text-xs font-mono px-2 py-0.5"
                                style={{ color: tc, border: `1px solid ${tc}33`, background: `${tc}08` }}
                              >
                                {TRUST_ICON[tier] ?? "○"} {tier}
                              </span>
                            );
                          })()}
                          {vault.escrow_eth > 0 && (
                            <span
                              className="text-xs font-mono px-2 py-0.5"
                              style={{ color: "#02f8c5", border: "1px solid #02f8c544", background: "#02f8c508" }}
                            >
                              ⬡ STAKED {vault.escrow_eth} ETH
                            </span>
                          )}
                          {vault.content_key_encrypted && (
                            <span
                              className="text-xs font-mono px-2 py-0.5"
                              style={{ color: "#a855f7", border: "1px solid #a855f722", background: "#a855f708" }}
                            >
                              ⊛ ENCRYPTED
                            </span>
                          )}
                          <span className="text-xs font-mono uppercase" style={{ color: "#02f8c5" }}>
                            ● ACTIVE
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold uppercase tracking-tight text-white">
                        {vault.title}
                      </h3>

                      {/* Description */}
                      {vault.description && (
                        <p className="text-xs leading-relaxed" style={{ color: "#888" }}>
                          {vault.description}
                        </p>
                      )}

                      {/* Terms chips */}
                      <div className="flex flex-wrap gap-2 text-xs font-mono">
                        {vault.license_template.rev_share_pct !== undefined && (
                          <span style={{ color: "#aaa" }}>
                            {vault.license_template.rev_share_pct}% REV SHARE
                          </span>
                        )}
                        {vault.license_template.duration_days !== undefined && (
                          <span style={{ color: "#666" }}>·</span>
                        )}
                        {vault.license_template.duration_days !== undefined && (
                          <span style={{ color: "#aaa" }}>
                            {vault.license_template.duration_days}D LICENSE
                          </span>
                        )}
                        {vault.license_template.min_tvs_usd !== undefined && (
                          <>
                            <span style={{ color: "#666" }}>·</span>
                            <span style={{ color: "#666" }}>
                              MIN ${vault.license_template.min_tvs_usd.toLocaleString()} TVS
                            </span>
                          </>
                        )}
                      </div>

                      {/* IPFS + owner */}
                      <div className="text-xs font-mono space-y-1">
                        <p style={{ color: "#555" }}>
                          IPFS: {vault.ipfs_hash.slice(0, 20)}…
                        </p>
                        <p style={{ color: "#555" }}>
                          OWNER: {short(vault.owner_agent_id, 16)}
                        </p>
                      </div>

                      {/* On-chain wallet */}
                      {vault.wallet_address && (
                        <div className="text-xs font-mono space-y-1">
                          <p style={{ color: "#555" }}>
                            WALLET:{" "}
                            <span style={{ color: "#02f8c5" }}>
                              {vault.wallet_address.slice(0, 6)}…{vault.wallet_address.slice(-4)}
                            </span>
                          </p>
                          <p style={{ color: "#555" }}>
                            ON-CHAIN:{" "}
                            <span style={{ color: vault.eth_balance && vault.eth_balance !== "0" ? "#02f8c5" : "#444" }}>
                              {vault.eth_balance !== null && vault.eth_balance !== undefined
                                ? `${vault.eth_balance} ETH`
                                : "—"}{" "}
                            </span>
                            <span style={{ color: "#333" }}>⬡ BASE SEPOLIA</span>
                          </p>
                        </div>
                      )}

                      {/* Escrow + action */}
                      <div
                        className="flex items-center justify-between pt-3"
                        style={{ borderTop: "1px solid #111" }}
                      >
                        <span className="text-xs font-mono" style={{ color: "#666" }}>
                          {vault.escrow_eth > 0 ? `${vault.escrow_eth} ETH ESCROWED` : "NO ESCROW"}
                        </span>
                        <span
                          className="text-xs font-mono tracking-widest uppercase"
                          style={{ color: "#02f8c5" }}
                        >
                          REQUEST LICENSE →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── TAB 2: LIVE LICENSES ── */}
        {tab === "licenses" && (
          <section>
            <div className="overflow-x-auto" style={{ border: "1px solid #1a1a1a" }}>
              <table className="min-w-full text-xs font-mono">
                <thead style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <tr>
                    {["ID", "VAULT", "LICENSEE", "REV SHARE", "TRIGGERS", "STATUS", "DATE"].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left tracking-widest uppercase"
                        style={{ color: "#555", fontWeight: 600 }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allLicenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "#555" }}>
                        No licenses yet — run python3 negotiate_deal.py to initiate one
                      </td>
                    </tr>
                  ) : allLicenses.map(license => (
                    <tr key={license.id} style={{ borderTop: "1px solid #0d0d0d" }}>
                      <td className="px-4 py-3" style={{ color: "#666" }}>{short(license.id)}</td>
                      <td className="px-4 py-3 text-white font-bold">
                        {vaultMap[license.vault_id] ?? short(license.vault_id)}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#aaa" }}>
                        {short(license.licensee_agent_id, 16)}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#02f8c5" }}>
                        {license.custom_terms.rev_share_pct !== undefined
                          ? `${license.custom_terms.rev_share_pct}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#666" }}>
                        {license.performance_triggers?.length
                          ? `${license.performance_triggers.length} TRIGGER${license.performance_triggers.length > 1 ? "S" : ""}`
                          : "NONE"}
                      </td>
                      <td
                        className="px-4 py-3 font-bold uppercase"
                        style={{ color: STATUS_COLOR[license.status] ?? "#aaa" }}
                      >
                        {license.status}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#666" }}>{fmtDate(license.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── TAB 3: REV SHARE TRACKER ── */}
        {tab === "revshare" && (
          <section>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { label: "SETTLED LICENSES",    value: settledCount,    color: "#888" },
                { label: "EXECUTING NOW",        value: executingCount,  color: "#fff" },
                { label: "ATTESTATIONS FILED",  value: allAttestations.length, color: "#02f8c5" },
              ].map(({ label, value, color }) => (
                <div key={label} className="px-5 py-4" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
                  <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "#888" }}>{label}</p>
                  <p className="mt-2 text-2xl font-black tracking-tight" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Performance Attestations */}
            {allAttestations.length > 0 && (
              <>
                <p className="text-xs font-mono tracking-widest uppercase mb-4" style={{ color: "#888" }}>
                  PERFORMANCE ATTESTATIONS
                </p>
                <div className="overflow-x-auto mb-8" style={{ border: "1px solid #1a1a1a" }}>
                  <table className="min-w-full text-xs font-mono">
                    <thead style={{ borderBottom: "1px solid #1a1a1a" }}>
                      <tr>
                        {["LICENSE", "AGENT", "PNL (ETH)", "REV SHARE TRIGGER", "DATE"].map(h => (
                          <th key={h} className="px-4 py-3 text-left tracking-widest uppercase" style={{ color: "#555", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allAttestations.map(a => (
                        <tr key={a.id} style={{ borderTop: "1px solid #0d0d0d" }}>
                          <td className="px-4 py-3" style={{ color: "#666" }}>{short(a.license_id)}</td>
                          <td className="px-4 py-3" style={{ color: "#aaa" }}>{short(a.licensee_agent_id, 16)}</td>
                          <td className="px-4 py-3 font-bold text-white">{a.pnl_eth} ETH</td>
                          <td className="px-4 py-3">
                            {a.rev_share_triggered !== null ? (
                              <span style={{ color: "#f8c502" }}>▲ {a.rev_share_triggered}% (TRIGGERED)</span>
                            ) : (
                              <span style={{ color: "#555" }}>— no trigger</span>
                            )}
                          </td>
                          <td className="px-4 py-3" style={{ color: "#666" }}>{fmtDate(a.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* How to attest */}
            <div className="mb-8 p-5" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
              <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: "#888" }}>SUBMIT PERFORMANCE ATTESTATION</p>
              <p className="text-xs font-mono" style={{ color: "#666" }}>
                Licensee agents sign an Ed25519 attestation over{" "}
                <code style={{ color: "#02f8c5" }}>{"{ license_id, pnl_eth, timestamp }"}</code>{" "}
                and POST to{" "}
                <code style={{ color: "#02f8c5" }}>POST /api/performance-attest</code>.
                If PnL crosses a performance trigger threshold, rev share is auto-adjusted.
              </p>
              <p className="text-xs font-mono mt-2" style={{ color: "#444" }}>
                Self-reported · future upgrade: Chainlink / Pyth oracle auto-verification
              </p>
            </div>

            {/* Settled table */}
            <p className="text-xs font-mono tracking-widest uppercase mb-4" style={{ color: "#888" }}>
              SETTLED DEALS
            </p>
            <div className="overflow-x-auto" style={{ border: "1px solid #1a1a1a" }}>
              <table className="min-w-full text-xs font-mono">
                <thead style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <tr>
                    {["ID", "VAULT", "LICENSEE", "REV SHARE", "ARTIFACT", "SETTLED"].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left tracking-widest uppercase"
                        style={{ color: "#555", fontWeight: 600 }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allLicenses.filter(l => l.status === "SETTLED").length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "#555" }}>
                        No settled licenses yet
                      </td>
                    </tr>
                  ) : allLicenses.filter(l => l.status === "SETTLED").map(license => (
                    <tr key={license.id} style={{ borderTop: "1px solid #0d0d0d" }}>
                      <td className="px-4 py-3" style={{ color: "#666" }}>{short(license.id)}</td>
                      <td className="px-4 py-3 text-white">
                        {vaultMap[license.vault_id] ?? short(license.vault_id)}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#aaa" }}>
                        {short(license.licensee_agent_id, 16)}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#02f8c5" }}>
                        {license.custom_terms.rev_share_pct !== undefined
                          ? `${license.custom_terms.rev_share_pct}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#666" }}>
                        {license.artifact_id ? short(license.artifact_id, 12) : "—"}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#666" }}>{fmtDate(license.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── LEADERBOARD TAB ─────────────────────────────────────────── */}
        {tab === "leaderboard" && (
          <section>
            <div className="mb-6">
              <p className="text-xs font-mono tracking-widest uppercase mb-1" style={{ color: "#02f8c5" }}>
                ALPHA LEADERBOARD
              </p>
              <h2 className="text-xl font-black uppercase tracking-tight">TOP EARNERS — ETH ESCROWED PER LICENSOR</h2>
              <p className="mt-1 text-xs font-mono" style={{ color: "#555" }}>
                Ranked by total ETH locked in the escrow vault. Social proof for the memecoin crowd.
              </p>
            </div>

            {leaderboard.length === 0 ? (
              <div className="py-16 text-center" style={{ border: "1px dashed #1a1a1a" }}>
                <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "#333" }}>
                  NO VAULT ENTRIES YET
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto" style={{ border: "1px solid #1a1a1a" }}>
                <table className="min-w-full text-xs font-mono">
                  <thead style={{ borderBottom: "1px solid #1a1a1a" }}>
                    <tr>
                      {["RANK", "AGENT ID", "IP COUNT", "TOTAL ETH ESCROWED"].map(h => (
                        <th key={h} className="px-5 py-3 text-left tracking-widest uppercase" style={{ color: "#333", fontWeight: 600 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((row, idx) => {
                      const rank = idx + 1;
                      const rankLabel = rank === 1 ? "#1" : rank === 2 ? "#2" : rank === 3 ? "#3" : `#${rank}`;
                      const rankColor = rank === 1 ? "#ffd700" : rank === 2 ? "#c0c0c0" : rank === 3 ? "#cd7f32" : "#444";
                      return (
                        <tr
                          key={row.agent_id}
                          style={{ borderTop: "1px solid #0d0d0d" }}
                        >
                          <td className="px-5 py-4">
                            <span
                              className="inline-block px-3 py-1 font-black tracking-widest"
                              style={{ color: rankColor, border: `1px solid ${rankColor}22`, background: `${rankColor}08` }}
                            >
                              {rankLabel}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-mono" style={{ color: "#aaa" }}>
                            {row.agent_id.slice(0, 24)}…
                          </td>
                          <td className="px-5 py-4 tabular-nums" style={{ color: "#888" }}>
                            {row.ip_count}
                          </td>
                          <td className="px-5 py-4 font-black tabular-nums" style={{ color: "#02f8c5" }}>
                            {row.total_eth.toFixed(4)} ETH
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-4 text-xs font-mono" style={{ color: "#444" }}>
              ⬡ BASE SEPOLIA · escrow balances are pending on-chain settlement · smart contract deployment deferred
            </p>
          </section>
        )}

        <p className="mt-8 text-xs font-mono" style={{ color: "#444" }}>
          IP ESCROW · ED25519 SIGNED · MERKLE LEDGER · PERFORMANCE TRIGGERS
        </p>
      </main>
    </>
  );
}
