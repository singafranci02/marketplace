import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash, randomBytes, createCipheriv } from "crypto";
import { getEthBalance } from "@/lib/chain";

const DB_PATH = join(process.cwd(), "..", "database.json");
const CORS = { "Access-Control-Allow-Origin": "*" };
const VALID_TYPES = ["memecoin_art", "trading_bot", "smart_contract", "narrative"] as const;

function getVerifiedAgentIds(): Set<string> {
  if (!existsSync(DB_PATH)) return new Set();
  try {
    const db = JSON.parse(readFileSync(DB_PATH, "utf-8"));
    return new Set(
      (db.agents ?? [])
        .filter((a: { verified: boolean }) => a.verified)
        .map((a: { agent_id: string }) => a.agent_id)
    );
  } catch { return new Set(); }
}

// ---------------------------------------------------------------------------
// GET — list vaults (public, no auth)
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json([], { headers: CORS });
  }

  const { searchParams } = new URL(request.url);
  const type   = searchParams.get("type");
  const status = searchParams.get("status") ?? "active";
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const svc = createServiceClient(serviceUrl, serviceKey);
  let query = svc
    .from("ip_vault")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) query = query.eq("ip_type", type);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });

  const rows = data ?? [];

  // Fetch live on-chain ETH balances for vaults with a wallet_address
  const withBalances = await Promise.all(
    rows.map(async (row: Record<string, unknown>) => {
      if (!row.wallet_address || typeof row.wallet_address !== "string") {
        return { ...row, eth_balance: null };
      }
      try {
        const eth_balance = await getEthBalance(row.wallet_address as `0x${string}`);
        return { ...row, eth_balance };
      } catch {
        return { ...row, eth_balance: null };
      }
    })
  );

  return Response.json(withBalances, { headers: CORS });
}

// ---------------------------------------------------------------------------
// POST — escrow new IP (auth required)
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const authorized = await checkAuth(request);
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS }); }

  const { agent_id, ipfs_hash, ip_type, title, description, license_template, escrow_eth, wallet_address } = body as {
    agent_id?: string;
    ipfs_hash?: string;
    ip_type?: string;
    title?: string;
    description?: string;
    license_template?: object;
    escrow_eth?: number;
    wallet_address?: string;
  };

  if (!agent_id || !ipfs_hash || !ip_type || !title || !license_template) {
    return Response.json(
      { error: "Missing required fields: agent_id, ipfs_hash, ip_type, title, license_template" },
      { status: 400, headers: CORS }
    );
  }

  if (!VALID_TYPES.includes(ip_type as typeof VALID_TYPES[number])) {
    return Response.json(
      { error: `ip_type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400, headers: CORS }
    );
  }

  if (!getVerifiedAgentIds().has(agent_id)) {
    return Response.json(
      { error: "agent_id not found in verified registry" },
      { status: 400, headers: CORS }
    );
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  // Generate AES-256 content key for this vault entry (licensor encrypts their IPFS file with this)
  const contentKey = randomBytes(32);
  const masterKeyHex = process.env.PLATFORM_MASTER_KEY ?? "";
  let contentKeyEncrypted: string | null = null;

  if (masterKeyHex.length === 64) {
    const masterKey = Buffer.from(masterKeyHex, "hex");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(contentKey), cipher.final()]);
    const authTag = cipher.getAuthTag();
    contentKeyEncrypted = [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
  }

  const svc = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc
    .from("ip_vault")
    .insert({
      owner_agent_id:        agent_id,
      ipfs_hash,
      ip_type,
      title,
      description:           description ?? null,
      license_template,
      escrow_eth:            escrow_eth ?? 0,
      wallet_address:        wallet_address ?? null,
      content_key_encrypted: contentKeyEncrypted,
    })
    .select("id, title, ipfs_hash, ip_type, created_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });

  return Response.json(
    {
      ...data,
      content_key:      contentKey.toString("base64"),
      content_key_note: "Encrypt your IPFS file with this AES-256 key before uploading. Store it securely — it cannot be recovered from the platform.",
    },
    { status: 201, headers: CORS }
  );
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function checkAuth(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token.startsWith("sk-")) return verifyApiKey(token);
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user !== null;
}

async function verifyApiKey(key: string): Promise<boolean> {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) return false;
  const hash = createHash("sha256").update(key).digest("hex");
  const svc = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc.from("api_keys").select("id").eq("key_hash", hash).single();
  return !error && data !== null;
}
