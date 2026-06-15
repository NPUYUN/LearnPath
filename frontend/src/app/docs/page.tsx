import { redirect } from "next/navigation";
import { DEFAULT_DOC_SLUG } from "@/lib/docs/manifest";

export default function DocsIndexPage() {
  redirect(`/docs/${DEFAULT_DOC_SLUG}`);
}
