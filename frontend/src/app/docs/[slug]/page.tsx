import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND_TITLE } from "@/lib/brand";
import MarkdownRenderer from "@/components/docs/MarkdownRenderer";
import { getAllDocSlugs, getDocBySlug } from "@/lib/docs/manifest";
import { docExists, readDocContent } from "@/lib/docs/server";

export const dynamic = "force-static";

type DocPageProps = {
  params: { slug: string };
};

export function generateStaticParams() {
  return getAllDocSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: DocPageProps): Metadata {
  const entry = getDocBySlug(params.slug);
  if (!entry) return { title: `文档 · ${BRAND_TITLE}` };
  return {
    title: `${entry.title} · ${BRAND_TITLE}`,
    description: entry.description ?? `${entry.title} — ${BRAND_TITLE} 项目文档`,
  };
}

export default function DocArticlePage({ params }: DocPageProps) {
  const entry = getDocBySlug(params.slug);
  if (!entry || !docExists(params.slug)) notFound();

  const content = readDocContent(entry);

  return (
    <article className="lp-docs-article">
      <MarkdownRenderer content={content} />
    </article>
  );
}
