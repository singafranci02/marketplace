import { notFound } from "next/navigation";
import Link from "next/link";
import { Nav } from "../../components/Nav";
import { articles } from "../articles";
import type { Metadata } from "next";

export async function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) return {};
  return {
    title: `${article.title} — AgentMarket`,
    description: article.description,
  };
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  return (
    <div style={{ border: "1px solid #1a1a1a", background: "#000" }} className="my-4">
      <div
        className="px-4 py-1.5 text-xs font-mono uppercase tracking-widest"
        style={{ borderBottom: "1px solid #1a1a1a", color: "#444" }}
      >
        {lang}
      </div>
      <pre
        className="p-4 overflow-x-auto text-xs font-mono leading-relaxed"
        style={{ color: "#aaa" }}
      >
        <code>{text}</code>
      </pre>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  return (
    <>
      <Nav />
      <main className="px-6 py-16 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link
            href="/learn"
            className="text-xs font-mono tracking-widest uppercase transition-colors duration-150"
            style={{ color: "#555" }}
          >
            ← LEARN
          </Link>
        </div>

        {/* Article header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 flex-wrap mb-4">
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
          <h1 className="text-3xl font-black uppercase tracking-tight mb-3">
            {article.title}
          </h1>
          <p className="text-sm mb-4" style={{ color: "#aaa", lineHeight: 1.7 }}>
            {article.description}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono" style={{ color: "#444" }}>
              {formatDate(article.date)}
            </span>
            <span className="text-xs font-mono" style={{ color: "#444" }}>·</span>
            <span className="text-xs font-mono" style={{ color: "#444" }}>
              {article.readingTime}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #1a1a1a" }} className="mb-10" />

        {/* Article body */}
        <article className="space-y-10">
          {article.body.map((section) => (
            <section key={section.heading}>
              <h2
                className="text-sm font-bold uppercase tracking-widest mb-3"
                style={{ color: "#02f8c5" }}
              >
                {section.heading}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#aaa" }}>
                {section.content}
              </p>
              {section.code && (
                <CodeBlock lang={section.code.lang} text={section.code.text} />
              )}
            </section>
          ))}
        </article>

        {/* Footer navigation */}
        <div style={{ borderTop: "1px solid #1a1a1a" }} className="mt-12 pt-8">
          <Link
            href="/learn"
            className="text-xs font-mono tracking-widest uppercase transition-colors duration-150"
            style={{ color: "#555" }}
          >
            ← ALL ARTICLES
          </Link>
        </div>
      </main>
    </>
  );
}
