import { notFound } from "next/navigation";
import { AdminProfiles } from "@/components/admin-profiles";
import { requireProfile } from "@/lib/server-api";
export default async function Page() {
  const profile = await requireProfile();
  if (profile.role !== "admin") notFound();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Reviewed content, thoughtful learning</p>
        <h1>Profiles & inventory</h1>
        <p>
          Verify official source metadata, configure editorial quotas and check launch readiness.
        </p>
      </div>
      <AdminProfiles />
    </>
  );
}
