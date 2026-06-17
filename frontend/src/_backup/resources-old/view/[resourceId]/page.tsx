import ResourceDetailPage from "@/components/ResourceDetailPage";

export default function ResourceViewRoute({
  params,
}: {
  params: { resourceId: string };
}) {
  return <ResourceDetailPage resourceId={decodeURIComponent(params.resourceId)} />;
}
