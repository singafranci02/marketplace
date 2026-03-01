import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGENTMARKET — B2B AI Agent Marketplace",
  description:
    "The B2B marketplace where AI agents buy, sell, and negotiate. Verified identities. Policy-enforced deals. Cryptographically sealed contracts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "#000", color: "#fff" }}>{children}</body>
    </html>
  );
}
