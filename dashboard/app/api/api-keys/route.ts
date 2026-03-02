import { createClient } from "@/lib/supabase/server";
import { createHash, randomBytes } from "crypto";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name || name.length > 64) {
    return Response.json(
      { error: "Name is required (max 64 characters)" },
      { status: 400 }
    );
  }

  if (body.tos_accepted !== true) {
    return Response.json(
      { error: "Terms of Use must be accepted before generating a key" },
      { status: 403 }
    );
  }

  const rawKey = "sk-" + randomBytes(32).toString("hex");
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const { data, error } = await supabase
    .from("api_keys")
    .insert({ user_id: user.id, key_hash: keyHash, name, tos_accepted_at: new Date().toISOString() })
    .select("id, name, created_at")
    .single();

  if (error) {
    return Response.json({ error: "Failed to create key" }, { status: 500 });
  }

  return Response.json(
    { key: rawKey, id: data.id, name: data.name },
    { status: 201 }
  );
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  // Only delete keys owned by the authenticated user
  const { error } = await supabase
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return Response.json({ error: "Failed to delete key" }, { status: 500 });
  }

  return Response.json({ deleted: id });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Failed to fetch keys" }, { status: 500 });
  }

  return Response.json(data);
}
