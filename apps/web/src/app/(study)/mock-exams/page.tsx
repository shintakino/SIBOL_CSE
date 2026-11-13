import { MockStart } from "@/components/mock-start";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Find your pace</p>
        <h1>Timed sets & mock exams</h1>
        <p>An uninterrupted simulation with a server-owned deadline.</p>
      </div>
      <MockStart />
    </>
  );
}
