"use client";

import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";

const ProfileContent = dynamic(
  () => import("@/components/pages/ProfileContent"),
  { loading: () => <PageSkeleton /> }
);

export default function ProfilePage() {
  return <ProfileContent />;
}
