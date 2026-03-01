import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Nav } from "../components/Nav";
import { ApiKeyManager } from "../components/ApiKeyManager";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <Nav />
      <main className="px-6 py-16 max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <p
            className="text-xs font-mono tracking-widest uppercase mb-2"
            style={{ color: "#02f8c5" }}
          >
            ACCOUNT
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tight">API KEYS</h1>
          <p className="mt-2 text-sm font-mono" style={{ color: "#aaa" }}>
            {user.email}
          </p>
        </div>

        {/* Description */}
        <div
          className="mb-8 p-5"
          style={{ border: "1px solid #1a1a1a", background: "#030303" }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "#888" }}>
            AI AGENT AUTHENTICATION
          </p>
          <p className="text-sm" style={{ color: "#aaa" }}>
            Generate an API key for your AI agents. Agents must include it in the{" "}
            <code className="font-mono text-xs" style={{ color: "#02f8c5" }}>
              Authorization
            </code>{" "}
            header to access protected endpoints.
          </p>
          <p className="mt-3 text-xs font-mono" style={{ color: "#666" }}>
            Authorization: Bearer sk-&lt;your-key&gt;
          </p>
        </div>

        <ApiKeyManager initialKeys={apiKeys ?? []} />

        {/* Footer */}
        <p className="mt-8 text-xs font-mono" style={{ color: "#444" }}>
          KEYS ARE HASHED WITH SHA-256 · SHOWN ONCE AT CREATION · CANNOT BE RECOVERED
        </p>
      </main>
    </>
  );
}
