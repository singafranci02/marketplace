"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface NavLink { label: string; href: string; external?: boolean; }

const PUBLIC_LINKS: NavLink[] = [
  { label: "REGISTRY", href: "/#registry" },
  { label: "DOCS",     href: "/docs" },
  { label: "GITHUB",   href: "https://github.com/singafranci02/marketplace", external: true },
];

const APP_LINKS: NavLink[] = [
  { label: "LEDGER",        href: "/ledger" },
  { label: "CLEARINGHOUSE", href: "/clearinghouse" },
  { label: "POLICIES",      href: "/policies" },
  { label: "DEVELOPER",     href: "/developer" },
  { label: "DOCS",          href: "/docs" },
];

export function Nav() {
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();

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

  const truncatedEmail = user?.email
    ? user.email.length > 22
      ? user.email.slice(0, 19) + "..."
      : user.email
    : null;

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
            <Link href="/account" className="nav-link text-xs font-semibold uppercase">
              ACCOUNT
            </Link>
            <span className="text-xs font-mono" style={{ color: "#555" }}>
              {truncatedEmail}
            </span>
            <form method="POST" action="/auth/signout">
              <button type="submit" className="nav-link text-xs font-semibold uppercase">
                SIGN OUT
              </button>
            </form>
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
