import { buttonVariants } from "@sibol-cse/ui/components/button";
import { ArrowRight, BookOpen, CalendarDays, LockKeyhole, Sprout } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Page() {
  return (
    <div className="min-h-svh px-5 md:px-10">
      <header className="mx-auto flex max-w-6xl items-center justify-between py-6">
        <Brand />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link className={buttonVariants({ variant: "outline" })} href="/sign-in">
            Sign in
          </Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-6xl py-16 md:py-28">
        <div className="grid items-center gap-14 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="eyebrow mb-6">Your civil service review companion</p>
            <h1 className="max-w-xl text-5xl leading-[1.1] font-medium md:text-7xl">
              Small steps.
              <br />
              <span className="text-primary">Steady growth.</span>
            </h1>
            <p className="reading mt-8 text-muted-foreground">
              A calmer way to prepare. Make room for learning, build understanding, and find a study
              rhythm that feels like yours.
            </p>
            <Link className={`${buttonVariants({ size: "lg" })} mt-8`} href="/sign-in">
              Enter your study space
              <ArrowRight aria-hidden="true" />
            </Link>
            <p className="status-row mt-5 text-muted-foreground">
              <LockKeyhole className="size-4" aria-hidden="true" />
              Private, invitation-only access
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-10">
            <Sprout className="mb-10 size-10 text-primary" aria-hidden="true" />
            <p className="eyebrow">Room to grow</p>
            <h2 className="my-4 text-3xl font-medium">
              One thoughtful
              <br />
              session at a time.
            </h2>
            <div className="mt-8 space-y-6">
              <div className="flex gap-4">
                <CalendarDays className="mt-1 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3>A rhythm that fits</h3>
                  <p className="mt-1 text-muted-foreground">
                    Your level. Your days. Your daily time.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <BookOpen className="mt-1 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3>Understanding comes first</h3>
                  <p className="mt-1 text-muted-foreground">
                    A study space designed for clear explanations and manageable practice.
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-10 border-t pt-5 text-sm text-muted-foreground">
              Sibol <span lang="fil">/si·bol/</span> · to sprout, to grow
            </p>
          </div>
        </div>
      </main>
      <footer className="mx-auto max-w-6xl border-t py-6 text-sm text-muted-foreground">
        An independent study companion. No CSC endorsement or guaranteed results.
      </footer>
    </div>
  );
}
