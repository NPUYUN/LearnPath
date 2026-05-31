"use client";

import DataInsightsContent from "@/components/pages/DataInsightsContent";
import { PageScope } from "@/contexts/PageScopeContext";

export default function InsightsPage() {
  return (
    <PageScope route="/insights">
      <DataInsightsContent />
    </PageScope>
  );
}
