"use client";

/** 成就馆专属星空背景（与其他页面视觉区分） */
export default function InsightsArenaBackground() {
  return (
    <div className="lp-insights-arena-bg" aria-hidden>
      <div className="lp-insights-arena-mesh" />
      <div className="lp-insights-arena-stars" />
      <div className="lp-insights-arena-beam lp-insights-arena-beam--1" />
      <div className="lp-insights-arena-beam lp-insights-arena-beam--2" />
    </div>
  );
}
