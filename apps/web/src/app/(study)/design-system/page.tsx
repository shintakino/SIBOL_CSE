import { DesignPreview } from "@/components/design-preview";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Sibol’s study journal</p>
        <h1>Designed for a calmer focus.</h1>
        <p>
          A preview of the controls and states that support studying. Try the keyboard, change the
          theme, and make the text a little bigger.
        </p>
      </div>
      <DesignPreview />
    </>
  );
}
