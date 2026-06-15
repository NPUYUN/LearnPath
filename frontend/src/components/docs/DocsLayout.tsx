import Link from "next/link";
import { BRAND_CN, BRAND_EN, BRAND_TITLE } from "@/lib/brand";
import { DOC_SECTIONS } from "@/lib/docs/manifest";
import DocsNav from "@/components/docs/DocsNav";

type DocsLayoutProps = {
  children: React.ReactNode;
};

export default function DocsLayout({ children }: DocsLayoutProps) {
  return (
    <div className="lp-docs-shell">
      <header className="lp-docs-topbar">
        <Link href="/" className="lp-docs-topbar-brand">
          <span className="lp-docs-topbar-cn">{BRAND_CN}</span>
          <span className="lp-docs-topbar-en">{BRAND_EN}</span>
        </Link>
        <span className="lp-docs-topbar-divider" aria-hidden />
        <span className="lp-docs-topbar-label">项目文档</span>
        <div className="lp-docs-topbar-actions">
          <Link href="/" className="lp-docs-topbar-link">
            进入系统
          </Link>
        </div>
      </header>

      <div className="lp-docs-body">
        <aside className="lp-docs-sidebar">
          <p className="lp-docs-sidebar-title">{BRAND_TITLE}</p>
          <DocsNav sections={DOC_SECTIONS} />
        </aside>
        <main className="lp-docs-main">{children}</main>
      </div>
    </div>
  );
}
