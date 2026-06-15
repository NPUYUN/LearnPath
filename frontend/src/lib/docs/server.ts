import fs from "node:fs";
import path from "node:path";
import { getDocBySlug, type DocEntry } from "./manifest";

const DOCS_ROOT = path.join(process.cwd(), "..", "docs");

export function readDocContent(entry: DocEntry): string {
  const filePath = path.join(DOCS_ROOT, entry.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`文档文件不存在: ${entry.file}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

export function docExists(slug: string): boolean {
  const entry = getDocBySlug(slug);
  if (!entry) return false;
  return fs.existsSync(path.join(DOCS_ROOT, entry.file));
}
