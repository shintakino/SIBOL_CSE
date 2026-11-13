import { LessonLibrary } from "@/components/lesson-library";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Understand, then practise</p>
        <h1>Your lesson library</h1>
        <p>Reviewed explanations, useful examples, and a place to return to.</p>
      </div>
      <LessonLibrary />
    </>
  );
}
