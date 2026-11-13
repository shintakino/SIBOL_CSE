import { StudyHome } from "@/components/study-home";
import { requireProfile } from "@/lib/server-api";
export default async function Page() {
  const profile = await requireProfile();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">A fresh page</p>
        <h1>Welcome, {profile.name.split(" ")[0]}.</h1>
        <p>Your learning stays private. Choose a manageable next step.</p>
      </div>
      <StudyHome />
    </>
  );
}
