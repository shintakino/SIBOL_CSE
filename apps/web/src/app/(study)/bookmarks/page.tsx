import { BookmarkLibrary } from "@/components/bookmark-library";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Your study notebook</p>
        <h1>Saved material & private notes</h1>
        <p>
          Keep a useful thought, find a reviewed lesson, or revisit your permitted question history.
        </p>
      </div>
      <BookmarkLibrary />
    </>
  );
}
