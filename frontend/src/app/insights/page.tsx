"use client";

import dynamic from "next/dynamic";

const DataInsightsContent = dynamic(() => import("@/components/pages/DataInsightsContent"), {
  ssr: false,
});

export default function InsightsPage() {
  return <DataInsightsContent />;
}
