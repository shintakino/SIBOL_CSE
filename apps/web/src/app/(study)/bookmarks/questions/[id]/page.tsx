import { LibraryQuestion } from "@/components/bookmark-library";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LibraryQuestion versionId={id} />;
}
