"use client";

import { useEffect, useRef, useState } from "react";
import type { PathReplanJob } from "@/lib/api";

function isRunningStatus(status: PathReplanJob["status"]): boolean {
  return status === "queued" || status === "running";
}

/** 将后端 UTC 时间（可能无 Z 后缀）解析为 epoch ms */
function parseUtcIsoMs(iso: string | null | undefined): number | null {
  const raw = (iso || "").trim();
  if (!raw) return null;
  const normalized =
    raw.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function computeElapsedFromStart(startMs: number): number {
  return Math.max(0, Math.floor((Date.now() - startMs) / 1000));
}

/** 服务端 elapsed 若异常偏大（如时区/脏数据），以本地 started_at 为准 */
function sanitizeServerElapsed(serverElapsed: number, localElapsed: number): number {
  const server = Math.max(0, Math.floor(serverElapsed));
  const local = Math.max(0, Math.floor(localElapsed));
  if (server <= 0) return local;
  if (server > local + 120) return local;
  return Math.max(server, local);
}

/**
 * 重规划进行中：优先用 job.started_at（UTC）本地每秒 +1；
 * 无 started_at 时从任务挂载时刻计时；结束后用服务端 elapsed_sec。
 */
export function usePathReplanElapsed(job: PathReplanJob | null | undefined): number {
  const [elapsedSec, setElapsedSec] = useState(0);
  const startMsRef = useRef<number | null>(null);
  const mountMsRef = useRef<number | null>(null);
  const lastJobIdRef = useRef<string | null>(null);
  const serverElapsedRef = useRef(0);

  useEffect(() => {
    serverElapsedRef.current = Math.max(0, job?.elapsed_sec ?? 0);
  }, [job?.elapsed_sec]);

  useEffect(() => {
    if (!job?.id) {
      setElapsedSec(0);
      startMsRef.current = null;
      mountMsRef.current = null;
      lastJobIdRef.current = null;
      return;
    }

    if (job.id !== lastJobIdRef.current) {
      lastJobIdRef.current = job.id;
      mountMsRef.current = null;
    }

    if (!isRunningStatus(job.status)) {
      const finalSec = Math.max(0, job.elapsed_sec ?? 0);
      setElapsedSec((prev) => (prev === finalSec ? prev : finalSec));
      startMsRef.current = null;
      mountMsRef.current = null;
      return;
    }

    const startedMs = parseUtcIsoMs(job.started_at);
    const mountMs = mountMsRef.current ?? Date.now();
    if (mountMsRef.current == null) {
      mountMsRef.current = mountMs;
    }
    const startMs = startedMs ?? mountMs;
    startMsRef.current = startMs;

    const tick = () => {
      const base = startMsRef.current;
      if (base == null) return;
      const localElapsed = computeElapsedFromStart(base);
      const display = sanitizeServerElapsed(serverElapsedRef.current, localElapsed);
      setElapsedSec((prev) => (prev === display ? prev : display));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, job?.started_at]);

  return elapsedSec;
}
