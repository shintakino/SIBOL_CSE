import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { ReviewerTrack } from "@/components/reviewer/track";
import { requireProfile } from "@/lib/server-api";
export default async function Page() {
  const profile = await requireProfile(false);
  if (profile.onboarded) redirect("/dashboard");
  return (
    <AuthLayout>
      <h1>Choose your CSE track</h1>
      <p>One choice and you’re ready to practice.</p>
      <ReviewerTrack profile={profile} />
    </AuthLayout>
  );
}
