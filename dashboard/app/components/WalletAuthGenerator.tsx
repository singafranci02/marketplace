"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

const ACCENT = "#02f8c5";
const DIM    = "#555";
const GOLD   = "#f8c502";

// ---------------------------------------------------------------------------
// WalletAuthGenerator
//
// Allows an agent (or human) to generate an API key by signing a challenge
// with their Solana wallet — no email signup required.
//
// Flow:
//   1. POST /api/auth/wallet-challenge → { nonce, message }
//   2. wallet.signMessage(message)     → signature bytes
//   3. POST /api/auth/wallet-verify    → { api_key, expires_at }
//   4. Display key (shown once)
// ---------------------------------------------------------------------------

export function WalletAuthGenerator() {
  const { publicKey, signMessage, connected } = useWallet();
  const [step,       setStep]       = useState<"idle" | "signing" | "done" | "error">("idle");
  const [apiKey,     setApiKey]     = useState<string | null>(null);
  const [expiresAt,  setExpiresAt]  = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [errMsg,     setErrMsg]     = useState<string | null>(null);

  async function generateKey() {
    if (!publicKey || !signMessage) return;
    setStep("signing");
    setErrMsg(null);

    try {
      // 1. Get challenge nonce
      const challengeRes = await fetch("/api/auth/wallet-challenge", { method: "POST" });
      const challenge    = await challengeRes.json() as { nonce: string; message: string; error?: string };
      if (!challengeRes.ok || challenge.error) throw new Error(challenge.error ?? "Challenge failed");

      // 2. Sign the message with Phantom
      const messageBytes = new TextEncoder().encode(challenge.message);
      const sigBytes     = await signMessage(messageBytes);

      // 3. Encode signature as base64url
      const sigBase64 = Buffer.from(sigBytes).toString("base64url");

      // 4. Verify + get key
      const verifyRes = await fetch("/api/auth/wallet-verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          pubkey:    publicKey.toBase58(),
          signature: sigBase64,
          nonce:     challenge.nonce,
        }),
      });
      const result = await verifyRes.json() as { api_key?: string; expires_at?: string; error?: string };
      if (!verifyRes.ok || result.error) throw new Error(result.error ?? "Verification failed");

      setApiKey(result.api_key ?? null);
      setExpiresAt(result.expires_at ?? null);
      setStep("done");
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  async function copyKey() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!connected) {
    return (
      <div style={{ padding: "14px 0", fontSize: 11, color: DIM, fontFamily: "monospace" }}>
        Connect your Phantom wallet above to generate an API key without email sign-up.
      </div>
    );
  }

  if (step === "done" && apiKey) {
    return (
      <div style={{ border: "1px solid #1a1a1a", background: "#030303", padding: "20px 24px", marginTop: 12 }}>
        <p style={{ fontSize: 9, color: ACCENT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>
          WALLET API KEY — SHOWN ONCE
        </p>
        <div style={{
          background:   "#000",
          border:       "1px solid #111",
          padding:      "12px 16px",
          fontFamily:   "monospace",
          fontSize:     11,
          color:        "#ccc",
          wordBreak:    "break-all",
          marginBottom: 12,
        }}>
          {apiKey}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={copyKey}
            style={{
              fontSize:      10,
              fontWeight:    700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color:         copied ? "#888" : ACCENT,
              border:        `1px solid ${copied ? "#333" : ACCENT + "44"}`,
              background:    "transparent",
              padding:       "6px 14px",
              cursor:        "pointer",
              fontFamily:    "monospace",
            }}
          >
            {copied ? "COPIED ✓" : "COPY KEY"}
          </button>
          {expiresAt && (
            <span style={{ fontSize: 9, color: DIM }}>
              EXPIRES {new Date(expiresAt).toLocaleDateString()} · 30-DAY TTL
            </span>
          )}
        </div>
        <p style={{ marginTop: 10, fontSize: 9, color: "#444" }}>
          This key cannot be recovered after this screen. Store it securely.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      {step === "error" && errMsg && (
        <p style={{ fontSize: 10, color: "#f84902", fontFamily: "monospace", marginBottom: 8 }}>
          {errMsg}
        </p>
      )}
      <button
        onClick={generateKey}
        disabled={step === "signing"}
        style={{
          fontSize:      11,
          fontWeight:    700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color:         step === "signing" ? DIM : GOLD,
          border:        `1px solid ${step === "signing" ? DIM : GOLD + "44"}`,
          background:    "transparent",
          padding:       "8px 18px",
          cursor:        step === "signing" ? "not-allowed" : "pointer",
          fontFamily:    "monospace",
        }}
      >
        {step === "signing" ? "WAITING FOR PHANTOM…" : "GENERATE KEY WITH WALLET →"}
      </button>
      <p style={{ marginTop: 8, fontSize: 9, color: DIM }}>
        Signs a one-time challenge — no email, no form. 30-day TTL.
      </p>
    </div>
  );
}
