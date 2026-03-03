"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DealRow {
  artifact_id:     string;
  artifact_type:   string;
  licensor:        string;
  licensee:        string;
  amount_lamports: number | null;
  on_chain_status: string;
  tx_hash:         string | null;
  issued_at:       string | null;
  rev_share_pct:   number | null;
  artifact_hash:   string | null;
  isNew?:          boolean;
}

export interface AgentRow {
  agent_id:            string;
  name:                string;
  trust_tier:          string;
  liquidity_score_sol: string;
  status:              string;
}

export interface LicenseRow {
  id:                string;
  licensor_agent_id: string;
  licensee_agent_id: string;
  status:            string;
  created_at:        string;
}

export interface VaultRow {
  id:       string;
  title:    string;
  agent_id: string;
  status:   string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(s: string): string {
  const u = s.toUpperCase();
  if (u === "VERIFIED_ON_CHAIN" || u === "SETTLED" || u === "ACTIVE") return "#02f8c5";
  if (u === "SIGNED" || u === "EXECUTING") return "#f8c502";
  if (u === "REVOKED") return "#f84902";
  return "#555";
}

function tierColor(t: string): string {
  if (t === "STAKED")    return "#f8c502";
  if (t === "AUDITED")   return "#02f8c5";
  if (t === "ATTESTED")  return "#888";
  return "#444";
}

function typeColor(t: string): string {
  const l = t.toLowerCase();
  if (l.includes("memecoin"))   return "#f8c502";
  if (l.includes("trading"))    return "#02f8c5";
  if (l.includes("smart"))      return "#a855f7";
  if (l.includes("narrative"))  return "#f87171";
  return "#888";
}

function fmtSol(lamports: number | null): string {
  if (lamports === null) return "—";
  return (lamports / 1e9).toFixed(4) + " SOL";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "——:——";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ---------------------------------------------------------------------------
// Shared cell style
// ---------------------------------------------------------------------------

const PANEL: React.CSSProperties = {
  border:     "1px solid #1a1a1a",
  background: "#030303",
  padding:    "16px",
};

const PANEL_LABEL: React.CSSProperties = {
  fontSize:      9,
  color:         "#02f8c5",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom:  12,
  display:       "flex",
  alignItems:    "center",
  gap:           8,
};

const TABLE_HEADER: React.CSSProperties = {
  fontSize:      9,
  color:         "#444",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  paddingBottom: 6,
  borderBottom:  "1px solid #1a1a1a",
};

const ROW_BASE: React.CSSProperties = {
  padding:      "7px 0",
  borderBottom: "1px solid #0a0a0a",
  fontSize:     10,
  alignItems:   "center",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TerminalDashboard({
  initialDeals,
  agents,
  initialLicenses,
  initialVaults,
}: {
  initialDeals:    DealRow[];
  agents:          AgentRow[];
  initialLicenses: LicenseRow[];
  initialVaults:   VaultRow[];
}) {
  const [deals,    setDeals]    = useState<DealRow[]>(initialDeals);
  const [licenses, setLicenses] = useState<LicenseRow[]>(initialLicenses);
  const [vaults,   setVaults]   = useState<VaultRow[]>(initialVaults);
  const [live,     setLive]     = useState(false);
  const [clock,    setClock]    = useState("");
  const lastHashRef = useRef<string>(initialDeals[0]?.artifact_hash ?? "GENESIS");

  // Live clock
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("en-US", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Supabase realtime — ledger INSERT
  useEffect(() => {
    const supabase = createClient();
    const channel  = supabase
      .channel("terminal-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ledger" },
        (payload) => {
          const row = payload.new as {
            artifact:        Record<string, unknown>;
            amount_lamports: number | null;
            on_chain_status: string | null;
            tx_hash:         string | null;
            artifact_hash:   string;
          };
          const artifact = row.artifact;
          const parties  = artifact.parties as {
            licensor?: { company?: string; agent_id?: string };
            licensee?: { company?: string; agent_id?: string };
          } | undefined;
          const terms = artifact.terms as { rev_share_pct?: number } | undefined;

          const newDeal: DealRow = {
            artifact_id:     (artifact.artifact_id as string | undefined) ?? "",
            artifact_type:   (artifact.artifact_type as string | undefined) ?? "",
            licensor:        parties?.licensor?.company ?? parties?.licensor?.agent_id ?? "—",
            licensee:        parties?.licensee?.company ?? parties?.licensee?.agent_id ?? "—",
            amount_lamports: row.amount_lamports ? Number(row.amount_lamports) : null,
            on_chain_status: row.on_chain_status ?? "OFF_CHAIN",
            tx_hash:         row.tx_hash,
            issued_at:       (artifact.issued_at as string | undefined) ?? null,
            rev_share_pct:   terms?.rev_share_pct ?? null,
            artifact_hash:   row.artifact_hash,
            isNew:           true,
          };
          lastHashRef.current = row.artifact_hash;
          setDeals((prev) => [newDeal, ...prev.slice(0, 49)]);
          setTimeout(() => {
            setDeals((prev) =>
              prev.map((d) =>
                d.artifact_id === newDeal.artifact_id ? { ...d, isNew: false } : d
              )
            );
          }, 2000);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive(true);
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  // 30s polling — licenses + vaults refresh
  useEffect(() => {
    const poll = async () => {
      try {
        const res  = await fetch("/api/dashboard");
        if (!res.ok) return;
        const data = await res.json();
        if (data.licenses) setLicenses(data.licenses);
        if (data.vaults)   setVaults(data.vaults);
      } catch { /* ignore */ }
    };
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalSol = deals
    .filter((d) => d.on_chain_status === "VERIFIED_ON_CHAIN" && d.amount_lamports)
    .reduce((s, d) => s + (d.amount_lamports ?? 0), 0) / 1e9;
  const onChainCount  = deals.filter((d) => d.on_chain_status === "VERIFIED_ON_CHAIN").length;
  const activeAgents  = agents.filter((a) => a.status === "ACTIVE").length;
  const liveLicenses  = licenses.filter((l) => l.status === "SIGNED" || l.status === "EXECUTING").length;
  const settledCount  = licenses.filter((l) => l.status === "SETTLED").length;
  const revokedCount  = licenses.filter((l) => l.status === "REVOKED").length;
  const avgRevShare   =
    deals.filter((d) => d.rev_share_pct !== null).length > 0
      ? deals.reduce((s, d) => s + (d.rev_share_pct ?? 0), 0) /
        deals.filter((d) => d.rev_share_pct !== null).length
      : 0;

  const kpis = [
    { label: "VOLUME (SOL)",   value: totalSol.toFixed(4),        color: "#02f8c5" },
    { label: "ON-CHAIN",       value: onChainCount,               color: "#02f8c5" },
    { label: "ACTIVE AGENTS",  value: activeAgents,               color: "#fff" },
    { label: "LIVE LICENSES",  value: liveLicenses,               color: "#f8c502" },
    { label: "SETTLED",        value: settledCount,               color: "#02f8c5" },
    { label: "REVOKED",        value: revokedCount,               color: revokedCount > 0 ? "#f84902" : "#555" },
    { label: "VAULTS ACTIVE",  value: vaults.length,             color: "#fff" },
    { label: "AVG REV SHARE",  value: `${avgRevShare.toFixed(1)}%`, color: "#888" },
  ];

  const sortedAgents = [...agents].sort(
    (a, b) => parseFloat(b.liquidity_score_sol) - parseFloat(a.liquidity_score_sol)
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main style={{ fontFamily: "monospace", background: "#000", minHeight: "100vh", padding: 24 }}>

      {/* ── Header bar ── */}
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        marginBottom:   20,
        borderBottom:   "1px solid #1a1a1a",
        paddingBottom:  14,
      }}>
        <div>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
            AGENT MARKET ◈ COMMAND TERMINAL
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", margin: 0 }}>
            MARKET DASHBOARD
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ fontSize: 11, color: "#555", letterSpacing: "0.08em" }}>{clock}</span>
          {live ? (
            <span style={{ fontSize: 9, color: "#02f8c5", letterSpacing: "0.12em", display: "flex", alignItems: "center", gap: 4 }}>
              <span className="animate-pulse">●</span> LIVE
            </span>
          ) : (
            <span style={{ fontSize: 9, color: "#333", letterSpacing: "0.12em" }}>○ CONNECTING</span>
          )}
        </div>
      </div>

      {/* ── KPI strip (2 rows × 4 cols) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginBottom: 20 }}>
        {kpis.map(({ label, value, color }) => (
          <div key={label} style={{ ...PANEL, padding: "12px 14px" }}>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
              {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color, letterSpacing: "0.02em" }}>
              {String(value)}
            </div>
          </div>
        ))}
      </div>

      {/* ── Upper panels: Deal Feed | Agent Registry ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginBottom: 1 }}>

        {/* DEAL FEED */}
        <div style={PANEL}>
          <div style={PANEL_LABEL}>
            DEAL FEED
            <span style={{ color: "#333" }}>——</span>
            <span style={{ color: "#444" }}>{deals.length} RECORDS</span>
          </div>
          {/* Header row */}
          <div style={{ ...TABLE_HEADER, display: "grid", gridTemplateColumns: "52px 88px 1fr 90px 90px", gap: 8 }}>
            <span>TIME</span>
            <span>TYPE</span>
            <span>ROUTE</span>
            <span style={{ textAlign: "right" }}>AMOUNT</span>
            <span style={{ textAlign: "right" }}>STATUS</span>
          </div>
          <div style={{ overflowY: "auto", maxHeight: 360 }}>
            {deals.length === 0 ? (
              <div style={{ fontSize: 11, color: "#333", padding: "16px 0" }}>No deals recorded yet.</div>
            ) : (
              deals.map((d, i) => (
                <div
                  key={d.artifact_id || i}
                  style={{
                    ...ROW_BASE,
                    display:             "grid",
                    gridTemplateColumns: "52px 88px 1fr 90px 90px",
                    gap:                 8,
                    background:          d.isNew ? "#02f8c510" : "transparent",
                    transition:          "background 0.8s",
                  }}
                >
                  <span style={{ color: "#444", fontSize: 9 }}>{fmtTime(d.issued_at)}</span>
                  <span style={{ color: typeColor(d.artifact_type), fontSize: 9, letterSpacing: "0.04em" }}>
                    {d.artifact_type
                      ? d.artifact_type.toUpperCase().replace(/_/g, " ").slice(0, 11)
                      : "—"}
                  </span>
                  <span style={{ color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {trunc(d.licensor, 11)} → {trunc(d.licensee, 11)}
                  </span>
                  <span style={{ color: "#ddd", textAlign: "right" }}>{fmtSol(d.amount_lamports)}</span>
                  <span style={{ color: statusColor(d.on_chain_status), fontSize: 9, letterSpacing: "0.04em", textAlign: "right" }}>
                    {d.on_chain_status === "VERIFIED_ON_CHAIN" ? "✓ ON-CHAIN" : d.on_chain_status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* AGENT REGISTRY */}
        <div style={PANEL}>
          <div style={PANEL_LABEL}>
            AGENT REGISTRY
            <span style={{ color: "#444" }}>{agents.length} REGISTERED</span>
          </div>
          <div style={{ ...TABLE_HEADER, display: "grid", gridTemplateColumns: "22px 1fr 72px 70px 60px", gap: 8 }}>
            <span>#</span>
            <span>AGENT</span>
            <span style={{ textAlign: "right" }}>SCORE</span>
            <span style={{ textAlign: "center" }}>TIER</span>
            <span style={{ textAlign: "right" }}>STATUS</span>
          </div>
          {sortedAgents.length === 0 ? (
            <div style={{ fontSize: 11, color: "#333", padding: "16px 0" }}>No agents found.</div>
          ) : (
            sortedAgents.map((a, i) => (
              <div
                key={a.agent_id}
                style={{
                  ...ROW_BASE,
                  display:             "grid",
                  gridTemplateColumns: "22px 1fr 72px 70px 60px",
                  gap:                 8,
                }}
              >
                <span style={{ color: "#444", fontSize: 9 }}>{i + 1}</span>
                <span style={{ color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.name}
                </span>
                <span style={{ color: "#fff", textAlign: "right", fontSize: 10 }}>
                  {a.liquidity_score_sol}
                </span>
                <span style={{ textAlign: "center" }}>
                  <span style={{
                    fontSize:       8,
                    color:          tierColor(a.trust_tier),
                    border:         `1px solid ${tierColor(a.trust_tier)}33`,
                    padding:        "1px 4px",
                    letterSpacing:  "0.06em",
                  }}>
                    {a.trust_tier}
                  </span>
                </span>
                <span style={{ textAlign: "right", color: statusColor(a.status), fontSize: 9 }}>
                  {a.status === "ACTIVE" ? "● LIVE" : "○ OFF"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Lower panels: License Registry | IP Vault ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginTop: 1 }}>

        {/* LICENSE REGISTRY */}
        <div style={PANEL}>
          <div style={PANEL_LABEL}>
            LICENSE REGISTRY
            <span style={{ color: "#444" }}>{licenses.length} RECENT</span>
          </div>
          <div style={{ ...TABLE_HEADER, display: "grid", gridTemplateColumns: "72px 1fr 88px 56px", gap: 8 }}>
            <span>ID</span>
            <span>LICENSEE</span>
            <span style={{ textAlign: "center" }}>STATUS</span>
            <span style={{ textAlign: "right" }}>DATE</span>
          </div>
          <div style={{ overflowY: "auto", maxHeight: 260 }}>
            {licenses.length === 0 ? (
              <div style={{ fontSize: 11, color: "#333", padding: "16px 0" }}>No licenses yet.</div>
            ) : (
              licenses.map((l) => (
                <div
                  key={l.id}
                  style={{
                    ...ROW_BASE,
                    display:             "grid",
                    gridTemplateColumns: "72px 1fr 88px 56px",
                    gap:                 8,
                  }}
                >
                  <span style={{ color: "#555", fontSize: 9 }}>{l.id.slice(0, 8)}</span>
                  <span style={{ color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {trunc(l.licensee_agent_id || l.licensor_agent_id, 16)}
                  </span>
                  <span style={{ textAlign: "center", color: statusColor(l.status), fontSize: 9, letterSpacing: "0.04em" }}>
                    {l.status}
                  </span>
                  <span style={{ textAlign: "right", color: "#444", fontSize: 9 }}>
                    {fmtDate(l.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* IP VAULT */}
        <div style={PANEL}>
          <div style={PANEL_LABEL}>
            IP VAULT
            <span style={{ color: "#444" }}>{vaults.length} ACTIVE</span>
          </div>
          <div style={{ ...TABLE_HEADER, display: "grid", gridTemplateColumns: "1fr 1fr 50px", gap: 8 }}>
            <span>TITLE</span>
            <span>OWNER ID</span>
            <span style={{ textAlign: "right" }}>STATUS</span>
          </div>
          <div style={{ overflowY: "auto", maxHeight: 260 }}>
            {vaults.length === 0 ? (
              <div style={{ fontSize: 11, color: "#333", padding: "16px 0" }}>No active vaults.</div>
            ) : (
              vaults.map((v) => (
                <div
                  key={v.id}
                  style={{
                    ...ROW_BASE,
                    display:             "grid",
                    gridTemplateColumns: "1fr 1fr 50px",
                    gap:                 8,
                  }}
                >
                  <span style={{ color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {trunc(v.title, 20)}
                  </span>
                  <span style={{ color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9 }}>
                    {trunc(v.agent_id, 14)}
                  </span>
                  <span style={{ textAlign: "right", color: statusColor(v.status), fontSize: 9 }}>
                    {v.status.toUpperCase()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        marginTop:    16,
        paddingTop:   12,
        borderTop:    "1px solid #1a1a1a",
        display:      "flex",
        justifyContent: "space-between",
        fontSize:     9,
        color:        "#333",
        letterSpacing: "0.08em",
      }}>
        <span>AGENT MARKET TERMINAL · CHAIN: SOLANA DEVNET · REALTIME: SUPABASE POSTGRES</span>
        <span>
          <a href="/ledger" style={{ color: "#444", textDecoration: "none" }}>
            FULL AUDIT LEDGER →
          </a>
          <span style={{ margin: "0 12px" }}>·</span>
          <a href="/api/dashboard" style={{ color: "#444", textDecoration: "none" }}>
            JSON API →
          </a>
        </span>
      </div>
    </main>
  );
}
