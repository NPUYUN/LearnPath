"use client";

import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";

const EvaluationContent = dynamic(
  () => import("@/components/pages/EvaluationContent"),
  { loading: () => <PageSkeleton /> }
);

export default function EvaluationPage() {
  return <EvaluationContent />;
}
