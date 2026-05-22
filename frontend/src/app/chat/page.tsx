"use client";

import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";

const ChatContent = dynamic(
  () => import("@/components/pages/ChatContent"),
  { loading: () => <PageSkeleton /> }
);

export default function ChatPage() {
  return <ChatContent />;
}
