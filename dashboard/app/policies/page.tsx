import { createClient } from "@/lib/supabase/server";
import { PolicyManager } from "../components/PolicyManager";
import { Nav } from "../components/Nav";

export interface Policy {
  id: string;
  description: string;
  field: string;
  operator: string;
  value: unknown;
  active: boolean;
  created_at: string;
}

async function getPolicies(): Promise<Policy[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policies")
    .select("id, description, field, operator, value, active, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });
  return (data as Policy[]) ?? [];
}

async function getKillSwitch(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kill_switch")
    .select("active")
    .eq("id", 1)
    .single();
  return data?.active ?? false;
}

const FIELD_LABELS: Record<string, string> = {
  "terms.price_usd_monthly":        "Monthly Price (USD)",
  "terms.seats":                    "Seats",
  "terms.trial_days":               "Trial Days",
  "parties.seller.legal_entity_id": "Seller Entity ID",
};

export default async function PoliciesPage() {
  const [policies, paused] = await Promise.all([getPolicies(), getKillSwitch()]);
  const fieldsCovered = new Set(policies.map((p) => p.field)).size;

  return (
    <>
      <Nav />
      <main className="px-6 py-16 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: "#02f8c5" }}>
            POLICY ENGINE
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tight">DEAL RULES</h1>
          <p className="mt-2 text-sm" style={{ color: "#aaa" }}>
            Rules evaluated before every deal is signed. If any rule fails, the agent is
            blocked from signing — no code changes required.
          </p>
        </div>

        {/* KPI strip */}
        <div className="mb-8 grid grid-cols-2 gap-4">
          {[
            { label: "ACTIVE RULES",    value: policies.length },
            { label: "FIELDS COVERED",  value: fieldsCovered },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="px-5 py-4"
              style={{ border: "1px solid #1a1a1a", background: "#030303" }}
            >
              <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "#888" }}>
                {label}
              </p>
              <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
            </div>
          ))}
        </div>

        <PolicyManager initialPolicies={policies} fieldLabels={FIELD_LABELS} initialPaused={paused} />

        <p className="mt-8 text-xs font-mono" style={{ color: "#666" }}>
          EVALUATED AT SIGN TIME · ENDPOINT: /api/verify-policy · STORAGE: Supabase policies
        </p>
      </main>
    </>
  );
}
