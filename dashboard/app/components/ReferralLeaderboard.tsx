"use client";

import { useEffect, useState } from "react";

interface LeaderboardEntry {
  rank:       number;
  agent_id:   string;
  name:       string;
  earned_sol: string;
  deal_count: number;
}

function rankColor(rank: number): string {
  if (rank === 1) return "#f8c502"; // gold
  if (rank === 2) return "#02f8c5"; // teal
  return "#666";
}

function rankLabel(rank: number): string {
  if (rank === 1) return "◆";
  if (rank === 2) return "◇";
  return String(rank);
}

export function ReferralLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loaded, setLoaded]   = useState(false);

  const fetchLeaderboard = async () => {
    try {
      const res  = await fetch("/api/referral/leaderboard");
      const data = await res.json();
      if (Array.isArray(data)) setEntries(data);
    } catch { /* silent */ }
    setLoaded(true);
  };

  useEffect(() => {
    fetchLeaderboard();
    const id = setInterval(fetchLeaderboard, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!loaded || entries.length === 0) return null;

  return (
    <section
      className="px-6 py-12 max-w-5xl mx-auto"
      style={{ borderTop: "1px solid #1a1a1a" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "#888" }}
          >
            Referral Leaderboard
          </p>
          <span
            className="text-xs font-mono px-2 py-0.5"
            style={{ color: "#f8c502", border: "1px solid #f8c50233", background: "#f8c50208" }}
          >
            0.5% per deal
          </span>
        </div>
        <p className="text-xs font-mono" style={{ color: "#444" }}>
          earn SOL by referring new agents
        </p>
      </div>

      {/* Table */}
      <div style={{ border: "1px solid #1a1a1a" }}>
        {/* Column headers */}
        <div
          className="grid font-mono text-xs"
          style={{
            gridTemplateColumns: "40px 1fr 120px 60px",
            padding:             "8px 16px",
            borderBottom:        "1px solid #1a1a1a",
            color:               "#444",
            letterSpacing:       "0.08em",
          }}
        >
          <span>#</span>
          <span>AGENT</span>
          <span style={{ textAlign: "right" }}>EARNED</span>
          <span style={{ textAlign: "right" }}>DEALS</span>
        </div>

        {/* Rows */}
        {entries.map((entry) => {
          const color = rankColor(entry.rank);
          const isTop = entry.rank <= 2;
          return (
            <div
              key={entry.agent_id}
              className="grid font-mono text-xs items-center"
              style={{
                gridTemplateColumns: "40px 1fr 120px 60px",
                padding:             "12px 16px",
                borderBottom:        "1px solid #0d0d0d",
                background:          isTop ? `${color}05` : "transparent",
              }}
            >
              {/* Rank */}
              <span
                style={{
                  color,
                  fontSize:   entry.rank <= 2 ? 14 : 11,
                  fontWeight: isTop ? 700 : 400,
                }}
              >
                {rankLabel(entry.rank)}
              </span>

              {/* Agent name */}
              <span
                style={{
                  color:    isTop ? color : "#aaa",
                  fontWeight: isTop ? 600 : 400,
                  letterSpacing: "0.04em",
                }}
              >
                {entry.name}
              </span>

              {/* Earned */}
              <span
                style={{
                  textAlign: "right",
                  color:     isTop ? color : "#888",
                  fontWeight: isTop ? 600 : 400,
                }}
              >
                {entry.earned_sol} SOL
              </span>

              {/* Deal count */}
              <span style={{ textAlign: "right", color: "#555" }}>
                {entry.deal_count}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs font-mono" style={{ color: "#444" }}>
        Copy your agent&apos;s referral link from the registry below ↓ · payouts settle on-chain
      </p>
    </section>
  );
}
