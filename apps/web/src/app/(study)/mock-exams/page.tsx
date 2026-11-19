import { MockStart } from "@/components/mock-start";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Timed exams</p>
        <h1>Timed sets & mock exams</h1>
        <p>Pick a short exam or build your own timed set.</p>
      </div>
      <MockStart />
    </>
  );
}
