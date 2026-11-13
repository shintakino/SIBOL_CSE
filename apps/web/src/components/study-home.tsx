"use client";
import { Button, buttonVariants } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import { Label } from "@sibol-cse/ui/components/label";
import { Textarea } from "@sibol-cse/ui/components/textarea";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { client } from "@/utils/orpc";
import { errorMessage, LoadState, useData } from "./learning-ui";
export function StudyHome() {
  const load = useCallback(() => client.dashboard.get(), []),
    state = useData(load),
    d = state.data;
  const [dedication, setDedication] = useState(""),
    [pending, setPending] = useState(false),
    [saved, setSaved] = useState("");
  useEffect(() => {
    setDedication(d?.dedication ?? "");
  }, [d?.dedication]);
  async function saveDedication() {
    setPending(true);
    state.setError("");
    try {
      await client.dashboard.setDedication({ dedication: dedication.trim() || null });
      setSaved("Personal dedication saved.");
      await state.reload();
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <LoadState {...state} />
      {d && (
        <>
          {d.dedication && (
            <p className="mb-6 border-l-2 border-primary pl-5 text-lg">{d.dedication}</p>
          )}
          {d.activeAssessment && (
            <p role="note" className="mb-6 rounded-xl border bg-secondary p-5">
              Your assessment is active. Resume with the original deadline and acknowledged answers.
              Analytics and related study feedback become available after completion.
            </p>
          )}
          <div className="study-grid">
            <Card>
              <CardHeader>
                <h2>
                  {d.diagnosticDecision === "pending"
                    ? "Start with a balanced check-in."
                    : "Your next manageable step"}
                </h2>
              </CardHeader>
              <CardContent className="space-y-5">
                {d.diagnosticDecision === "pending" ? (
                  <>
                    <p>
                      Take a diagnostic or skip for a balanced starter plan. Insufficient evidence:
                      no proficiency is assumed yet.
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
                      <>
                        <p>
                          No task fits the remaining time, dates and reviewed inventory. Choose a
                          small next step or adjust your availability.
                        </p>
                        <Link className={buttonVariants()} href="/learn">
                          Choose a lesson
                        </Link>
                      </>
                    )}
                  </>
                )}
                <Link className="inline-link block" href="/plan">
                  Open weekly plan
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h2>Your study rhythm</h2>
              </CardHeader>
              <CardContent className="space-y-3">
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
              </CardContent>
            </Card>
          </div>
          <section className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              [
                d.inAppReminders ? "Due reviews" : "In-app review reminders",
                d.inAppReminders ? d.dueCount : "Off",
              ],
              ["Weekly tasks completed", `${d.weekCompleted}/${d.weekTotal}`],
              [
                "Recent practice accuracy",
                d.recentPracticeAccuracy === null
                  ? "No data available"
                  : `${Math.round(d.recentPracticeAccuracy * 100)}%`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-5">
                <h2 className="text-base">{label}</h2>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </section>
          <p className="mt-4 text-sm text-muted-foreground">
            Weekly task completion is self-reported. Accuracy uses the five latest practice sets and
            includes blanks.
          </p>
          {d.observedWeakTopic ? (
            <p className="mt-5">
              Observed focus: {d.observedWeakTopic.title} ·{" "}
              {Math.round(d.observedWeakTopic.accuracy * 100)}% across {d.observedWeakTopic.count}{" "}
              answered first exposures.
            </p>
          ) : (
            <p className="mt-5 text-muted-foreground">
              Insufficient evidence to name a weak topic. Recommendations favor broad coverage.
            </p>
          )}
          <section className="mt-8">
            <h2 className="mb-4">Pick up where you left off</h2>
            {!d.active.length && (
              <p>
                No active question sets. Your acknowledged answers will be restored here when you
                return.
              </p>
            )}
            <ul className="space-y-4">
              {d.active.map((a) => (
                <li key={a.id} className="rounded-xl border bg-card p-5">
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
                  <p className="mt-2 text-sm text-muted-foreground">
                    {a.savedAt
                      ? "Saved answers acknowledged by the server."
                      : "No answer has been acknowledged yet."}
                    {a.expiresAt
                      ? ` Original deadline: ${new Date(a.expiresAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Asia/Manila).`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <nav aria-label="Study tools" className="mt-8 flex flex-wrap gap-3">
            {[
              ["/review", "Mistake notebook"],
              ["/bookmarks", "Saved & search"],
              ["/plan", "Weekly plan"],
              ["/mock-exams", "Timed sets & mocks"],
              ["/progress", "Learning progress"],
              ["/learn", "Open lesson library"],
              ["/practice", "Start practice"],
            ].map(([href, label]) => (
              <Link
                className={buttonVariants({ variant: "outline" })}
                key={href}
                href={(href ?? "/dashboard") as Route}
              >
                {label}
              </Link>
            ))}
          </nav>
          <details className="mt-8 rounded-xl border p-5">
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
        </>
      )}
    </>
  );
}
