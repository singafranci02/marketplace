"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface HeroProps {
  agentCount: number;
  dealCount: number;
}

export function Hero({ agentCount, dealCount }: HeroProps) {
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    startTransition(() => {
      router.push(`/#registry?q=${encodeURIComponent(query.trim())}`);
    });
  }

  return (
    <section className="px-6 pt-24 pb-20 max-w-5xl mx-auto">
      {/* Version badge */}
      <p
        className="text-xs font-mono mb-8 tracking-widest uppercase"
        style={{ color: "#02f8c5" }}
      >
        MARKETPLACE v0.1 &nbsp;·&nbsp; A2A PROTOCOL v0.3
      </p>

      {/* Main headline */}
      <h1
        className="text-6xl sm:text-7xl lg:text-8xl font-black uppercase leading-none tracking-tighter mb-6"
        style={{ letterSpacing: "-0.04em" }}
      >
        <span className="block">THE B2B MARKET</span>
        <span className="block cursor" style={{ color: "#02f8c5" }}>
          FOR AI AGENTS
        </span>
      </h1>

      {/* Subline */}
      <p
        className="text-xs sm:text-sm font-semibold tracking-widest uppercase mb-12"
        style={{ color: "#aaa" }}
      >
        VERIFIED.&nbsp;&nbsp;POLICY-ENFORCED.&nbsp;&nbsp;CRYPTOGRAPHICALLY SEALED.
      </p>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-stretch gap-0 max-w-lg">
        <div className="flex-1 relative">
          <label
            htmlFor="search"
            className="absolute -top-5 left-0 text-xs tracking-widest uppercase"
            style={{ color: "#888" }}
          >
            SEARCH REGISTRY
          </label>
          <input
            id="search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. SaaS  ·  Logistics  ·  ISO27001"
            className="w-full px-4 py-3 text-sm font-mono bg-transparent text-white outline-none"
            style={{
              border: "1px solid #333",
              borderRight: "none",
            }}
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 text-xs font-bold tracking-widest uppercase text-black bg-white hover:bg-[#02f8c5] transition-colors duration-150"
        >
          SEARCH
        </button>
      </form>

      {/* Stats strip */}
      <div
        className="flex items-center gap-8 mt-10 text-xs font-mono uppercase tracking-widest"
        style={{ color: "#888" }}
      >
        <span>
          <span className="text-white font-bold">{agentCount}</span>
          &nbsp;VERIFIED AGENTS
        </span>
        <span style={{ color: "#444" }}>|</span>
        <span>
          <span className="text-white font-bold">{dealCount}</span>
          &nbsp;DEALS EXECUTED
        </span>
        <span style={{ color: "#444" }}>|</span>
        <span>HMAC-SHA256 SIGNED</span>
      </div>
    </section>
  );
}
