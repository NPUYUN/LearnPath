import {
  ApartmentOutlined,
  CodeOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FormOutlined,
  ProjectOutlined,
  ReadOutlined,
  SolutionOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type UiResourceType =
  | "document"
  | "mindmap"
  | "quiz"
  | "video"
  | "code"
  | "reading"
  | "ppt"
  | "design"
  | "project";

export function mapApiType(type: string): UiResourceType {
  const m: Record<string, UiResourceType> = {
    doc: "document",
    document: "document",
    mindmap: "mindmap",
    quiz: "quiz",
    reading: "reading",
    media: "video",
    video: "video",
    code: "code",
    ppt: "ppt",
    design: "design",
    project: "project",
  };
  return m[type] || "document";
}

export const RESOURCE_CONFIG: Record<
  UiResourceType,
  { color: string; icon: ReactNode; label: string }
> = {
  document: { color: "#1677ff", icon: <FileTextOutlined />, label: "讲解文档" },
  mindmap: { color: "#52c41a", icon: <ApartmentOutlined />, label: "思维导图" },
  quiz: { color: "#fa8c16", icon: <FormOutlined />, label: "练习题库" },
  video: { color: "#722ed1", icon: <VideoCameraOutlined />, label: "多模态讲解" },
  code: { color: "#13c2c2", icon: <CodeOutlined />, label: "代码案例" },
  reading: { color: "#eb2f96", icon: <ReadOutlined />, label: "拓展阅读" },
  ppt: { color: "#2f54eb", icon: <FilePptOutlined />, label: "课件提纲" },
  design: { color: "#fa541c", icon: <SolutionOutlined />, label: "资源设计方案" },
  project: { color: "#389e0d", icon: <ProjectOutlined />, label: "实践项目" },
};

export const STANDARD_RESOURCE_TYPES = ["doc", "mindmap", "quiz", "reading", "media", "code"] as const;

export const EXTENDED_RESOURCE_TYPES = [
  ...STANDARD_RESOURCE_TYPES,
  "ppt",
  "design",
  "project",
] as const;
