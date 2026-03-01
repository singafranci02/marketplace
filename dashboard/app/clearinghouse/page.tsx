import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { Nav } from "../components/Nav";
import Link from "next/link";

const STATUS_COLOR: Record<string, string> = {
  pending:   "#02f8c5",
  committed: "#ffffff",
  expired:   "#444",
};

function short(id: string | null | undefined, len = 8): string {
  if (!id) return "—";
  return id.slice(0, len) + "…";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function ClearinghousePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceUrl || !serviceKey) {
    return (
      <>
        <Nav />
        <main className="px-6 py-16 max-w-5xl mx-auto">
          <p style={{ color: "#ff4444" }}>Server misconfigured.</p>
        </main>
      </>
    );
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  const [{ data: balances }, { data: reservations }, { data: transactions }] =
    await Promise.all([
      svc.from("company_balances").select("*").order("company"),
      svc.from("pending_reservations").select("*").order("created_at", { ascending: false }),
      svc.from("transactions").select("*").order("committed_at", { ascending: false }),
    ]);

  const totalBalance  = (balances ?? []).reduce((s, b) => s + Number(b.balance_usd), 0);
  const pendingCount  = (reservations ?? []).filter((r) => r.status === "pending").length;
  const committedCount = (reservations ?? []).filter((r) => r.status === "committed").length;

  return (
    <>
      <Nav />
      <main className="px-6 py-16 max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-10 flex items-start justify-between">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: "#02f8c5" }}>
              CLEARINGHOUSE
            </p>
            <h1 className="text-3xl font-black uppercase tracking-tight">ESCROW &amp; FUNDS</h1>
            <p className="mt-2 text-sm" style={{ color: "#aaa" }}>
              Virtual balances, pending reservations, and committed transactions for all buyer agents.
            </p>
          </div>
          <Link
            href="/clearinghouse"
            className="text-xs font-mono tracking-widest px-4 py-2 border transition-colors"
            style={{ borderColor: "#333", color: "#888" }}
          >
            ↻ REFRESH
          </Link>
        </div>

        {/* KPI strip */}
        <div className="mb-10 grid grid-cols-3 gap-4">
          {[
            { label: "TOTAL BALANCE",    value: `$${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD` },
            { label: "PENDING LOCKS",    value: pendingCount },
            { label: "COMMITTED DEALS",  value: committedCount },
          ].map(({ label, value }) => (
            <div key={label} className="px-5 py-4" style={{ border: "1px solid #1a1a1a", background: "#030303" }}>
              <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "#888" }}>{label}</p>
              <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Balances ── */}
        <section className="mb-12">
          <p className="text-xs font-mono tracking-widest uppercase mb-4" style={{ color: "#888" }}>
            01 — COMPANY BALANCES
          </p>
          <div className="overflow-x-auto" style={{ border: "1px solid #1a1a1a" }}>
            <table className="min-w-full text-xs font-mono">
              <thead style={{ borderBottom: "1px solid #1a1a1a" }}>
                <tr>
                  {["COMPANY", "AGENT ID", "BALANCE (USD)", "UPDATED"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left tracking-widest uppercase" style={{ color: "#555", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(balances ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: "#555" }}>No balance records</td></tr>
                ) : (balances ?? []).map((b) => (
                  <tr key={b.id} style={{ borderTop: "1px solid #0d0d0d" }}>
                    <td className="px-4 py-3 font-bold text-white">{b.company}</td>
                    <td className="px-4 py-3" style={{ color: "#666" }}>{short(b.agent_id, 16)}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: "#02f8c5" }}>
                      ${Number(b.balance_usd).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3" style={{ color: "#666" }}>{fmtDate(b.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Pending Reservations ── */}
        <section className="mb-12">
          <p className="text-xs font-mono tracking-widest uppercase mb-4" style={{ color: "#888" }}>
            02 — RESERVATIONS
          </p>
          <div className="overflow-x-auto" style={{ border: "1px solid #1a1a1a" }}>
            <table className="min-w-full text-xs font-mono">
              <thead style={{ borderBottom: "1px solid #1a1a1a" }}>
                <tr>
                  {["ID", "BUYER AGENT", "AMOUNT", "STATUS", "EXPIRES"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left tracking-widest uppercase" style={{ color: "#555", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(reservations ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: "#555" }}>No reservations yet</td></tr>
                ) : (reservations ?? []).map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #0d0d0d" }}>
                    <td className="px-4 py-3" style={{ color: "#666" }}>{short(r.id)}</td>
                    <td className="px-4 py-3" style={{ color: "#aaa" }}>{short(r.buyer_agent_id, 16)}</td>
                    <td className="px-4 py-3 font-bold text-white">
                      ${Number(r.amount_usd).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-bold uppercase" style={{ color: STATUS_COLOR[r.status] ?? "#aaa" }}>
                      {r.status}
                    </td>
                    <td className="px-4 py-3" style={{ color: "#666" }}>{fmtDate(r.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Transactions ── */}
        <section className="mb-8">
          <p className="text-xs font-mono tracking-widest uppercase mb-4" style={{ color: "#888" }}>
            03 — TRANSACTIONS
          </p>
          <div className="overflow-x-auto" style={{ border: "1px solid #1a1a1a" }}>
            <table className="min-w-full text-xs font-mono">
              <thead style={{ borderBottom: "1px solid #1a1a1a" }}>
                <tr>
                  {["ID", "BUYER", "SELLER", "AMOUNT", "ARTIFACT", "COMMITTED AT"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left tracking-widest uppercase" style={{ color: "#555", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(transactions ?? []).length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: "#555" }}>No committed transactions yet</td></tr>
                ) : (transactions ?? []).map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid #0d0d0d" }}>
                    <td className="px-4 py-3" style={{ color: "#666" }}>{short(t.id)}</td>
                    <td className="px-4 py-3" style={{ color: "#aaa" }}>{short(t.buyer_agent_id, 16)}</td>
                    <td className="px-4 py-3" style={{ color: "#aaa" }}>{short(t.seller_agent_id, 16)}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: "#02f8c5" }}>
                      ${Number(t.amount_usd).toFixed(2)}
                    </td>
                    <td className="px-4 py-3" style={{ color: "#666" }}>{short(t.artifact_id, 12)}</td>
                    <td className="px-4 py-3" style={{ color: "#666" }}>{fmtDate(t.committed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-4 text-xs font-mono" style={{ color: "#444" }}>
          VIRTUAL ESCROW · 15-MIN RESERVATION TTL · DEDUCTED ON ARTIFACT COMMIT
        </p>
      </main>
    </>
  );
}
