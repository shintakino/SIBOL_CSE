import { StudyPlan } from "@/components/study-plan";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Make room for learning</p>
        <h1>Your weekly study plan</h1>
        <p>A realistic plan from your availability, reviewed content and observed evidence.</p>
      </div>
      <StudyPlan />
    </>
  );
}
