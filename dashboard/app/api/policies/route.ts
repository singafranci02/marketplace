import { createClient } from "@/lib/supabase/server";

const ALLOWED_FIELDS = [
  "terms.price_usd_monthly",
  "terms.seats",
  "terms.trial_days",
  "parties.seller.legal_entity_id",
];

const ALLOWED_OPERATORS = [
  "lte", "gte", "lt", "gt", "eq", "neq", "contains", "not_contains",
];

// ---------------------------------------------------------------------------
// GET — list all active policies
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("policies")
    .select("id, description, field, operator, value, active, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Failed to fetch policies" }, { status: 500 });
  }

  return Response.json(data);
}

// ---------------------------------------------------------------------------
// POST — create a new policy rule
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { description?: string; field?: string; operator?: string; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  const field       = typeof body.field       === "string" ? body.field.trim()       : "";
  const operator    = typeof body.operator    === "string" ? body.operator.trim()    : "";
  const value       = body.value;

  if (!description || description.length > 200) {
    return Response.json({ error: "Description is required (max 200 chars)" }, { status: 400 });
  }
  if (!ALLOWED_FIELDS.includes(field)) {
    return Response.json({ error: `Field must be one of: ${ALLOWED_FIELDS.join(", ")}` }, { status: 400 });
  }
  if (!ALLOWED_OPERATORS.includes(operator)) {
    return Response.json({ error: `Operator must be one of: ${ALLOWED_OPERATORS.join(", ")}` }, { status: 400 });
  }
  if (value === undefined || value === null || value === "") {
    return Response.json({ error: "Value is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("policies")
    .insert({ description, field, operator, value, active: true, created_by: user.id })
    .select("id, description, field, operator, value, active, created_at")
    .single();

  if (error) {
    return Response.json({ error: "Failed to create policy" }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}

// ---------------------------------------------------------------------------
// DELETE — deactivate a policy by id (?id=uuid)
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // Set active = false (soft delete so audit trail is preserved)
  const { error } = await supabase
    .from("policies")
    .update({ active: false })
    .eq("id", id);

  if (error) {
    return Response.json({ error: "Failed to delete policy" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
