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
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { normalizeMarkdownForDisplay, repairMermaidCode, isMermaidLikelyComplete, purgeMermaidOrphans, buildFallbackFlowchart } from "@/lib/markdownNormalize";
import { apiUrl } from "@/lib/apiBase";

function SvgBlock({ code }: { code: string }) {
  const safe = useMemo(() => {
    const trimmed = code.trim();
    if (!/^<svg[\s>]/i.test(trimmed)) return "";
    if (/<script|on\w+\s*=|javascript:/i.test(trimmed)) return "";
    return trimmed;
  }, [code]);

  if (!safe) {
    return (
      <pre className="lp-md-pre">
        <code className="lp-md-code-block language-svg">{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="lp-svg-illustration"
      dangerouslySetInnerHTML={{ __html: safe }}
      aria-hidden={false}
    />
  );
}

function mermaidTheme(): "dark" | "neutral" {
  if (typeof document === "undefined") return "neutral";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "neutral";
}

function MermaidBlock({ code, streaming, inChat }: { code: string; streaming?: boolean; inChat?: boolean }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const repaired = useMemo(() => repairMermaidCode(code), [code]);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    if (!isMermaidLikelyComplete(repaired)) {
      setDebounced("");
      return;
    }
    setDebounced(repaired);
  }, [repaired, streaming]);

  useEffect(() => {
    if (!debounced || !isMermaidLikelyComplete(debounced)) return;

    let cancelled = false;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const theme = mermaidTheme();
        mermaid.initialize({
          startOnLoad: false,
          theme,
          securityLevel: "loose",
          flowchart: {
            htmlLabels: true,
            curve: "basis",
            padding: 16,
            nodeSpacing: 56,
            rankSpacing: 56,
          },
          themeVariables: {
            fontSize: "14px",
            fontFamily:
              '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
            ...(theme === "dark"
              ? {
                  primaryColor: "#312e81",
                  primaryTextColor: "#e2e8f0",
                  primaryBorderColor: "#6366f1",
                  lineColor: "#818cf8",
                  secondaryColor: "#1e293b",
                  tertiaryColor: "#0f172a",
                }
              : {}),
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

  return <div ref={ref} className={`lp-mermaid${inChat ? " lp-mermaid--chat" : ""}`} aria-label="关系图解" />;
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

function buildMarkdownComponents(streaming: boolean, inChat?: boolean): Components {
  return {
    h1: ({ children }) => <h1 className="lp-md-h1">{children}</h1>,
    h2: ({ children }) => <h2 className="lp-md-h2">{children}</h2>,
    h3: ({ children }) => <h3 className="lp-md-h3">{children}</h3>,
    h4: ({ children }) => <h4 className="lp-md-h4">{children}</h4>,
    p: ({ children }) => <p className="lp-md-p">{children}</p>,
    ul: ({ children }) => <ul className="lp-md-ul">{children}</ul>,
    ol: ({ children }) => <ol className="lp-md-ol">{children}</ol>,
    li: ({ children }) => <li className="lp-md-li">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className={`lp-md-blockquote${inChat ? " lp-md-blockquote--chat" : ""}`}>
        {children}
      </blockquote>
    ),
    hr: () => <hr className="lp-md-hr" />,
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
    img: ({ src, alt }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt || ""} className="lp-md-image" loading="lazy" />
    ),
    pre: ({ children }) => {
      const child = Children.only(children) as ReactElement<{
        className?: string;
        children?: ReactNode;
      }>;
      const cls = child?.props?.className || "";
      if (cls.includes("language-mermaid")) {
        return <MermaidBlock code={childText(child.props.children)} streaming={streaming} inChat={inChat} />;
      }
      if (cls.includes("language-svg")) {
        return <SvgBlock code={childText(child.props.children)} />;
      }
      if (cls.includes("language-video")) {
        const raw = childText(child.props.children).trim();
        const src = raw.startsWith("/") ? apiUrl(raw) : raw;
        return (
          <video
            className="lp-md-video"
            src={src}
            controls
            playsInline
            preload="metadata"
          />
        );
      }
      if (/language-mermaid/.test(childText(children))) {
        return <MermaidBlock code={childText(children)} streaming={streaming} inChat={inChat} />;
      }
      return <pre className="lp-md-pre">{children}</pre>;
    },
    code: ({ className, children, ...props }) => {
      const isBlock = className?.includes("language-");
      const lang = className?.replace("language-", "") || "";

      if (lang === "mermaid") {
        return <code className="lp-md-mermaid-src" {...props}>{children}</code>;
      }

      if (lang === "svg") {
        return <code className="lp-md-svg-src" {...props}>{children}</code>;
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

const REMARK_PLUGINS = [remarkGfm, remarkBreaks, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];

function MarkdownPreviewInner({
  content,
  variant = "default",
  streaming = false,
}: {
  content: string;
  variant?: "chat" | "default";
  streaming?: boolean;
}) {
  const normalized = useMemo(() => normalizeMarkdownForDisplay(content), [content]);
  const inChat = variant === "chat";
  const components = useMemo(
    () => buildMarkdownComponents(streaming, inChat),
    [streaming, inChat]
  );

  return (
    <div
      className={`lp-markdown-preview${inChat ? " lp-markdown-preview--chat" : ""}${streaming ? " lp-markdown-preview--streaming" : ""}`}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownPreviewInner);
