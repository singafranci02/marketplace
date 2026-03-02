"use client";

import { useState } from "react";
import type { Policy } from "../policies/page";

const FIELDS = [
  { value: "terms.rev_share_pct",              label: "Rev Share (%)" },
  { value: "terms.license_days",               label: "License Duration (days)" },
  { value: "terms.min_tvs_usd",                label: "Min TVS (USD)" },
  { value: "parties.licensor.legal_entity_id", label: "Licensor Entity ID" },
];

const OPERATORS = [
  { value: "lte",         label: "≤  (less than or equal)" },
  { value: "gte",         label: "≥  (greater than or equal)" },
  { value: "lt",          label: "<  (less than)" },
  { value: "gt",          label: ">  (greater than)" },
  { value: "eq",          label: "=  (equals)" },
  { value: "neq",         label: "≠  (not equals)" },
  { value: "contains",    label: "contains" },
  { value: "not_contains",label: "does not contain" },
];

const OP_SYMBOLS: Record<string, string> = {
  lte: "≤", gte: "≥", lt: "<", gt: ">",
  eq: "=", neq: "≠", contains: "contains", not_contains: "∌",
};

interface Props {
  initialPolicies: Policy[];
  fieldLabels: Record<string, string>;
  initialPaused: boolean;
}

export function PolicyManager({ initialPolicies, fieldLabels, initialPaused }: Props) {
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies);
  const [field,       setField]       = useState(FIELDS[0].value);
  const [operator,    setOperator]    = useState("lte");
  const [value,       setValue]       = useState("");
  const [description, setDescription] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [paused,      setPaused]      = useState(initialPaused);
  const [toggling,    setToggling]    = useState(false);

  async function togglePause() {
    setToggling(true);
    const res = await fetch("/api/kill-switch", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ active: !paused }),
    });
    if (res.ok) {
      const data = await res.json();
      setPaused(data.active);
    }
    setToggling(false);
  }

  async function addRule() {
    if (!value.trim() || !description.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/policies", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ description: description.trim(), field, operator, value: value.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to add rule");
    } else {
      const created: Policy = await res.json();
      setPolicies((prev) => [created, ...prev]);
      setValue("");
      setDescription("");
    }
    setLoading(false);
  }

  async function deleteRule(id: string) {
    setDeleting(id);
    const res = await fetch(`/api/policies?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setPolicies((prev) => prev.filter((p) => p.id !== id));
    } else {
      setError("Failed to delete rule");
    }
    setDeleting(null);
  }

  const selectStyle = {
    background: "#000",
    border: "1px solid #1a1a1a",
    color: "#aaa",
    padding: "0.5rem 0.75rem",
    fontSize: "0.75rem",
    fontFamily: "inherit",
    width: "100%",
  };

  const inputStyle = {
    ...selectStyle,
    letterSpacing: "0.05em",
  };

  return (
    <div className="space-y-6">
      {/* Emergency Pause */}
      <div
        style={{
          border:     `1px solid ${paused ? "#ff444444" : "#1a1a1a"}`,
          background: paused ? "#ff444408" : "#030303",
          transition: "border-color 200ms ease, background 200ms ease",
        }}
      >
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${paused ? "#ff444422" : "#1a1a1a"}` }}
        >
          <p className="text-xs font-mono tracking-widest uppercase" style={{ color: paused ? "#ff4444" : "#555" }}>
            EMERGENCY PAUSE
          </p>
          <span
            className="text-xs font-mono px-2 py-0.5"
            style={{
              color:      paused ? "#ff4444" : "#02f8c5",
              border:     `1px solid ${paused ? "#ff444433" : "#02f8c522"}`,
              background: paused ? "#ff444410" : "#02f8c508",
            }}
          >
            {paused ? "⊘ PAUSED" : "● OPERATIONAL"}
          </span>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-6">
          <div>
            <p className="text-xs font-mono" style={{ color: "#888" }}>
              Instantly freeze all autonomous IP licensing.
            </p>
            {paused ? (
              <p className="text-xs font-mono mt-1 font-bold" style={{ color: "#ff4444" }}>
                ALL IP LICENSING FROZEN · /api/verify-policy → 503
              </p>
            ) : (
              <p className="text-xs font-mono mt-1" style={{ color: "#444" }}>
                When active, /api/verify-policy returns 503 for all agents.
              </p>
            )}
          </div>
          <button
            onClick={togglePause}
            disabled={toggling}
            className="flex-shrink-0 text-xs font-bold tracking-widest uppercase px-5 py-2.5 transition-colors duration-150 disabled:opacity-40"
            style={paused ? {
              border:     "1px solid #02f8c544",
              color:      "#02f8c5",
              background: "#02f8c508",
            } : {
              border:     "1px solid #ff444444",
              color:      "#ff4444",
              background: "#ff444408",
            }}
          >
            {toggling ? "..." : paused ? "RESUME OPERATIONS" : "ACTIVATE EMERGENCY PAUSE"}
          </button>
        </div>
      </div>

      {/* Add rule form */}
      <div style={{ border: "1px solid #1a1a1a" }}>
        <div
          className="px-5 py-3 text-xs font-mono tracking-widest uppercase"
          style={{ borderBottom: "1px solid #1a1a1a", color: "#555" }}
        >
          ADD RULE
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-mono tracking-widest uppercase mb-1" style={{ color: "#555" }}>
                FIELD
              </label>
              <select value={field} onChange={(e) => setField(e.target.value)} style={selectStyle}>
                {FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono tracking-widest uppercase mb-1" style={{ color: "#555" }}>
                OPERATOR
              </label>
              <select value={operator} onChange={(e) => setOperator(e.target.value)} style={selectStyle}>
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono tracking-widest uppercase mb-1" style={{ color: "#555" }}>
                VALUE
              </label>
              <input
                type="text"
                placeholder="e.g. 500"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono tracking-widest uppercase mb-1" style={{ color: "#555" }}>
              DESCRIPTION
            </label>
            <input
              type="text"
              placeholder="e.g. Rev share must not exceed 10%"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={inputStyle}
            />
          </div>
          {error && (
            <p className="text-xs font-mono" style={{ color: "#ff4444" }}>{error}</p>
          )}
          <button
            onClick={addRule}
            disabled={loading || !value.trim() || !description.trim()}
            className="text-xs font-mono tracking-widest uppercase px-4 py-2 transition-colors"
            style={{
              border: "1px solid #02f8c544",
              color: loading ? "#555" : "#02f8c5",
              background: "#02f8c508",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "ADDING..." : "+ ADD RULE"}
          </button>
        </div>
      </div>

      {/* Active rules list */}
      <div style={{ border: "1px solid #1a1a1a" }}>
        <div
          className="px-5 py-3 text-xs font-mono tracking-widest uppercase"
          style={{ borderBottom: "1px solid #1a1a1a", color: "#555" }}
        >
          ACTIVE RULES — {policies.length}
        </div>
        {policies.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-xs font-mono" style={{ color: "#333" }}>
              NO RULES — all license requests will be approved
            </p>
          </div>
        ) : (
          <ul>
            {policies.map((p, idx) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-5 py-4"
                style={{ borderTop: idx > 0 ? "1px solid #0d0d0d" : undefined }}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-block px-2 py-0.5 text-xs font-mono"
                      style={{ color: "#02f8c5", border: "1px solid #02f8c522", background: "#02f8c508" }}
                    >
                      {fieldLabels[p.field] ?? p.field}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "#666" }}>
                      {OP_SYMBOLS[p.operator] ?? p.operator}
                    </span>
                    <span className="text-xs font-mono font-bold text-white">
                      {String(p.value)}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "#888" }}>{p.description}</p>
                </div>
                <button
                  onClick={() => deleteRule(p.id)}
                  disabled={deleting === p.id}
                  className="ml-4 text-xs font-mono tracking-widest uppercase px-3 py-1 flex-shrink-0 transition-colors"
                  style={{
                    border: "1px solid #ff444422",
                    color: deleting === p.id ? "#555" : "#ff4444",
                    background: "#ff444408",
                    cursor: deleting === p.id ? "not-allowed" : "pointer",
                  }}
                >
                  {deleting === p.id ? "..." : "DELETE"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
