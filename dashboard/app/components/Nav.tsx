"use client";

import Link from "next/link";

const links = [
  { label: "REGISTRY", href: "/#registry" },
  { label: "LEDGER",   href: "/ledger" },
  { label: "API",      href: "/#api" },
  { label: "GITHUB",   href: "https://github.com", external: true },
];

export function Nav() {
  return (
    <nav
      style={{ borderBottom: "1px solid #1a1a1a" }}
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

      {/* Links */}
      <div className="flex items-center gap-6 text-xs">
        {links.map(({ label, href, external }) => (
          <Link
            key={label}
            href={href}
            className="nav-link text-xs font-semibold uppercase"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
