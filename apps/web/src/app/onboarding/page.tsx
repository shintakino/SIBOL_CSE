import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { PreferencesForm } from "@/components/preferences-form";
import { requireProfile } from "@/lib/server-api";
export default async function Page() {
  const profile = await requireProfile(false);
  if (profile.onboarded) redirect("/dashboard");
  return (
    <AuthLayout wide>
      <div className="page-heading">
        <p className="eyebrow">Let’s make this yours</p>
        <h1>Find your study rhythm.</h1>
        <p>
          No perfect schedule needed. Choose a starting point that feels manageable, and adjust as
          you go.
        </p>
      </div>
      <PreferencesForm profile={profile} onboarding />
    </AuthLayout>
  );
}
