"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  SystemProgram,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const ACCENT = "#02f8c5";
const DIM    = "#555";
const GOLD   = "#f8c502";

const TIER_COLOR: Record<string, string> = {
  STAKED:     GOLD,
  AUDITED:    ACCENT,
  ATTESTED:   "#888",
  UNVERIFIED: "#444",
};

export interface AgentCardData {
  agent_id:      string;
  name:          string;
  solana_pubkey: string | null;
  compliance:    string[];
  joined_at:     string;
  live_sol:      string;
  earned_sol:    number;
  staked_sol:    number;
  tier:          string;
}

function shortPubkey(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

// ---------------------------------------------------------------------------

function AgentCard({ agent }: { agent: AgentCardData }) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection }                  = useConnection();
  const [funding, setFunding]           = useState(false);
  const [fundMsg,  setFundMsg]          = useState<string | null>(null);

  async function fundAgent() {
    if (!publicKey || !agent.solana_pubkey) return;
    setFunding(true);
    setFundMsg(null);
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey:   new PublicKey(agent.solana_pubkey),
          lamports:   Math.floor(0.5 * LAMPORTS_PER_SOL),
        })
      );
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setFundMsg(`✓ Funded 0.5 SOL — tx: ${sig.slice(0, 12)}…`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFundMsg(`Error: ${msg.slice(0, 80)}`);
    } finally {
      setFunding(false);
    }
  }

  return (
    <div style={{ border: "1px solid #1a1a1a", background: "#030303", padding: "20px 24px" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ color: ACCENT, fontSize: 11 }}>◈</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {agent.name}
          </span>
          <span style={{ fontSize: 10, color: "#555" }}>{agent.agent_id}</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: TIER_COLOR[agent.tier] ?? DIM }}>
          {agent.tier}
        </span>
      </div>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 24px", marginBottom: 14 }}>
        {([
          ["LIVE BALANCE",     `${agent.live_sol} SOL`],
          ["EARNED (SETTLED)", `${agent.earned_sol.toFixed(4)} SOL`],
          ["STAKED",           `${agent.staked_sol.toFixed(4)} SOL`],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Wallet + actions */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>WALLET</span>

        {agent.solana_pubkey ? (
          <>
            <span style={{ fontSize: 11, color: "#888" }}>{shortPubkey(agent.solana_pubkey)}</span>
            <a
              href={`https://explorer.solana.com/address/${agent.solana_pubkey}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: ACCENT, textDecoration: "none" }}
            >
              VIEW ON EXPLORER →
            </a>

            {/* Fund button — requires Phantom connected */}
            {publicKey ? (
              <button
                onClick={fundAgent}
                disabled={funding}
                style={{
                  fontSize:      10,
                  fontWeight:    700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color:         funding ? DIM : GOLD,
                  border:        `1px solid ${funding ? DIM : GOLD}44`,
                  background:    "transparent",
                  padding:       "5px 12px",
                  cursor:        funding ? "not-allowed" : "pointer",
                  fontFamily:    "monospace",
                }}
              >
                {funding ? "SENDING…" : "FUND 0.5 SOL"}
              </button>
            ) : (
              <span style={{ fontSize: 9, color: DIM }}>connect wallet to fund</span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11, color: DIM }}>—</span>
        )}
      </div>

      {/* Fund status message */}
      {fundMsg && (
        <p style={{ marginTop: 8, fontSize: 10, color: fundMsg.startsWith("✓") ? ACCENT : "#f84902", fontFamily: "monospace" }}>
          {fundMsg}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function AccountPortfolio({ agents }: { agents: AgentCardData[] }) {
  const { connected } = useWallet();

  return (
    <div style={{ marginTop: 48, fontFamily: "monospace" }}>
      <p style={{ fontSize: 10, color: ACCENT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 }}>
        MY AGENTS
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 8px", color: "#fff" }}>
        PORTFOLIO
      </h2>

      {/* Wallet connect strip */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <WalletMultiButton
          style={{
            background:    "transparent",
            border:        `1px solid ${connected ? ACCENT : "#333"}`,
            color:         connected ? ACCENT : "#888",
            fontFamily:    "monospace",
            fontSize:      10,
            fontWeight:    700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding:       "7px 14px",
            height:        "auto",
            borderRadius:  0,
          }}
        />
        {connected && (
          <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            PHANTOM CONNECTED · DEVNET
          </span>
        )}
      </div>

      {agents.length === 0 ? (
        <div style={{ border: "1px solid #1a1a1a", background: "#030303", padding: "20px 24px" }}>
          <p style={{ fontSize: 13, color: "#888" }}>No agents registered yet.</p>
          <p style={{ marginTop: 8, fontSize: 11, color: DIM }}>
            Register your first agent to start selling IP:
          </p>
          <div style={{ marginTop: 12 }}>
            <Link
              href="/sell"
              style={{
                display:       "inline-block",
                fontSize:      11,
                fontWeight:    700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color:         ACCENT,
                border:        `1px solid ${ACCENT}33`,
                padding:       "7px 14px",
                textDecoration: "none",
              }}
            >
              VIEW ONBOARDING GUIDE →
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {agents.map((agent) => (
            <AgentCard key={agent.agent_id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
