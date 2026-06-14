"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import PathRefreshOverlay from "@/components/PathRefreshOverlay";
import { usePathReplanElapsed } from "@/hooks/usePathReplanElapsed";
import { useAppStore } from "@/store/appStore";

export default function PathReplanProgressHost() {
  const job = useAppStore((s) => s.pathReplanJob);
  const panelMode = useAppStore((s) => s.pathReplanPanelMode);
  const fading = useAppStore((s) => s.pathReplanFading);
  const setPanelMode = useAppStore((s) => s.setPathReplanPanelMode);
  const elapsedSec = usePathReplanElapsed(job);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !job) return null;
  const running = job.status === "queued" || job.status === "running";
  if (panelMode !== "fullscreen" || !running) return null;

  const subPhases = job.sub_phases?.map((p) => ({
    label: p.label,
    status: p.status,
  }));

  return createPortal(
    <div className="lp-path-replan-fullscreen-host">
      <PathRefreshOverlay
        progress={job.progress}
        stepIndex={job.step_index}
        fading={fading}
        subPhases={subPhases}
        elapsedSec={elapsedSec}
        resultSummary={job.result_summary || undefined}
        onMinimize={() => setPanelMode("open")}
      />
    </div>,
    document.body,
  );
}
