"use client";

import { Skeleton } from "antd";

export default function PageSkeleton() {
  return (
    <div style={{ padding: 24, maxWidth: 1060, margin: "0 auto" }}>
      <Skeleton active paragraph={{ rows: 1 }} title={{ width: 200 }} />
      <div style={{ marginTop: 24, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        <Skeleton.Node active style={{ width: "100%", height: 120 }} />
        <Skeleton.Node active style={{ width: "100%", height: 120 }} />
        <Skeleton.Node active style={{ width: "100%", height: 120 }} />
      </div>
    </div>
  );
}
