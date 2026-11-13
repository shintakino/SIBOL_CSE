import { PracticeStart } from "@/components/practice-start";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">A little focused retrieval</p>
        <h1>Make room for practice.</h1>
        <p>
          Choose a manageable set. Save a choice, commit when ready, and learn from the reasoning.
        </p>
      </div>
      <PracticeStart initialTopic={topic} />
    </>
  );
}
