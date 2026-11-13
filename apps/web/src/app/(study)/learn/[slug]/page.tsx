import { LessonReader } from "@/components/lesson-library";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LessonReader slug={slug} />;
}
