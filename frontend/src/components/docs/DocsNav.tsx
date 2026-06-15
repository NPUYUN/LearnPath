"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DocSection } from "@/lib/docs/manifest";

type DocsNavProps = {
  sections: DocSection[];
};

export default function DocsNav({ sections }: DocsNavProps) {
  const pathname = usePathname();

  return (
    <nav className="lp-docs-nav" aria-label="文档目录">
      {sections.map((section) => (
        <div key={section.title} className="lp-docs-nav-group">
          <p className="lp-docs-nav-group-title">{section.title}</p>
          <ul>
            {section.items.map((item) => {
              const href = `/docs/${item.slug}`;
              const active = pathname === href;
              return (
                <li key={item.slug}>
                  <Link href={href} className={active ? "is-active" : undefined} prefetch>
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
