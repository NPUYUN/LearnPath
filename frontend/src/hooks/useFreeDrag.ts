"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const DEFAULT_MARGIN = 28;
const VIEWPORT_PADDING = 8;
const DRAG_THRESHOLD = 4;

type Point = { x: number; y: number };

function loadPosition(storageKey: string): Point | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Point;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed;
  } catch {
    sessionStorage.removeItem(storageKey);
  }
  return null;
}

function clampPosition(x: number, y: number, width: number, height: number): Point {
  const maxX = Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING);
  const maxY = Math.max(VIEWPORT_PADDING, window.innerHeight - height - VIEWPORT_PADDING);
  return {
    x: Math.min(maxX, Math.max(VIEWPORT_PADDING, x)),
    y: Math.min(maxY, Math.max(VIEWPORT_PADDING, y)),
  };
}

function defaultBottomRight(width: number, height: number): Point {
  return clampPosition(
    window.innerWidth - width - DEFAULT_MARGIN,
    window.innerHeight - height - DEFAULT_MARGIN,
    width,
    height,
  );
}

type UseFreeDragOptions = {
  storageKey?: string;
  disabled?: boolean;
  /** 默认右下角位置上移像素，避免与另一浮窗重叠 */
  initialYOffset?: number;
};

export function useFreeDrag({
  storageKey,
  disabled = false,
  initialYOffset = 0,
}: UseFreeDragOptions = {}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const movedRef = useRef(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);

  const measureAndPlace = useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    setPosition((prev) => {
      const saved = prev ?? (storageKey ? loadPosition(storageKey) : null);
      const next = saved ?? defaultBottomRight(rect.width, rect.height);
      if (!saved && initialYOffset > 0) {
        next.y = Math.max(VIEWPORT_PADDING, next.y - initialYOffset);
      }
      return clampPosition(next.x, next.y, rect.width, rect.height);
    });
  }, [initialYOffset, storageKey]);

  const resetPosition = useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    setPosition(defaultBottomRight(rect.width, rect.height));
  }, []);

  useEffect(() => {
    measureAndPlace();
  }, [measureAndPlace]);

  useEffect(() => {
    const onResize = () => {
      const el = shellRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition((prev) => (prev ? clampPosition(prev.x, prev.y, rect.width, rect.height) : prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (position && storageKey && typeof window !== "undefined") {
      sessionStorage.setItem(storageKey, JSON.stringify(position));
    }
  }, [position, storageKey]);

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, a, input, textarea, select, label, .ant-btn, .ant-progress"));
  };

  const onShellPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0 || isInteractiveTarget(event.target)) return;
    const el = shellRef.current;
    if (!el || position == null) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
    movedRef.current = false;
    el.setPointerCapture(event.pointerId);
  };

  const onShellPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = shellRef.current;
    if (!drag || !el || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    drag.moved = true;
    movedRef.current = true;
    setDragging(true);
    const rect = el.getBoundingClientRect();
    setPosition(clampPosition(drag.originX + dx, drag.originY + dy, rect.width, rect.height));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = shellRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setDragging(false);
    if (el?.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }
  };

  const onShellPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    finishDrag(event);
  };

  const onShellPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    movedRef.current = false;
    finishDrag(event);
  };

  const consumeClickIfDragged = () => {
    if (!movedRef.current) return false;
    movedRef.current = false;
    return true;
  };

  const wasPointerDragged = () => movedRef.current;

  const shellStyle: CSSProperties | undefined =
    position == null
      ? { visibility: "hidden" }
      : {
          left: position.x,
          top: position.y,
          touchAction: "none",
        };

  return {
    shellRef,
    shellStyle,
    dragging,
    measureAndPlace,
    resetPosition,
    shellProps: {
      onPointerDown: onShellPointerDown,
      onPointerMove: onShellPointerMove,
      onPointerUp: onShellPointerUp,
      onPointerCancel: onShellPointerCancel,
    },
    consumeClickIfDragged,
    wasPointerDragged,
  };
}
