"use client";

import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";

const ResourcesContent = dynamic(
  () => import("@/components/pages/ResourcesContent"),
  { loading: () => <PageSkeleton /> }
);

export default function ResourcesPage() {
  return <ResourcesContent />;
}
