import LibraryDetailPage from "@/components/LibraryDetailPage";

export default function LibraryDetailRoute({
  params,
}: {
  params: { libraryId: string };
}) {
  return <LibraryDetailPage libraryId={decodeURIComponent(params.libraryId)} />;
}
