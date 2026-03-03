"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface NavLink { label: string; href: string; external?: boolean; }

const PUBLIC_LINKS: NavLink[] = [
  { label: "REGISTRY", href: "/#registry" },
  { label: "SELL",     href: "/sell" },
  { label: "LEARN",    href: "/learn" },
  { label: "DOCS",     href: "/docs" },
  { label: "GITHUB",   href: "https://github.com/singafranci02/marketplace", external: true },
];

const APP_LINKS: NavLink[] = [
  { label: "DASHBOARD",     href: "/dashboard" },
  { label: "CLEARINGHOUSE", href: "/clearinghouse" },
  { label: "POLICIES",      href: "/policies" },
  { label: "LEARN",         href: "/learn" },
  { label: "DOCS",          href: "/docs" },
];

export function Nav() {
  const [user, setUser]   = useState<User | null>(null);
  const [open, setOpen]   = useState(false);
  const dropdownRef       = useRef<HTMLDivElement>(null);
  const supabase          = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <nav
      style={{ borderBottom: "1px solid #1a1a1a", background: "#000" }}
      className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-2 text-sm font-bold tracking-widest text-white uppercase"
      >
        <span style={{ color: "#02f8c5" }} aria-hidden="true">◈</span>
        AGENTMARKET
      </Link>

      {/* Links + Auth */}
      <div className="flex items-center gap-6 text-xs">
        {(user ? APP_LINKS : PUBLIC_LINKS).map(({ label, href, external }) => (
          <Link
            key={label}
            href={href}
            className="nav-link text-xs font-semibold uppercase"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {label}
          </Link>
        ))}

        {/* Auth state */}
        {user ? (
          <>
            <span style={{ borderLeft: "1px solid #1a1a1a", height: "1rem" }} />

            {/* Account dropdown */}
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => setOpen((v) => !v)}
                className="nav-link text-xs font-semibold uppercase"
                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                ACCOUNT
                <span style={{ fontSize: 8, color: "#555", marginTop: 1 }}>{open ? "▴" : "▾"}</span>
              </button>

              {open && (
                <div
                  style={{
                    position:  "absolute",
                    top:       "calc(100% + 12px)",
                    right:     0,
                    minWidth:  200,
                    background:"#050505",
                    border:    "1px solid #1a1a1a",
                    zIndex:    100,
                  }}
                >
                  {/* Email */}
                  <div
                    style={{
                      padding:     "10px 14px",
                      borderBottom:"1px solid #1a1a1a",
                    }}
                  >
                    <p style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 2, letterSpacing: "0.06em" }}>
                      SIGNED IN AS
                    </p>
                    <p style={{ fontSize: 11, color: "#888", fontFamily: "monospace", wordBreak: "break-all" }}>
                      {user.email}
                    </p>
                  </div>

                  {/* Links */}
                  <div style={{ padding: "4px 0" }}>
                    <Link
                      href="/account"
                      onClick={() => setOpen(false)}
                      style={{
                        display:     "block",
                        padding:     "8px 14px",
                        fontSize:    11,
                        fontFamily:  "monospace",
                        color:       "#aaa",
                        letterSpacing:"0.06em",
                        textDecoration:"none",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#0a0a0a")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      Account &amp; API Keys →
                    </Link>
                    <Link
                      href="/developer"
                      onClick={() => setOpen(false)}
                      style={{
                        display:     "block",
                        padding:     "8px 14px",
                        fontSize:    11,
                        fontFamily:  "monospace",
                        color:       "#aaa",
                        letterSpacing:"0.06em",
                        textDecoration:"none",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#0a0a0a")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      Developer Settings →
                    </Link>
                  </div>

                  {/* Sign out */}
                  <div style={{ borderTop: "1px solid #1a1a1a", padding: "4px 0" }}>
                    <form method="POST" action="/auth/signout">
                      <button
                        type="submit"
                        style={{
                          display:     "block",
                          width:       "100%",
                          textAlign:   "left",
                          padding:     "8px 14px",
                          fontSize:    11,
                          fontFamily:  "monospace",
                          color:       "#666",
                          letterSpacing:"0.06em",
                          background:  "none",
                          border:      "none",
                          cursor:      "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#0a0a0a")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        Sign Out
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <span style={{ borderLeft: "1px solid #1a1a1a", height: "1rem" }} />
            <Link href="/auth/login" className="nav-link text-xs font-semibold uppercase">
              SIGN IN
            </Link>
            <Link
              href="/auth/register"
              className="text-xs font-bold tracking-widest uppercase px-3 py-1 transition-colors duration-150"
              style={{ border: "1px solid #1a1a1a", color: "#aaa" }}
            >
              REGISTER
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
