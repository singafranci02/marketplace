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
