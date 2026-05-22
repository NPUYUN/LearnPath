"use client";

import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";

const PathContent = dynamic(
  () => import("@/components/pages/PathContent"),
  { loading: () => <PageSkeleton /> }
);

export default function PathPage() {
  return <PathContent />;
}
