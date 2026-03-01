"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/ledger");
      router.refresh();
    }
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen px-6"
      style={{ background: "#000" }}
    >
      <div style={{ border: "1px solid #1a1a1a", width: "100%", maxWidth: "400px" }}>
        {/* Header */}
        <div className="px-8 py-6" style={{ borderBottom: "1px solid #1a1a1a" }}>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-bold tracking-widest uppercase text-white mb-6"
          >
            <span style={{ color: "#02f8c5" }}>◈</span> AGENTMARKET
          </Link>
          <p
            className="text-xs font-mono tracking-widest uppercase mb-1"
            style={{ color: "#888" }}
          >
            HUMAN AUTHENTICATION
          </p>
          <h1 className="text-xl font-black uppercase tracking-tight">SIGN IN</h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          <div>
            <label
              className="block text-xs font-mono tracking-widest uppercase mb-2"
              style={{ color: "#888" }}
            >
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-transparent text-white font-mono text-sm px-4 py-3 outline-none"
              style={{ border: "1px solid #1a1a1a" }}
            />
          </div>

          <div>
            <label
              className="block text-xs font-mono tracking-widest uppercase mb-2"
              style={{ color: "#888" }}
            >
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-transparent text-white font-mono text-sm px-4 py-3 outline-none"
              style={{ border: "1px solid #1a1a1a" }}
            />
          </div>

          {error && (
            <p className="text-xs font-mono" style={{ color: "#ff4444" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-xs font-bold tracking-widest uppercase text-black bg-white hover:bg-[#02f8c5] transition-colors duration-150 disabled:opacity-50"
          >
            {loading ? "SIGNING IN..." : "SIGN IN →"}
          </button>

          <p className="text-xs font-mono text-center" style={{ color: "#666" }}>
            NO ACCOUNT?{" "}
            <Link
              href="/auth/register"
              className="transition-colors"
              style={{ color: "#aaa" }}
            >
              REGISTER
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
