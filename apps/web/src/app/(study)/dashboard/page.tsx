import { StudyHome } from "@/components/study-home";
import { requireProfile } from "@/lib/server-api";
export default async function Page() {
  const profile = await requireProfile();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Sibol CSE reviewer</p>
        <h1>Let’s study, {profile.name.split(" ")[0]}.</h1>
        <p>Pick a quiz, choose a topic, or revisit your mistakes.</p>
      </div>
      <StudyHome />
    </>
  );
}
