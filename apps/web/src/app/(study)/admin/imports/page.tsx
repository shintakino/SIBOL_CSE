import { notFound } from "next/navigation";
import { AdminImports } from "@/components/admin-imports";
import { requireProfile } from "@/lib/server-api";
export default async function Page() {
  const profile = await requireProfile();
  if (profile.role !== "admin") notFound();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Reviewed content, thoughtful learning</p>
        <h1>Import questions</h1>
        <p>Preview and validate every row before creating unpublished drafts.</p>
      </div>
      <AdminImports />
    </>
  );
}
