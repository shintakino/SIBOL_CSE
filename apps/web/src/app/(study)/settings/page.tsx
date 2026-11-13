import { Card, CardContent } from "@sibol-cse/ui/components/card";
import type { Route } from "next";
import Link from "next/link";
import { AccountControls } from "@/components/account-controls";
import { PreferencesForm } from "@/components/preferences-form";
import { adminNavigation } from "@/lib/navigation";
import { requireProfile } from "@/lib/server-api";
export default async function Page() {
  const profile = await requireProfile();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Make room for learning</p>
        <h1>Your study rhythm</h1>
        <p>Adjust your preferences as life changes. Your learning history stays yours.</p>
      </div>
      <Card className="max-w-3xl">
        <CardContent>
          <PreferencesForm profile={profile} />
        </CardContent>
      </Card>
      <AccountControls />
      <nav aria-label="More study tools" className="mt-8 space-y-4">
        {[
          ["/review", "Mistake notebook"],
          ["/bookmarks", "Saved material, notes & search"],
          ["/plan", "Weekly plan"],
          ["/mock-exams", "Timed sets & mocks"],
          ["/progress", "Learning progress"],
        ].map(([href, label]) => (
          <p key={href}>
            <Link className="inline-link" href={(href ?? "/dashboard") as Route}>
              {label}
            </Link>
          </p>
        ))}
        <p>
          <Link className="inline-link" href="/diagnostic">
            Take or skip a diagnostic
          </Link>
        </p>
        <p>
          <Link className="inline-link" href="/design-system">
            UI preview
          </Link>
        </p>
        {profile.role === "admin" &&
          adminNavigation.map((link) => (
            <p key={link.href}>
              <Link className="inline-link" href={link.href}>
                {link.label}
              </Link>
            </p>
          ))}
      </nav>
    </>
  );
}
