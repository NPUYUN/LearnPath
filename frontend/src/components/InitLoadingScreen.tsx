"use client";

import RouteLoadingScreen, { type RouteLoadingVariant } from "@/components/RouteLoadingScreen";

type InitLoadingScreenProps = {
  progress: number;
  fading?: boolean;
  variant?: RouteLoadingVariant;
};

/** 登录后首次进入应用的加载屏 */
export default function InitLoadingScreen({
  progress,
  fading,
  variant = "init",
}: InitLoadingScreenProps) {
  return <RouteLoadingScreen variant={variant} progress={progress} fading={fading} />;
}
