import { createPrivateKey, createPublicKey, sign, verify } from "crypto";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";

// Maps database.json agent_id → key file name (without .pem)
const KEY_MAP: Record<string, string> = {
  "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi": "sydney-saas",
  "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354": "global-freight",
  "bafybeihkoviema7g3gxyt6la22f56eupkmzh2yw4lxnxoqkj52ql73yvf4": "cloud-ops",
  "bafybeibuyer0000acmecorp000000000000000000000000000000000001":  "buyer-acmecorp",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { agent_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const agent_id = body.agent_id;
  if (!agent_id || typeof agent_id !== "string") {
    return Response.json({ error: "agent_id is required" }, { status: 400 });
  }

  const keyName = KEY_MAP[agent_id];
  if (!keyName) {
    return Response.json({ error: `Unknown agent_id: ${agent_id}` }, { status: 400 });
  }

  const keysDir = path.join(process.cwd(), "..", "agent-keys");
  const privPemPath = path.join(keysDir, `${keyName}.pem`);

  if (!fs.existsSync(privPemPath)) {
    return Response.json({ error: `Private key not found for ${agent_id}` }, { status: 404 });
  }

  const privPem = fs.readFileSync(privPemPath);

  // Load public key from database.json
  const dbPath = path.join(process.cwd(), "..", "database.json");
  const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
  const agent = db.agents.find((a: { agent_id: string }) => a.agent_id === agent_id);

  if (!agent) {
    return Response.json({ error: `Agent not found in registry: ${agent_id}` }, { status: 404 });
  }

  const pubPem = Buffer.from(agent.public_key);
  const msg    = Buffer.from(`HANDSHAKE_TEST:${agent_id}:${Date.now()}`);

  const t0 = Date.now();

  const privKey = createPrivateKey(privPem);
  const pubKey  = createPublicKey(pubPem);
  const sig     = sign(null, msg, privKey);   // null = no digest (Ed25519 hashes internally)
  const ok      = verify(null, msg, pubKey, sig);

  return Response.json({ success: ok, elapsed_ms: Date.now() - t0 });
}
