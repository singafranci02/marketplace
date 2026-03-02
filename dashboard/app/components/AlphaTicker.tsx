"use client";

import { useEffect, useState } from "react";

interface TickerEntry {
  artifact_id:    string;
  title:          string;
  ip_type:        string;
  price_sol:      string | null;
  tx_hash:        string | null;
  verified_at:    string | null;
  buyer_agent_id: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export function AlphaTicker() {
  const [entries, setEntries] = useState<TickerEntry[]>([]);
  const [loaded, setLoaded]   = useState(false);

  const fetchTicker = async () => {
    try {
      const res  = await fetch("/api/ticker");
      const data = await res.json();
      if (Array.isArray(data)) setEntries(data);
    } catch { /* silent */ }
    setLoaded(true);
  };

  useEffect(() => {
    fetchTicker();
    const id = setInterval(fetchTicker, 10_000);
    return () => clearInterval(id);
  }, []);

  if (!loaded) return null;
  if (entries.length === 0) return null;

  return (
    <div
      style={{
        borderTop:    "1px solid #1a1a1a",
        borderBottom: "1px solid #1a1a1a",
        background:   "#020202",
        padding:      "10px 0",
        overflow:     "hidden",
        position:     "relative",
      }}
    >
      {/* Badge */}
      <div
        style={{
          position:   "absolute",
          left:       0,
          top:        0,
          bottom:     0,
          display:    "flex",
          alignItems: "center",
          padding:    "0 16px",
          background: "#020202",
          borderRight: "1px solid #1a1a1a",
          zIndex:     2,
          gap:        "6px",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width:           7,
            height:          7,
            borderRadius:    "50%",
            background:      "#02f8c5",
            display:         "inline-block",
            boxShadow:       "0 0 6px #02f8c5",
            animation:       "pulse 2s ease-in-out infinite",
          }}
        />
        <span
          style={{
            fontSize:       11,
            fontFamily:     "monospace",
            color:          "#555",
            letterSpacing:  "0.12em",
            textTransform:  "uppercase",
          }}
        >
          Live Deals
        </span>
      </div>

      {/* Scrolling items */}
      <div
        className="ticker-track"
        style={{
          display:    "flex",
          gap:        "48px",
          animation:  `ticker-scroll ${entries.length * 8}s linear infinite`,
          paddingLeft: 140,
          whiteSpace: "nowrap",
        }}
      >
        {[...entries, ...entries].map((e, i) => (
          <span
            key={`${e.artifact_id}-${i}`}
            style={{
              display:    "inline-flex",
              alignItems: "center",
              gap:        10,
              fontFamily: "monospace",
              fontSize:   12,
            }}
          >
            {/* Verified badge */}
            <span
              style={{
                color:       "#02f8c5",
                fontSize:    10,
                fontWeight:  600,
                letterSpacing: "0.05em",
              }}
            >
              ✓ On-Chain
            </span>

            {/* Title */}
            <span style={{ color: "#ccc" }}>{e.title}</span>

            {/* Price */}
            {e.price_sol && (
              <span style={{ color: "#02f8c5" }}>{e.price_sol} SOL</span>
            )}

            {/* Time */}
            {e.verified_at && (
              <span style={{ color: "#444" }}>{timeAgo(e.verified_at)}</span>
            )}

            {/* Separator */}
            <span style={{ color: "#222" }}>|</span>
          </span>
        ))}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
