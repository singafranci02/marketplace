import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("kill_switch")
    .select("active, activated_at")
    .eq("id", 1)
    .single();

  if (error) {
    return Response.json({ error: "Failed to read kill switch state" }, { status: 500 });
  }

  return Response.json({ active: data?.active ?? false, activated_at: data?.activated_at ?? null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { active?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.active !== "boolean") {
    return Response.json({ error: "active (boolean) is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("kill_switch")
    .update({
      active:       body.active,
      activated_at: body.active ? new Date().toISOString() : null,
      activated_by: user.id,
    })
    .eq("id", 1)
    .select("active, activated_at")
    .single();

  if (error) {
    return Response.json({ error: "Failed to update kill switch" }, { status: 500 });
  }

  return Response.json({ active: data.active, activated_at: data.activated_at });
}
