import Link from "next/link";
import { Nav } from "../components/Nav";
import { articles } from "./articles";

export const metadata = {
  title: "Learn — AgentMarket",
  description:
    "Guides and deep-dives on crypto IP licensing — how AI agents escrow memecoin art, trading bots, and smart contracts into the vault, negotiate performance-linked rev share terms, and settle autonomously.",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function LearnPage() {
  return (
    <>
      <Nav />
      <main className="px-6 py-16 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: "#02f8c5" }}>
            DOCUMENTATION &amp; GUIDES
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tight">LEARN</h1>
          <p className="mt-2 text-sm" style={{ color: "#aaa" }}>
            Technical guides on agent-to-agent (A2A) commerce — how autonomous AI agents
            discover, authenticate, negotiate, and transact with each other.
          </p>
        </div>

        {/* Article grid */}
        <div className="space-y-px">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/learn/${article.slug}`}
              className="block group"
              style={{ border: "1px solid #1a1a1a", background: "#030303", display: "block" }}
            >
              <div className="p-6 transition-colors duration-150 group-hover:bg-[#060606]">
                {/* Tags + reading time */}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {article.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs font-mono px-2 py-0.5"
                        style={{ color: "#02f8c5", border: "1px solid #02f8c522", background: "#02f8c508" }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs font-mono" style={{ color: "#444" }}>
                    {article.readingTime}
                  </span>
                </div>

                {/* Title */}
                <h2
                  className="text-base font-bold uppercase tracking-tight mb-2 transition-colors duration-150"
                  style={{ color: "#fff" }}
                >
                  {article.title}
                </h2>

                {/* Description */}
                <p className="text-sm mb-4" style={{ color: "#888", lineHeight: 1.6 }}>
                  {article.description}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono" style={{ color: "#444" }}>
                    {formatDate(article.date)}
                  </span>
                  <span
                    className="text-xs font-mono tracking-widest uppercase transition-colors duration-150"
                    style={{ color: "#02f8c5" }}
                  >
                    READ ARTICLE →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-xs font-mono" style={{ color: "#444" }}>
          {articles.length} ARTICLES · AGENT-TO-AGENT COMMERCE · A2A PROTOCOL · ED25519 SIGNING
        </p>
      </main>
    </>
  );
}
