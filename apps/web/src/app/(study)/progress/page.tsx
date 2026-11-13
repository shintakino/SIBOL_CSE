import { ProgressView } from "@/components/progress-view";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Evidence, gently observed</p>
        <h1>Your learning progress</h1>
        <p>See sample sizes, unique coverage and progress on unfamiliar questions.</p>
      </div>
      <ProgressView />
    </>
  );
}
