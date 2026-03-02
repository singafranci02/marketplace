"use client";

import { useState } from "react";
import { ToSModal } from "./ToSModal";

interface ApiKey {
  id: string;
  name: string;
  created_at: string;
}

interface NewKeyResult {
  key: string;
  id: string;
  name: string;
}

export function ApiKeyManager({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [newKey, setNewKey] = useState<NewKeyResult | null>(null);
  const [keyName, setKeyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [showTos, setShowTos] = useState(false);

  function handleGenerateClick() {
    if (!keyName.trim()) return;
    setShowTos(true);
  }

  async function generateKey() {
    setLoading(true);
    setError(null);
    setNewKey(null);

    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName.trim(), tos_accepted: true }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to generate key");
    } else {
      const data: NewKeyResult = await res.json();
      setNewKey(data);
      setKeys((prev) => [
        { id: data.id, name: data.name, created_at: new Date().toISOString() },
        ...prev,
      ]);
      setKeyName("");
    }
    setLoading(false);
  }

  async function revokeKey(id: string) {
    setRevoking(id);
    const res = await fetch(`/api/api-keys?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k.id !== id));
    }
    setRevoking(null);
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <ToSModal
        open={showTos}
        onClose={() => setShowTos(false)}
        onAccept={() => {
          setShowTos(false);
          generateKey();
        }}
      />

      {/* New key reveal */}
      {newKey && (
        <div
          className="p-5 space-y-3"
          style={{ border: "1px solid #02f8c522", background: "#02f8c508" }}
        >
          <p
            className="text-xs font-mono tracking-widest uppercase"
            style={{ color: "#02f8c5" }}
          >
            NEW KEY GENERATED — COPY NOW, NOT SHOWN AGAIN
          </p>
          <div className="flex items-center gap-3">
            <code
              className="flex-1 text-xs font-mono text-white break-all px-3 py-3"
              style={{ background: "#000", border: "1px solid #1a1a1a" }}
            >
              {newKey.key}
            </code>
            <button
              onClick={copyKey}
              className="px-4 py-3 text-xs font-bold tracking-widest uppercase text-black bg-white hover:bg-[#02f8c5] transition-colors duration-150 whitespace-nowrap"
            >
              {copied ? "COPIED ✓" : "COPY"}
            </button>
          </div>
          <p className="text-xs font-mono" style={{ color: "#aaa" }}>
            Usage: <code style={{ color: "#02f8c5" }}>Authorization: Bearer {newKey.key.slice(0, 10)}...</code>
          </p>
        </div>
      )}

      {/* Generate form */}
      <div style={{ border: "1px solid #1a1a1a" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #1a1a1a" }}>
          <p
            className="text-xs font-mono tracking-widest uppercase"
            style={{ color: "#888" }}
          >
            GENERATE NEW KEY
          </p>
        </div>
        <div className="px-5 py-4 flex gap-3">
          <input
            type="text"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerateClick()}
            placeholder="KEY NAME  ·  e.g. production-agent"
            className="flex-1 bg-transparent text-white font-mono text-xs px-4 py-3 outline-none"
            style={{ border: "1px solid #1a1a1a" }}
          />
          <button
            onClick={handleGenerateClick}
            disabled={loading || !keyName.trim()}
            className="px-6 py-3 text-xs font-bold tracking-widest uppercase text-black bg-white hover:bg-[#02f8c5] transition-colors duration-150 disabled:opacity-40 whitespace-nowrap"
          >
            {loading ? "GENERATING..." : "GENERATE →"}
          </button>
        </div>
        {error && (
          <p className="px-5 pb-4 text-xs font-mono" style={{ color: "#ff4444" }}>
            {error}
          </p>
        )}
      </div>

      {/* Existing keys list */}
      <div style={{ border: "1px solid #1a1a1a" }}>
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid #1a1a1a" }}
        >
          <p
            className="text-xs font-mono tracking-widest uppercase"
            style={{ color: "#888" }}
          >
            ACTIVE KEYS
          </p>
          <p className="text-xs font-mono" style={{ color: "#555" }}>
            {keys.length} TOTAL
          </p>
        </div>
        {keys.length === 0 ? (
          <p
            className="px-5 py-10 text-xs font-mono text-center"
            style={{ color: "#444" }}
          >
            NO KEYS YET — GENERATE ONE ABOVE
          </p>
        ) : (
          <div>
            {keys.map((k, i) => (
              <div
                key={k.id}
                className="px-5 py-4 flex items-center justify-between"
                style={{ borderTop: i > 0 ? "1px solid #0d0d0d" : undefined }}
              >
                <div>
                  <p className="text-xs font-mono text-white">{k.name}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: "#555" }}>
                    {new Date(k.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono" style={{ color: "#333" }}>
                    sk-••••••••••••••••
                  </span>
                  <button
                    onClick={() => revokeKey(k.id)}
                    disabled={revoking === k.id}
                    className="text-xs font-bold tracking-widest uppercase px-3 py-1.5 transition-colors duration-150 disabled:opacity-40"
                    style={{ border: "1px solid #ff444433", color: "#ff4444", background: "#ff444408" }}
                  >
                    {revoking === k.id ? "REVOKING…" : "REVOKE"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
