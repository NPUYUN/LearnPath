"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { normalizeMarkdownForDisplay, repairMermaidCode } from "@/lib/markdownNormalize";

function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const repaired = useMemo(() => repairMermaidCode(code), [code]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "loose",
          flowchart: {
            htmlLabels: true,
            curve: "basis",
            padding: 12,
            nodeSpacing: 50,
            rankSpacing: 50,
          },
          themeVariables: {
            fontSize: "14px",
            fontFamily:
              '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          },
        });
        if (cancelled || !ref.current) return;
        const uid = `mmd-${id}-${Date.now()}`;
        const { svg } = await mermaid.render(uid, repaired);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        if (ref.current) {
          const msg = err instanceof Error ? err.message : "图表渲染失败";
          ref.current.innerHTML = `<div class="lp-mermaid-fallback"><p class="lp-mermaid-fallback-title">${msg}</p><pre>${repaired.replace(/</g, "&lt;")}</pre></div>`;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repaired, id]);

  return <div ref={ref} className="lp-mermaid" aria-label="关系图解" />;
}

function childText(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) =>
      typeof c === "string"
        ? c
        : isValidElement<{ children?: ReactNode }>(c)
          ? childText(c.props.children)
          : ""
    )
    .join("");
}

const components: Components = {
  h1: ({ children }) => <h1 className="lp-md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="lp-md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="lp-md-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="lp-md-h4">{children}</h4>,
  p: ({ children }) => <p className="lp-md-p">{children}</p>,
  ul: ({ children }) => <ul className="lp-md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="lp-md-ol">{children}</ol>,
  li: ({ children }) => <li className="lp-md-li">{children}</li>,
  blockquote: ({ children }) => <blockquote className="lp-md-blockquote">{children}</blockquote>,
  table: ({ children }) => (
    <div className="lp-md-table-wrap">
      <table className="lp-md-table">{children}</table>
    </div>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="lp-md-link">
      {children}
    </a>
  ),
  pre: ({ children }) => {
    const child = Children.only(children) as ReactElement<{
      className?: string;
      children?: ReactNode;
    }>;
    const cls = child?.props?.className || "";
    if (cls.includes("language-mermaid")) {
      return <MermaidBlock code={childText(child.props.children)} />;
    }
    if (/language-mermaid/.test(childText(children))) {
      return <MermaidBlock code={childText(children)} />;
    }
    return <pre className="lp-md-pre">{children}</pre>;
  },
  code: ({ className, children, ...props }) => {
    const text = String(children).replace(/\n$/, "");
    const isBlock = className?.includes("language-");
    const lang = className?.replace("language-", "") || "";

    if (lang === "mermaid") {
      return <code className="lp-md-mermaid-src" {...props}>{children}</code>;
    }

    if (isBlock) {
      return (
        <code className={`lp-md-code-block language-${lang}`} {...props}>
          {children}
        </code>
      );
    }

    return (
      <code className="lp-md-code-inline" {...props}>
        {children}
      </code>
    );
  },
};

export default function MarkdownPreview({ content }: { content: string }) {
  const normalized = useMemo(() => normalizeMarkdownForDisplay(content), [content]);

  return (
    <div className="lp-markdown-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
