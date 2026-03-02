import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { Nav } from "../components/Nav";
import Link from "next/link";

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
  const [{ data: vaults }, { data: licenses }] = await Promise.all([
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
  ]);

  const allVaults   = (vaults   ?? []) as IpVault[];
  const allLicenses = (licenses ?? []) as IpLicense[];

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

  const TABS = [
    { id: "vault",    label: "VAULT BROWSER" },
    { id: "licenses", label: "LIVE LICENSES" },
    { id: "revshare", label: "REV SHARE TRACKER" },
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
                      style={{ border: "1px solid #1a1a1a", background: "#030303" }}
                    >
                      {/* Badge + status */}
                      <div className="flex items-center justify-between">
                        <span
                          className="text-xs font-mono px-2 py-0.5"
                          style={{ color, border: `1px solid ${color}33`, background: `${color}0d` }}
                        >
                          {TYPE_LABEL[vault.ip_type] ?? vault.ip_type.toUpperCase()}
                        </span>
                        <span className="text-xs font-mono uppercase" style={{ color: "#02f8c5" }}>
                          ● ACTIVE
                        </span>
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
                { label: "SETTLED LICENSES", value: settledCount,    color: "#888" },
                { label: "EXECUTING NOW",    value: executingCount,  color: "#fff" },
                { label: "AWAITING SIGN",    value: allLicenses.filter(l => l.status === "DRAFT").length, color: "#555" },
              ].map(({ label, value, color }) => (
                <div key={label} className="px-5 py-4" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
                  <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "#888" }}>{label}</p>
                  <p className="mt-2 text-2xl font-black tracking-tight" style={{ color }}>{value}</p>
                </div>
              ))}
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

        <p className="mt-8 text-xs font-mono" style={{ color: "#444" }}>
          IP ESCROW · ED25519 SIGNED · MERKLE LEDGER · PERFORMANCE TRIGGERS
        </p>
      </main>
    </>
  );
}
