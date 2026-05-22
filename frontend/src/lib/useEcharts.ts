"use client";

import { useEffect, useRef } from "react";
import type { ECharts, EChartsOption } from "echarts";

// 模块级缓存：确保多个图表共用同一个加载 Promise，避免重复网络请求
let _echartsPromise: Promise<typeof import("echarts")> | null = null;
function loadEcharts() {
  if (!_echartsPromise) _echartsPromise = import("echarts");
  return _echartsPromise;
}

// 供外部调用以提前预热（在不需要渲染的时机即可触发下载）
export function preloadEcharts() {
  void loadEcharts();
}

/** 客户端安全初始化 ECharts，避免 SSR 与重复 dispose 问题 */
export function useEcharts(option: EChartsOption | null, deps: unknown[] = []) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || !option) return;

    let chart: ECharts | undefined;
    let disposed = false;
    let ro: ResizeObserver | undefined;

    void loadEcharts().then((echarts) => {
      if (disposed || !chartRef.current) return;
      chart = echarts.init(chartRef.current);
      chart.setOption(option);
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(chartRef.current);
    });

    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return chartRef;
}
