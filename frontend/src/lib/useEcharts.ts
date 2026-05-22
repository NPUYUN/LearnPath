"use client";

import { useEffect, useRef } from "react";
import type { ECharts, EChartsOption } from "echarts";
import { usePageVisible } from "@/contexts/PageVisibilityContext";

let _echartsPromise: Promise<typeof import("echarts")> | null = null;
function loadEcharts() {
  if (!_echartsPromise) _echartsPromise = import("echarts");
  return _echartsPromise;
}

export function preloadEcharts(): Promise<typeof import("echarts")> {
  return loadEcharts();
}

/** 在离屏容器预热 ECharts 引擎，降低首次进入图表页的卡顿 */
export async function prewarmEchartsEngine(): Promise<void> {
  const echarts = await loadEcharts();
  const el = document.createElement("div");
  el.style.cssText = "width:320px;height:200px;position:fixed;left:-9999px;top:0;pointer-events:none;";
  document.body.appendChild(el);
  const chart = echarts.init(el);
  chart.setOption({
    xAxis: { type: "category", data: ["A"] },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: [1] }],
  });
  chart.resize();
  chart.dispose();
  el.remove();
}

export function useEcharts(option: EChartsOption | null, deps: unknown[] = []) {
  const visible = usePageVisible();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartRef2 = useRef<ECharts | undefined>(undefined);

  useEffect(() => {
    if (!visible || !chartRef.current || !option) return;

    let disposed = false;
    let ro: ResizeObserver | undefined;

    const initOrUpdate = () => {
      if (disposed || !chartRef.current) return;
      void loadEcharts().then((echarts) => {
        if (disposed || !chartRef.current) return;
        if (!chartRef2.current) {
          chartRef2.current = echarts.init(chartRef.current);
          ro = new ResizeObserver(() => chartRef2.current?.resize());
          ro.observe(chartRef.current);
        }
        chartRef2.current.setOption(option, { notMerge: false });
        chartRef2.current.resize();
      });
    };

    initOrUpdate();

    const onPaneShow = () => {
      if (visible) chartRef2.current?.resize();
    };
    window.addEventListener("learnpath-pane-show", onPaneShow);

    return () => {
      disposed = true;
      window.removeEventListener("learnpath-pane-show", onPaneShow);
      ro?.disconnect();
      chartRef2.current?.dispose();
      chartRef2.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ...deps]);

  return chartRef;
}
