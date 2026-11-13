import { notFound } from "next/navigation";
import { AdminReports } from "@/components/admin-reports";
import { requireProfile } from "@/lib/server-api";
export default async function Page() {
  const profile = await requireProfile();
  if (profile.role !== "admin") notFound();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Reviewed content, thoughtful learning</p>
        <h1>Content issue reports</h1>
        <p>Resolve content concerns while keeping learner answers and notes private.</p>
      </div>
      <AdminReports />
    </>
  );
}
