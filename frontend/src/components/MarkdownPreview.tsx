"use client";

import { useEffect, useId, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
        if (cancelled || !ref.current) return;
        const { svg } = await mermaid.render(`mmd-${id}`, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (ref.current) ref.current.textContent = code;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  return <div ref={ref} className="lp-mermaid" style={{ overflow: "auto", margin: "12px 0" }} />;
}

export default function MarkdownPreview({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const text = String(children).replace(/\n$/, "");
          if (className?.includes("language-mermaid")) {
            return <MermaidBlock code={text} />;
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
