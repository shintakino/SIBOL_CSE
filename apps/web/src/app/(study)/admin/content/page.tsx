import { notFound } from "next/navigation";
import { AdminContent } from "@/components/admin-content";
import { requireProfile } from "@/lib/server-api";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ query?: string | string[] }>;
}) {
  const profile = await requireProfile();
  if (profile.role !== "admin") notFound();
  const query = (await searchParams).query;
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Reviewed content, thoughtful learning</p>
        <h1>Content workspace</h1>
        <p>Draft, review and publish material with clear rights and immutable history.</p>
      </div>
      <AdminContent initialQuery={typeof query === "string" ? query.slice(0, 120) : ""} />
    </>
  );
}
