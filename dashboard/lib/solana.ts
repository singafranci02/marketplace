import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

const rpcUrl = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");

export const connection = new Connection(rpcUrl, "confirmed");

export async function getSolBalance(pubkey: string): Promise<string> {
  try {
    const pk      = new PublicKey(pubkey);
    const lamports = await connection.getBalance(pk);
    return (lamports / LAMPORTS_PER_SOL).toFixed(4); // e.g. "0.4200"
  } catch {
    return "0.0000";
  }
}

// Returns true if the Solana transaction is confirmed or finalized.
// Returns false on timeout (5 s) or if the signature is not yet available.
export async function verifyTransaction(signature: string): Promise<boolean> {
  try {
    const result = await Promise.race([
      connection.getSignatureStatus(signature, { searchTransactionHistory: true }),
      new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 5000)),
    ]);
    const status = result?.value?.confirmationStatus;
    return status === "confirmed" || status === "finalized";
  } catch {
    return false;
  }
}
