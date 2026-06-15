export type DocEntry = {
  slug: string;
  title: string;
  file: string;
  description?: string;
};

export type DocSection = {
  title: string;
  items: DocEntry[];
};

/** 文档导航：slug 与仓库 docs/ 目录下 Markdown 文件一一对应 */
export const DOC_SECTIONS: DocSection[] = [
  {
    title: "入门",
    items: [
      {
        slug: "guide",
        title: "使用指南",
        file: "00-使用指南.md",
        description: "产品定位、推荐流程与模块说明",
      },
      {
        slug: "changelog",
        title: "近期更新",
        file: "09-近期更新.md",
        description: "版本变更与功能修复记录",
      },
    ],
  },
  {
    title: "产品与验收",
    items: [
      {
        slug: "requirements",
        title: "需求规格说明书",
        file: "01-需求规格说明书.md",
      },
      {
        slug: "ui-test",
        title: "界面功能与测试手册",
        file: "05-界面功能与测试手册.md",
      },
      {
        slug: "product-roadmap",
        title: "产品进一步开发指南",
        file: "09-正式产品进一步开发指南.md",
      },
    ],
  },
  {
    title: "开发与架构",
    items: [
      {
        slug: "dev-guide",
        title: "开发指南",
        file: "02-开发指南.md",
      },
      {
        slug: "system-outline",
        title: "系统开发说明书提纲",
        file: "04-系统开发说明书-提纲.md",
      },
      {
        slug: "resource-pipeline",
        title: "资源库与生成管线",
        file: "07-资源库与生成管线.md",
      },
      {
        slug: "llm-routing",
        title: "LLM 双通道路由",
        file: "06-LLM双通道路由.md",
      },
      {
        slug: "kimi",
        title: "Kimi 接入与 Prompt",
        file: "08-Kimi接入与Prompt说明.md",
      },
    ],
  },
  {
    title: "合规",
    items: [
      {
        slug: "license",
        title: "开源参考与协议",
        file: "03-开源参考与协议.md",
      },
    ],
  },
];

export const DOC_ENTRIES: DocEntry[] = DOC_SECTIONS.flatMap((section) => section.items);

export const DEFAULT_DOC_SLUG = "guide";

export function getDocBySlug(slug: string): DocEntry | undefined {
  return DOC_ENTRIES.find((entry) => entry.slug === slug);
}

export function getAllDocSlugs(): string[] {
  return DOC_ENTRIES.map((entry) => entry.slug);
}

/** Markdown 内 `./xx.md` 链接 → 站内 `/docs/slug` */
export const DOC_FILE_TO_SLUG: Record<string, string> = Object.fromEntries(
  DOC_ENTRIES.map((entry) => [entry.file, entry.slug])
);
