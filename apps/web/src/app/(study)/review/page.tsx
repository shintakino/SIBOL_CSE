import { ReviewNotebook } from "@/components/review-notebook";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">A concept worth revisiting</p>
        <h1>Mistake notebook</h1>
        <p>Practice again after a delay, with your learning history intact.</p>
      </div>
      <ReviewNotebook />
    </>
  );
}
