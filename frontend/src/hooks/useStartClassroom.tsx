"use client";

import { clientNavigate } from "@/lib/clientNav";
import { useAppStore, type ClassroomSessionSeed } from "@/store/appStore";

export function useStartClassroom() {
  const setPendingClassroomSession = useAppStore((s) => s.setPendingClassroomSession);

  const startClassroom = (seed: ClassroomSessionSeed) => {
    setPendingClassroomSession(seed);
    clientNavigate("/classroom");
  };

  return { startClassroom, contextHolder: null };
}
