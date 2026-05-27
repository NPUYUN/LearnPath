"use client";

import { createContext, useContext } from "react";

/** 当前页面面板是否处于可见/预热状态（用于 ECharts 等在隐藏时不初始化） */
export const PageVisibilityContext = createContext(false);

export function usePageVisible() {
  return useContext(PageVisibilityContext);
}
