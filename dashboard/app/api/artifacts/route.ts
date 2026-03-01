import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { verify as cryptoVerify, createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const ARTIFACTS_PATH = join(process.cwd(), "..", "artifacts.json");
const DB_PATH        = join(process.cwd(), "..", "database.json");

// ---------------------------------------------------------------------------
// Key-sorting utility — must match Python's json.dumps(sort_keys=True)
// ---------------------------------------------------------------------------

function sortKeysDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.keys(obj as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeysDeep((obj as Record<string, unknown>)[k])])
    );
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Ed25519 signature verification
// ---------------------------------------------------------------------------

interface ArtifactSignatures {
  algorithm: string;
  buyer_signature: string;
  seller_signature: string;
}

interface Artifact {
  signatures?: ArtifactSignatures;
  parties?: {
    buyer?: { agent_id?: string };
    seller?: { agent_id?: string };
  };
  [key: string]: unknown;
}

function canonicalBody(artifact: Artifact): Buffer {
  // Exclude signatures field — matches Python's canonical_body()
  const { signatures: _sig, ...rest } = artifact;
  void _sig;
  return Buffer.from(JSON.stringify(sortKeysDeep(rest)));
}

function verifyArtifact(
  artifact: Artifact,
  agentMap: Record<string, string>
): boolean {
  if (artifact.signatures?.algorithm !== "Ed25519") return false;

  const body     = canonicalBody(artifact);
  const buyerId  = artifact.parties?.buyer?.agent_id;
  const sellerId = artifact.parties?.seller?.agent_id;
  const buyerKey = buyerId  ? agentMap[buyerId]  : undefined;
  const sellerKey = sellerId ? agentMap[sellerId] : undefined;

  if (!buyerKey || !sellerKey) return false;

  try {
    const buyerOk = cryptoVerify(
      null,
      body,
      buyerKey,
      Buffer.from(artifact.signatures.buyer_signature, "base64url")
    );
    const sellerOk = cryptoVerify(
      null,
      body,
      sellerKey,
      Buffer.from(artifact.signatures.seller_signature, "base64url")
    );
    return buyerOk && sellerOk;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authorized = await checkAuth(request);
  if (!authorized) {
    return Response.json(
      { error: "Unauthorized. Provide a session cookie or Authorization: Bearer <api-key>" },
      { status: 401, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  // Build agent_id → public_key map from database.json
  const agentMap: Record<string, string> = {};
  if (existsSync(DB_PATH)) {
    try {
      const db = JSON.parse(readFileSync(DB_PATH, "utf-8"));
      for (const agent of db.agents ?? []) {
        if (agent.agent_id && agent.public_key) {
          agentMap[agent.agent_id] = agent.public_key;
        }
      }
    } catch { /* ignore parse errors */ }
  }

  if (!existsSync(ARTIFACTS_PATH)) {
    return Response.json([], { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const raw: Artifact[] = JSON.parse(readFileSync(ARTIFACTS_PATH, "utf-8"));
    const result = raw.map((a) => ({
      ...a,
      verified: verifyArtifact(a, agentMap),
    }));
    return Response.json(result, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch {
    return Response.json(
      { error: "Failed to read artifacts.json" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}

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
  const serviceClient = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await serviceClient
    .from("api_keys")
    .select("id")
    .eq("key_hash", hash)
    .single();

  return !error && data !== null;
}
