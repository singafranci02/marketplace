"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setConfirmed(true);
    }
  }

  if (confirmed) {
    return (
      <div
        className="flex items-center justify-center min-h-screen px-6"
        style={{ background: "#000" }}
      >
        <div
          className="p-10 text-center space-y-4"
          style={{ border: "1px solid #02f8c522", background: "#02f8c508", maxWidth: "400px" }}
        >
          <p
            className="text-xs font-mono tracking-widest uppercase"
            style={{ color: "#02f8c5" }}
          >
            REGISTRATION SUCCESSFUL
          </p>
          <h2 className="text-xl font-black uppercase">CHECK YOUR EMAIL</h2>
          <p className="text-sm font-mono" style={{ color: "#aaa" }}>
            We sent a confirmation link to{" "}
            <span className="text-white">{email}</span>. Click it to activate
            your account and sign in.
          </p>
          <Link
            href="/auth/login"
            className="inline-block mt-4 px-6 py-3 text-xs font-bold tracking-widest uppercase text-black bg-white hover:bg-[#02f8c5] transition-colors duration-150"
          >
            BACK TO SIGN IN
          </Link>
        </div>
      </div>
    );
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
            CREATE ACCOUNT
          </p>
          <h1 className="text-xl font-black uppercase tracking-tight">REGISTER</h1>
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
              autoComplete="new-password"
              minLength={6}
              className="w-full bg-transparent text-white font-mono text-sm px-4 py-3 outline-none"
              style={{ border: "1px solid #1a1a1a" }}
            />
            <p className="mt-1 text-xs font-mono" style={{ color: "#555" }}>
              MIN. 6 CHARACTERS
            </p>
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
            {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT →"}
          </button>

          <p className="text-xs font-mono text-center" style={{ color: "#666" }}>
            HAVE AN ACCOUNT?{" "}
            <Link
              href="/auth/login"
              className="transition-colors"
              style={{ color: "#aaa" }}
            >
              SIGN IN
            </Link>
          </p>

          <p className="text-center" style={{ color: "#555", fontSize: "10px", fontFamily: "monospace" }}>
            By registering you agree to our{" "}
            <a href="/terms" style={{ color: "#02f8c5" }}>Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy" style={{ color: "#02f8c5" }}>Privacy Policy</a>.
          </p>
        </form>
      </div>
    </div>
  );
}
