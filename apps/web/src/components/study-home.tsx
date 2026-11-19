"use client";
import { Button, buttonVariants } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import { Label } from "@sibol-cse/ui/components/label";
import { Textarea } from "@sibol-cse/ui/components/textarea";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  CalendarDays,
  GitBranch,
  Landmark,
  ListOrdered,
  type LucideIcon,
  RotateCcw,
  Timer,
  Zap,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "@/utils/orpc";
import { errorMessage, LoadState, useData } from "./learning-ui";

const areaIcons: Record<string, LucideIcon> = {
  verbal: BookOpen,
  numerical: Calculator,
  analytical: GitBranch,
  general: Landmark,
  clerical: ListOrdered,
};
function ActionCard({
  icon: Icon,
  title,
  description,
  featured = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  featured?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={`flex h-full flex-col ${featured ? "border-primary bg-primary text-primary-foreground" : ""}`}
    >
      <CardHeader className="gap-4">
        <span
          className={`inline-flex size-11 items-center justify-center rounded-xl ${featured ? "bg-primary-foreground/15" : "bg-secondary text-primary"}`}
        >
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <h2 className="text-xl">{title}</h2>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <p
          className={`flex-1 ${featured ? "text-primary-foreground/90" : "text-muted-foreground"}`}
        >
          {description}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}
type ActiveSet = Awaited<ReturnType<typeof client.dashboard.get>>["active"][number];
function ResumeSet({ attempt: a }: { attempt: ActiveSet }) {
  return (
    <li>
      <Link className="inline-link" href={`/attempts/${a.id}`}>
        Resume{" "}
        {a.mode === "strict_mock"
          ? a.setKind === "full"
            ? "full strict mock"
            : "strict timed set"
          : a.mode === "timed_practice"
            ? "timed practice"
            : a.mode === "diagnostic"
              ? "diagnostic"
              : a.mode === "review"
                ? "scheduled review"
                : "practice set"}
      </Link>
      <p className="mt-1 text-sm text-muted-foreground">
        {a.savedAt ? "Your answers are saved." : "No answer saved yet."}
        {a.expiresAt
          ? ` Original deadline: ${new Date(a.expiresAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Asia/Manila).`
          : ""}
      </p>
    </li>
  );
}
export function StudyHome() {
  const load = useCallback(async () => {
    const [dashboard, catalog] = await Promise.all([
      client.dashboard.get(),
      client.topics.catalog(),
    ]);
    return { ...dashboard, catalog };
  }, []);
  const state = useData(load),
    d = state.data;
  const router = useRouter();
  const [dedication, setDedication] = useState(""),
    [pending, setPending] = useState(false),
    [saved, setSaved] = useState("");
  const [starting, setStarting] = useState<10 | 20 | null>(null);
  const creating = useRef(false),
    requests = useRef(new Map<number, string>());
  useEffect(() => {
    setDedication(d?.dedication ?? "");
  }, [d?.dedication]);
  async function start(count: 10 | 20) {
    if (creating.current || !d || d.activeAssessment) return;
    creating.current = true;
    setStarting(count);
    state.setError("");
    try {
      const requestId = requests.current.get(count) ?? crypto.randomUUID();
      requests.current.set(count, requestId);
      const attempt = await client.practice.create({
        topicId: "mixed",
        count,
        difficulty: "any",
        unseenFirst: true,
        requestId,
      });
      router.push(`/attempts/${attempt.id}`);
    } catch (error) {
      state.setError(errorMessage(error));
    } finally {
      creating.current = false;
      setStarting(null);
    }
  }
  async function saveDedication() {
    setPending(true);
    state.setError("");
    try {
      await client.dashboard.setDedication({ dedication: dedication.trim() || null });
      setSaved("Personal dedication saved.");
      await state.reload();
    } catch (error) {
      state.setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <LoadState {...state} />
      {d && (
        <div className="space-y-8">
          {d.dedication && <p className="border-l-2 border-primary pl-5 text-lg">{d.dedication}</p>}
          {d.activeAssessment && (
            <p role="note" className="rounded-xl border bg-secondary p-5">
              Your assessment is active. Resume with the original deadline and acknowledged answers.
              Analytics and related study feedback become available after completion.
            </p>
          )}
          <section aria-label="Your study at a glance" className="reviewer-stats">
            {[
              ["Questions available", d.catalog.publishedQuestions],
              [
                d.inAppReminders ? "Due reviews" : "In-app review reminders",
                d.inAppReminders ? d.dueCount : "Off",
              ],
              [
                "Recent practice accuracy",
                d.recentPracticeAccuracy === null
                  ? "No data"
                  : `${Math.round(d.recentPracticeAccuracy * 100)}%`,
              ],
              ["Weekly tasks completed", `${d.weekCompleted}/${d.weekTotal}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-4 sm:p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </section>
          {d.active.length > 0 && (
            <section aria-labelledby="resume-heading" className="rounded-2xl border bg-card p-5">
              <h2 id="resume-heading" className="mb-4 text-lg">
                Pick up where you left off
              </h2>
              <ul className="space-y-4">
                {d.active.slice(0, 1).map((a) => (
                  <ResumeSet key={a.id} attempt={a} />
                ))}
              </ul>{" "}
              {d.active.length > 1 && (
                <details className="mt-4 border-t pt-3">
                  <summary className="cursor-pointer py-2 text-sm font-medium">
                    Other saved sets ({d.active.length - 1})
                  </summary>
                  <ul className="mt-3 space-y-4">
                    {d.active.slice(1).map((a) => (
                      <ResumeSet key={a.id} attempt={a} />
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
          <section aria-label="Choose a study mode" className="grid gap-5 sm:grid-cols-2">
            <ActionCard
              icon={Zap}
              title="Quick 10"
              description="A short mix of 10 randomized questions. Check each answer and learn as you go."
              featured
            >
              <Button
                variant="secondary"
                className="w-full justify-between"
                disabled={
                  starting !== null || d.activeAssessment || d.catalog.publishedQuestions < 10
                }
                onClick={() => start(10)}
              >
                {starting === 10 ? "Preparing…" : "Start Quick 10"}
                <ArrowRight aria-hidden="true" />
              </Button>
            </ActionCard>
            <ActionCard
              icon={CalendarDays}
              title="Daily practice"
              description="Make room for 20 questions at your own pace. Unseen questions are preferred."
            >
              <Button
                variant="outline"
                className="w-full justify-between"
                disabled={
                  starting !== null || d.activeAssessment || d.catalog.publishedQuestions < 20
                }
                onClick={() => start(20)}
              >
                {starting === 20 ? "Preparing…" : "Start 20 questions"}
                <ArrowRight aria-hidden="true" />
              </Button>
            </ActionCard>
            <ActionCard
              icon={Timer}
              title="Timed exams"
              description="Practise against the clock. Choose a short timed set or a full mock when available."
            >
              <Link
                className={buttonVariants({
                  variant: "outline",
                  className: "w-full justify-between",
                })}
                href="/mock-exams"
              >
                Choose a timed exam
                <ArrowRight aria-hidden="true" />
              </Link>
            </ActionCard>
            <ActionCard
              icon={RotateCcw}
              title="Review mistakes"
              description="Return to missed questions, read the reasoning and work through your due reviews."
            >
              <Link
                className={buttonVariants({
                  variant: "outline",
                  className: "w-full justify-between",
                })}
                href="/review"
              >
                Open mistake notebook
                <ArrowRight aria-hidden="true" />
              </Link>
            </ActionCard>
          </section>
          {d.catalog.publishedQuestions < 20 && (
            <p role="note" className="text-sm text-muted-foreground">
              {d.catalog.publishedQuestions} published questions are available. A practice set needs
              the full number of questions shown on its button.
            </p>
          )}
          <section aria-labelledby="home-topics-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="home-topics-heading">Study by topic</h2>
              <Link className="inline-link text-sm" href="/practice">
                Browse all topics
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {d.catalog.areas.map((area) => {
                const Icon = areaIcons[area.id] ?? BookOpen;
                return (
                  <Link
                    key={area.id}
                    href={`/practice?area=${area.id}` as Route}
                    className="group flex items-start gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="rounded-lg bg-secondary p-3 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold">{area.label}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {area.count} questions · {area.topics.length} topics
                      </p>
                    </div>
                    <ArrowRight className="mt-3 size-4 shrink-0 text-primary" aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>
          <p className="text-sm text-muted-foreground">
            {d.observedWeakTopic
              ? `Observed focus: ${d.observedWeakTopic.title} · ${Math.round(d.observedWeakTopic.accuracy * 100)}% across ${d.observedWeakTopic.count} answered first exposures.`
              : "Insufficient evidence to name a weak topic. Recommendations favor broad coverage."}{" "}
            Accuracy uses the five latest practice sets and includes blanks.
          </p>
          <details className="rounded-xl border bg-card p-5">
            <summary className="cursor-pointer py-2 font-medium">Study plan & preferences</summary>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <section className="space-y-4">
                <h2 className="text-lg">Your next step</h2>
                {d.diagnosticDecision === "pending" ? (
                  <>
                    <p>
                      Insufficient evidence: no proficiency is assumed yet. Take a diagnostic or
                      skip for a balanced starter plan.
                    </p>
                    <Link className={buttonVariants()} href="/diagnostic">
                      Take or skip a diagnostic
                    </Link>
                  </>
                ) : (
                  <>
                    <p>
                      {d.diagnosticDecision === "skipped"
                        ? "Insufficient evidence: a diagnostic has not been completed. Your plan uses broad coverage."
                        : d.recommendation}
                    </p>
                    {d.nextTask ? (
                      <>
                        <p className="font-medium">
                          {d.nextTask.minutes} minutes · {d.nextTask.kind} ·{" "}
                          {d.nextTask.scheduledOn === d.today ? "Today" : d.nextTask.scheduledOn}
                        </p>
                        <p>{d.nextTask.reason}</p>
                        <Link className={buttonVariants()} href={d.nextTask.href as Route}>
                          Open next study task
                        </Link>
                      </>
                    ) : (
                      <Link className={buttonVariants({ variant: "outline" })} href="/learn">
                        Choose a lesson
                      </Link>
                    )}
                  </>
                )}
                <Link className="inline-link block" href="/plan">
                  Open weekly plan
                </Link>
              </section>
              <section className="space-y-3">
                <h2 className="text-lg">Your study rhythm</h2>
                <p className="capitalize">{d.preferences.level}</p>
                <p>{d.preferences.dailyMinutes} minutes per study day</p>
                <p>{d.preferences.days.length} preferred days · Asia/Manila</p>
                <p>{d.preferences.targetDate ?? "No target date set"}</p>
                <p className="text-sm text-muted-foreground">
                  Personal target · not an official announcement
                </p>
                {d.daysRemaining !== null && (
                  <p>
                    {d.daysRemaining >= 0
                      ? `${d.daysRemaining} calendar days until your personal target`
                      : "Your personal target date has passed. You can choose a new date when ready."}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Weekly task completion is self-reported.
                </p>
              </section>
            </div>
          </details>
          <details className="rounded-xl border p-5">
            <summary className="cursor-pointer py-2 font-medium">
              Your optional personal dedication
            </summary>
            <div className="field mt-4">
              <Label htmlFor="dedication">A reminder you choose (optional)</Label>
              <Textarea
                id="dedication"
                value={dedication}
                maxLength={200}
                onChange={(e) => {
                  setDedication(e.target.value);
                  setSaved("");
                }}
              />
              <p className="field-hint">
                Private to your study space. Clear the text to remove it.
              </p>
              <Button disabled={pending} onClick={saveDedication}>
                Save personal dedication
              </Button>
              <p role="status">{saved}</p>
            </div>
          </details>
        </div>
      )}
    </>
  );
}
