"use client";

import RouteLoadingScreen from "@/components/RouteLoadingScreen";

type InitLoadingScreenProps = {
  progress: number;
  fading?: boolean;
};

/** 登录后首次进入主应用的加载屏 */
export default function InitLoadingScreen({ progress, fading }: InitLoadingScreenProps) {
  return <RouteLoadingScreen variant="init" progress={progress} fading={fading} />;
}
