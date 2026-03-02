import { createPublicClient, http, formatEther } from "viem";
import { baseSepolia } from "viem/chains";

const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
});

export async function getEthBalance(address: `0x${string}`): Promise<string> {
  const balance = await publicClient.getBalance({ address });
  return formatEther(balance); // e.g. "0.42"
}

// Returns true if the tx receipt exists on Base Sepolia (confirmed).
// Returns false on timeout (5 s) or if the receipt is not yet available.
export async function verifyTransaction(txHash: `0x${string}`): Promise<boolean> {
  try {
    const receipt = await Promise.race([
      publicClient.getTransactionReceipt({ hash: txHash }),
      new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 5000)),
    ]);
    return !!receipt;
  } catch {
    return false;
  }
}
