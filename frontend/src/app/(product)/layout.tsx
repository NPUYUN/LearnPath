import { AntdRegistry } from "@ant-design/nextjs-registry";
import AppShell from "@/components/AppShell";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
