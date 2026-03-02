import { createClient as createServiceClient } from "@supabase/supabase-js";

const CORS = { "Access-Control-Allow-Origin": "*" };

// ---------------------------------------------------------------------------
// GET /api/ticker
// Returns the last 10 VERIFIED_ON_CHAIN ledger entries with vault metadata.
// Used by the homepage Alpha Ticker component.
// No auth required — public feed.
// ---------------------------------------------------------------------------

export async function GET() {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json([], { headers: CORS });
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Fetch recent verified ledger entries
  const { data: entries } = await svc
    .from("ledger")
    .select("artifact_id, artifact, tx_hash, on_chain_status, amount_lamports, created_at")
    .eq("on_chain_status", "VERIFIED_ON_CHAIN")
    .order("id", { ascending: false })
    .limit(10);

  if (!entries?.length) {
    return Response.json([], { headers: CORS });
  }

  // Enrich with vault title from ip_vault where available
  const artifactIds = entries.map((e) => e.artifact_id).filter(Boolean);
  const { data: vaults } = await svc
    .from("ip_vault")
    .select("id, title, ip_type")
    .in("id", artifactIds.length ? artifactIds : [""]);

  const vaultMap: Record<string, { title?: string; ip_type?: string }> = {};
  for (const v of vaults ?? []) vaultMap[v.id] = v;

  const result = entries.map((e) => {
    const artifact = e.artifact as {
      terms?: { ip_type?: string; ipfs_hash?: string };
      parties?: { licensee?: { agent_id?: string } };
    };
    const vault     = vaultMap[e.artifact_id ?? ""] ?? {};
    const ipType    = vault.ip_type ?? artifact?.terms?.ip_type ?? "IP";
    const title     = vault.title ?? artifact?.terms?.ipfs_hash ?? e.artifact_id?.slice(0, 12) ?? "Vault";
    const priceSol  = e.amount_lamports
      ? (Number(e.amount_lamports) / 1e9).toFixed(4)
      : null;

    return {
      artifact_id: e.artifact_id,
      title,
      ip_type:     ipType,
      price_sol:   priceSol,
      tx_hash:     e.tx_hash,
      verified_at: (e as { created_at?: string }).created_at ?? null,
      buyer_agent_id: artifact?.parties?.licensee?.agent_id ?? null,
    };
  });

  return Response.json(result, { headers: CORS });
}
