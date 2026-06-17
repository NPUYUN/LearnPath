"use client";

import ClassroomContent from "@/components/pages/ClassroomContent";
import { PageScope } from "@/contexts/PageScopeContext";

export default function ClassroomPage() {
  return (
    <PageScope route="/classroom">
      <ClassroomContent />
    </PageScope>
  );
}
