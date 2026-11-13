import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/server-api";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <AppShell name={profile.name} admin={profile.role === "admin"}>
      {children}
    </AppShell>
  );
}
