"use client";

import { Tooltip } from "antd";
import FireOutlined from "@ant-design/icons/FireOutlined";
import TrophyOutlined from "@ant-design/icons/TrophyOutlined";
import { useAppStore } from "@/store/appStore";
import { clientNavigate } from "@/lib/clientNav";

type SidebarStudyStatsProps = {
  collapsed: boolean;
  dailyDone?: number;
  dailyTotal?: number;
};

export default function SidebarStudyStats({
  collapsed,
  dailyDone = 0,
  dailyTotal = 0,
}: SidebarStudyStatsProps) {
  const evalStats = useAppStore((s) => s.evalStats);
  const streak = evalStats?.study_streak ?? 0;
  const studyDays = evalStats?.study_days ?? 0;
  const studiedToday = evalStats?.studied_today ?? false;
  const dailyPct =
    dailyTotal > 0 ? Math.round((dailyDone / dailyTotal) * 100) : dailyDone > 0 ? 100 : 0;

  if (collapsed) {
    return (
      <Tooltip
        placement="right"
        title={`连续 ${streak} 天 · 累计 ${studyDays} 天${dailyTotal ? ` · 今日计划 ${dailyDone}/${dailyTotal}` : ""}`}
      >
        <button
          type="button"
          className="lp-sider-streak-collapsed"
          aria-label="学习打卡"
          onClick={() => clientNavigate("/insights")}
        >
          <FireOutlined />
          {streak > 0 && <span className="lp-sider-streak-collapsed-num">{streak}</span>}
        </button>
      </Tooltip>
    );
  }

  return (
    <section className="lp-sider-study-stats" aria-label="学习打卡">
      <button
        type="button"
        className="lp-sider-study-stats-main"
        onClick={() => clientNavigate("/insights")}
      >
        <span className="lp-sider-study-stats-fire">
          <FireOutlined />
        </span>
        <span className="lp-sider-study-stats-copy">
          <span className="lp-sider-study-stats-streak">连续 {streak} 天</span>
          <span className="lp-sider-study-stats-meta">
            累计 {studyDays} 天
            {studiedToday ? " · 今日已学" : " · 今日待打卡"}
          </span>
        </span>
        <TrophyOutlined className="lp-sider-study-stats-trophy" />
      </button>
      {dailyTotal > 0 ? (
        <div className="lp-sider-study-stats-plan">
          <div className="lp-sider-study-stats-plan-row">
            <span className="lp-sider-study-stats-plan-label">今日计划</span>
            <span className="lp-sider-study-stats-plan-count">
              {dailyDone}/{dailyTotal}
            </span>
          </div>
          <div className="lp-sider-study-stats-bar" role="progressbar" aria-valuenow={dailyPct}>
            <span className="lp-sider-study-stats-bar-fill" style={{ width: `${dailyPct}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
