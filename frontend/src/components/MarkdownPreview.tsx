"use client";

import {
  Children,
  isValidElement,
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { normalizeMarkdownForDisplay, repairMermaidCode, isMermaidLikelyComplete, purgeMermaidOrphans, buildFallbackFlowchart } from "@/lib/markdownNormalize";

function MermaidBlock({ code, streaming }: { code: string; streaming?: boolean }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const repaired = useMemo(() => repairMermaidCode(code), [code]);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    if (streaming) {
      setDebounced("");
      return;
    }
    if (!isMermaidLikelyComplete(repaired)) {
      setDebounced("");
      return;
    }
    setDebounced(repaired);
  }, [repaired, streaming]);

  useEffect(() => {
    if (streaming || !debounced || !isMermaidLikelyComplete(debounced)) return;

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
        const candidates = [debounced, buildFallbackFlowchart(debounced)];
        let svg = "";
        let lastErr: unknown;
        for (const candidate of candidates) {
          try {
            await mermaid.parse(candidate);
            svg = (await mermaid.render(`${uid}-${candidate.length}`, candidate)).svg;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!svg) throw lastErr;
        purgeMermaidOrphans();
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        purgeMermaidOrphans();
        if (ref.current && !cancelled) {
          const msg = err instanceof Error ? err.message : "图表渲染失败";
          ref.current.innerHTML = `<div class="lp-mermaid-fallback"><p class="lp-mermaid-fallback-title">${msg}</p><pre>${debounced.replace(/</g, "&lt;")}</pre></div>`;
        }
      }
    })();
    return () => {
      cancelled = true;
      purgeMermaidOrphans();
    };
  }, [debounced, id]);

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

function buildMarkdownComponents(streaming: boolean): Components {
  return {
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
        return <MermaidBlock code={childText(child.props.children)} streaming={streaming} />;
      }
      if (/language-mermaid/.test(childText(children))) {
        return <MermaidBlock code={childText(children)} streaming={streaming} />;
      }
      return <pre className="lp-md-pre">{children}</pre>;
    },
    code: ({ className, children, ...props }) => {
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
}

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

function MarkdownPreviewInner({ content }: { content: string }) {
  const normalized = useMemo(() => normalizeMarkdownForDisplay(content), [content]);
  const components = useMemo(() => buildMarkdownComponents(false), []);

  return (
    <div className="lp-markdown-preview">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownPreviewInner);
