import { DiagnosticStart } from "@/components/practice-start";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Begin with curiosity</p>
        <h1>Find your starting point.</h1>
        <p>Sample your level’s coverage, or skip for now and begin with a balanced plan.</p>
      </div>
      <DiagnosticStart />
    </>
  );
}
