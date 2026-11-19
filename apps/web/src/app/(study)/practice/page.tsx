import { areaLabels } from "@sibol-cse/api/study-catalog";
import { PracticeStart } from "@/components/practice-start";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; area?: string }>;
}) {
  const { topic, area } = await searchParams;
  const initialArea =
    area && Object.hasOwn(areaLabels, area) ? (area as keyof typeof areaLabels) : "all";
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Topic drills</p>
        <h1>What would you like to practise?</h1>
        <p>Choose a subject and a short set. Check your answers as you go.</p>
      </div>
      <PracticeStart initialTopic={topic} initialArea={initialArea} />
    </>
  );
}
