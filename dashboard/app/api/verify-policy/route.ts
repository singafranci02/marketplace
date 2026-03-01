import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

interface Policy {
  id: string;
  description: string;
  field: string;
  operator: string;
  value: unknown;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((curr: unknown, key) => {
    if (curr === null || typeof curr !== "object") return undefined;
    return (curr as Record<string, unknown>)[key];
  }, obj);
}

function evaluateRule(policy: Policy, artifact: Record<string, unknown>): boolean {
  const actual    = getNestedValue(artifact, policy.field);
  const threshold = policy.value;
  switch (policy.operator) {
    case "lte": return Number(actual) <= Number(threshold);
    case "gte": return Number(actual) >= Number(threshold);
    case "lt":  return Number(actual) <  Number(threshold);
    case "gt":  return Number(actual) >  Number(threshold);
    case "eq":  return String(actual) === String(threshold);
    case "neq": return String(actual) !== String(threshold);
    case "contains":     return String(actual).includes(String(threshold));
    case "not_contains": return !String(actual).includes(String(threshold));
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// POST — evaluate proposed artifact against active policies
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const authorized = await checkAuth(request);
  if (!authorized) {
    return Response.json(
      { error: "Unauthorized. Provide a session cookie or Authorization: Bearer <api-key>" },
      { status: 401 }
    );
  }

  let artifact: Record<string, unknown>;
  try {
    artifact = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const svc = createServiceClient(serviceUrl, serviceKey);
  const { data: policies, error } = await svc
    .from("policies")
    .select("id, description, field, operator, value")
    .eq("active", true);

  if (error) {
    return Response.json({ error: "Failed to load policies" }, { status: 500 });
  }

  const results = (policies ?? []).map((policy) => {
    const actual = getNestedValue(artifact, policy.field);
    const passed = evaluateRule(policy, artifact);
    return {
      rule_id:     policy.id,
      description: policy.description,
      field:       policy.field,
      operator:    policy.operator,
      value:       policy.value,
      actual,
      passed,
    };
  });

  const blocked = results.filter((r) => !r.passed);

  if (blocked.length > 0) {
    const reasons = blocked.map(
      (r) => `${r.description} (${r.field} ${r.operator} ${r.value}, actual: ${r.actual})`
    );
    return Response.json(
      { decision: "BLOCKED", reasons, results },
      { status: 403 }
    );
  }

  return Response.json({ decision: "APPROVED", results });
}

// ---------------------------------------------------------------------------
// Auth helpers (Bearer sk- key or session cookie)
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
  const svc  = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc
    .from("api_keys")
    .select("id")
    .eq("key_hash", hash)
    .single();

  return !error && data !== null;
}
