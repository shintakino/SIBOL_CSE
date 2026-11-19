"use client";
import { Button } from "@sibol-cse/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sibol-cse/ui/components/dialog";
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Home,
  LogOut,
  Menu,
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
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/practice", label: "Topic drills", icon: ClipboardList },
  { href: "/mock-exams", label: "Timed exams", icon: Timer },
  { href: "/review", label: "Mistakes", icon: RotateCcw },
  { href: "/bookmarks", label: "Saved", icon: Bookmark },
  { href: "/progress", label: "Progress", icon: ChartNoAxesCombined },
] as const;
const tools = [
  { href: "/learn", label: "Lessons", icon: BookOpen },
  { href: "/plan", label: "Weekly plan", icon: CalendarDays },
  { href: "/diagnostic", label: "Diagnostic", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/design-system", label: "UI preview", icon: Palette },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const inPlayer = /^\/attempts\/[^/]+$/.test(path);
  const current = (href: string) => path === href || path.startsWith(`${href}/`);
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
        <header className="shell-header">
          <div className="reviewer-header-inner">
            <div className="flex items-center gap-4">
              <Brand href="/dashboard" />
              <span className="hidden border-l pl-4 text-sm text-muted-foreground sm:inline">
                CSE reviewer
              </span>
            </div>
            <div className="flex items-center gap-1 sm:gap-3">
              <span className="hidden max-w-40 truncate text-sm md:inline">{name}</span>
              <ThemeToggle />
              <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
                <DialogTrigger
                  render={<Button variant="ghost" size="icon" aria-label="More tools" />}
                >
                  <Menu aria-hidden="true" />
                </DialogTrigger>
                <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Your study tools</DialogTitle>
                    <DialogDescription>Lessons, planning and account settings.</DialogDescription>
                  </DialogHeader>
                  <nav aria-label="More study tools" className="grid gap-2 sm:grid-cols-2">
                    {tools.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        className="nav-link"
                        aria-current={current(href) ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                      >
                        <Icon className="size-5 shrink-0" aria-hidden="true" />
                        {label}
                      </Link>
                    ))}
                  </nav>
                  {admin && (
                    <section className="border-t pt-4" aria-label="Administration">
                      <h3 className="mb-3 text-base font-medium">Administration</h3>
                      <nav aria-label="Admin tools" className="grid gap-2 sm:grid-cols-2">
                        {adminNavigation.map(({ href, label }) => (
                          <Link
                            key={href}
                            href={href}
                            className="nav-link"
                            aria-current={current(href) ? "page" : undefined}
                            onClick={() => setMenuOpen(false)}
                          >
                            <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
                            {label}
                          </Link>
                        ))}
                      </nav>
                    </section>
                  )}
                </DialogContent>
              </Dialog>
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
          </div>
        </header>
        {inPlayer ? (
          <div className="reviewer-return">
            <Link
              className="inline-flex min-h-11 items-center gap-2 text-sm text-primary"
              href="/dashboard"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to reviewer
            </Link>
          </div>
        ) : (
          <nav aria-label="Main navigation" className="reviewer-tabs">
            {navigation.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href as Route}
                className="nav-link"
                aria-current={current(href) ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        )}
        {error && (
          <p role="alert" className="px-5 pt-4 text-destructive">
            {error}
          </p>
        )}
        <main id="main-content" className={`shell-main${inPlayer ? " reviewer-player" : ""}`}>
          {children}
        </main>
      </div>
    </AppearanceProvider>
  );
}
