import { ReviewerPlayer } from "@/components/reviewer/player";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewerPlayer id={id} />;
}
