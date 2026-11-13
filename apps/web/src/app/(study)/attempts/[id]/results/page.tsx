import { AttemptResults } from "@/components/attempt-player";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AttemptResults id={id} />;
}
