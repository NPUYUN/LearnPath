import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DOC_FILE_TO_SLUG } from "@/lib/docs/manifest";

type MarkdownRendererProps = {
  content: string;
};

function resolveDocHref(href: string | undefined): string | null {
  if (!href) return null;
  const normalized = href.replace(/^\.\//, "").split("#")[0];
  if (!normalized.endsWith(".md")) return null;
  const file = normalized.split("/").pop() ?? normalized;
  const slug = DOC_FILE_TO_SLUG[file];
  return slug ? `/docs/${slug}` : null;
}

/** 服务端 Markdown 渲染，避免客户端 hydration 开销 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="lp-docs-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const docHref = resolveDocHref(href);
            if (docHref) {
              return <Link href={docHref}>{children}</Link>;
            }
            const external = href?.startsWith("http") || href?.startsWith("//");
            return (
              <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
