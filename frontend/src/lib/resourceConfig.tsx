import {
  ApartmentOutlined,
  CodeOutlined,
  FileTextOutlined,
  FormOutlined,
  ReadOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type UiResourceType =
  | "document"
  | "mindmap"
  | "quiz"
  | "video"
  | "code"
  | "reading";

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
};
