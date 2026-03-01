"use client";

import { useState } from "react";

interface Capability {
  method: string;
  description: string;
}

interface Agent {
  agent_id: string;
  name: string;
  owner: string;
  legal_entity_id: string;
  public_key: string;
  capabilities: Capability[];
  compliance: string[];
  endpoint: string;
  verified: boolean;
  verification: {
    type: string;
    issued_by: string;
    issued_at: string;
    expires_at: string;
    certificate_id: string;
  };
}

type TestStatus = "idle" | "loading" | "ok" | "error";

interface CardState {
  status: TestStatus;
  elapsed_ms?: number;
  errorMsg?: string;
}

interface Props {
  agents: Agent[];
}

export function DeveloperSandbox({ agents }: Props) {
  const [states, setStates] = useState<Record<string, CardState>>(
    Object.fromEntries(agents.map((a) => [a.agent_id, { status: "idle" }]))
  );

  async function testHandshake(agent_id: string) {
    setStates((prev) => ({ ...prev, [agent_id]: { status: "loading" } }));
    try {
      const res = await fetch("/api/test-handshake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStates((prev) => ({ ...prev, [agent_id]: { status: "ok", elapsed_ms: data.elapsed_ms } }));
      } else {
        setStates((prev) => ({ ...prev, [agent_id]: { status: "error", errorMsg: data.error ?? "Verification failed" } }));
      }
    } catch (e) {
      setStates((prev) => ({ ...prev, [agent_id]: { status: "error", errorMsg: String(e) } }));
    }
  }

  return (
    <div className="space-y-4">
      {agents.map((agent) => {
        const s = states[agent.agent_id] ?? { status: "idle" };
        const methods = agent.capabilities.map((c) => c.method);
        return (
          <div key={agent.agent_id} style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
            {/* Card header */}
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid #1a1a1a" }}
            >
              <p className="text-xs font-mono tracking-widest uppercase font-bold text-white">
                {agent.name}
              </p>
              <span
                className="text-xs font-mono px-2 py-0.5"
                style={{
                  color: agent.verified ? "#02f8c5" : "#888",
                  border: `1px solid ${agent.verified ? "#02f8c522" : "#1a1a1a"}`,
                  background: agent.verified ? "#02f8c508" : "transparent",
                }}
              >
                {agent.verified ? "● VERIFIED" : "○ UNVERIFIED"}
              </span>
            </div>

            <div className="p-5 space-y-4">
              {/* Agent metadata */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  { label: "AGENT ID",      value: agent.agent_id.slice(0, 24) + "…" },
                  { label: "OWNER",         value: agent.owner },
                  { label: "LEGAL ENTITY",  value: agent.legal_entity_id },
                  { label: "ENDPOINT",      value: agent.endpoint },
                  { label: "COMPLIANCE",    value: agent.compliance.join(", ") },
                  { label: "CERT ID",       value: agent.verification.certificate_id },
                  ...(methods.length > 0
                    ? [{ label: "CAPABILITIES", value: methods.join(", ") }]
                    : []),
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "#555" }}>
                      {label}
                    </p>
                    <p className="text-xs font-mono mt-0.5 break-all" style={{ color: "#aaa" }}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Public key */}
              <div>
                <p className="text-xs font-mono tracking-widest uppercase mb-1" style={{ color: "#555" }}>
                  PUBLIC KEY (Ed25519)
                </p>
                <pre
                  className="text-xs font-mono p-3 overflow-x-auto"
                  style={{ background: "#000", border: "1px solid #111", color: "#666", lineHeight: 1.5 }}
                >
                  {agent.public_key.trim()}
                </pre>
              </div>

              {/* Test handshake */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => testHandshake(agent.agent_id)}
                  disabled={s.status === "loading"}
                  className="text-xs font-mono tracking-widest uppercase px-4 py-2 transition-colors"
                  style={{
                    border: "1px solid #02f8c544",
                    color: s.status === "loading" ? "#555" : "#02f8c5",
                    background: "#02f8c508",
                    cursor: s.status === "loading" ? "not-allowed" : "pointer",
                  }}
                >
                  {s.status === "loading" ? "TESTING..." : "TEST HANDSHAKE"}
                </button>

                {s.status === "ok" && (
                  <span className="text-xs font-mono" style={{ color: "#02f8c5" }}>
                    ✓ OK ({s.elapsed_ms}ms)
                  </span>
                )}
                {s.status === "error" && (
                  <span className="text-xs font-mono" style={{ color: "#ff4444" }}>
                    ✗ FAILED: {s.errorMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
