"use client";
import { Button } from "@sibol-cse/ui/components/button";
import {
  Bookmark,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Home,
  LogOut,
  Palette,
  RotateCcw,
  Settings,
  ShieldCheck,
  Timer,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { adminNavigation } from "@/lib/navigation";
import { AppearanceProvider } from "./appearance-provider";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/practice", label: "Practice", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
export function AppShell({
  children,
  name,
  admin,
}: {
  children: React.ReactNode;
  name: string;
  admin: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const links = navigation.map(({ href, label, icon: Icon }) => (
    <Link
      className="nav-link"
      href={href as Route}
      key={href}
      aria-current={path === href ? "page" : undefined}
    >
      <Icon className="size-5" aria-hidden="true" />
      {label}
    </Link>
  ));
  async function signOut() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Sign out failed. Please retry.");
    } finally {
      setPending(false);
    }
  }
  return (
    <AppearanceProvider>
      <div className="shell">
        <aside className="shell-sidebar">
          <Brand />
          <p className="eyebrow mb-5 mt-12 px-4">Your study space</p>
          <nav aria-label="Main navigation" className="space-y-2">
            {links}
            {[
              { href: "/review", label: "Review", icon: RotateCcw },
              { href: "/bookmarks", label: "Saved & search", icon: Bookmark },
              { href: "/plan", label: "Weekly plan", icon: CalendarDays },
              { href: "/mock-exams", label: "Timed sets & mocks", icon: Timer },
              { href: "/progress", label: "Progress", icon: ChartNoAxesCombined },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                className="nav-link"
                key={href}
                href={href as Route}
                aria-current={path === href ? "page" : undefined}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            ))}
            <Link
              className="nav-link"
              href="/design-system"
              aria-current={path === "/design-system" ? "page" : undefined}
            >
              <Palette className="size-5" aria-hidden="true" />
              UI preview
            </Link>
            {admin &&
              adminNavigation.map((link) => (
                <Link
                  key={link.href}
                  className="nav-link"
                  href={link.href}
                  aria-current={path === link.href ? "page" : undefined}
                >
                  <ShieldCheck className="size-5" aria-hidden="true" />
                  {link.label}
                </Link>
              ))}
          </nav>
          <div className="mt-auto border-t pt-6">
            <p className="px-4 text-sm font-medium">Grow at your own pace.</p>
            <p className="mt-1 px-4 text-sm text-muted-foreground">
              A little progress is still progress.
            </p>
          </div>
        </aside>
        <header className="shell-header">
          <Brand />
          <p className="hidden text-sm text-muted-foreground md:block">
            Your civil service review companion
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm sm:inline">{name}</span>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              disabled={pending}
              onClick={signOut}
            >
              <LogOut aria-hidden="true" />
            </Button>
          </div>
        </header>
        {error && (
          <p role="alert" className="px-5 pt-4 text-destructive">
            {error}
          </p>
        )}
        <main id="main-content" className="shell-main">
          {children}
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {links}
        </nav>
      </div>
    </AppearanceProvider>
  );
}
