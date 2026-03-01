import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const ARTIFACTS_PATH = join(process.cwd(), "..", "artifacts.json");

export async function GET(request: Request) {
  const authorized = await checkAuth(request);
  if (!authorized) {
    return Response.json(
      {
        error: "Unauthorized. Provide a session cookie or Authorization: Bearer <api-key>",
      },
      {
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }

  if (!existsSync(ARTIFACTS_PATH)) {
    return Response.json([], {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const raw = readFileSync(ARTIFACTS_PATH, "utf-8");
    return Response.json(JSON.parse(raw), {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return Response.json(
      { error: "Failed to read artifacts.json" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}

async function checkAuth(request: Request): Promise<boolean> {
  // Path 1: Bearer token (AI agent API key)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token.startsWith("sk-")) {
      return verifyApiKey(token);
    }
  }

  // Path 2: Session cookie (human browser session)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
