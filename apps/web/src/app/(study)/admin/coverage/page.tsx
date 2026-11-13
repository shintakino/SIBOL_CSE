import { notFound } from "next/navigation";
import { ProviderCoverage } from "@/components/provider-coverage";
import { requireProfile } from "@/lib/server-api";
export default async function Page() {
  const profile = await requireProfile();
  if (profile.role !== "admin") notFound();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Content inventory and source audit</p>
        <h1>Question bank coverage</h1>
        <p>
          Inspect each category and subcategory, resolve classification holds, and distinguish
          collected content from reviewed study material.
        </p>
      </div>
      <ProviderCoverage />
    </>
  );
}
