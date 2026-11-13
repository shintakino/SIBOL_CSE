import { notFound } from "next/navigation";
import { AdminUsers } from "@/components/admin-users";
import { requireProfile } from "@/lib/server-api";
export default async function Page() {
  const profile = await requireProfile();
  if (profile.role !== "admin") notFound();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Private by design</p>
        <h1>Invitations & access</h1>
        <p>A small, trusted study space. Everyone’s learning records belong to them.</p>
      </div>
      <AdminUsers />
    </>
  );
}
