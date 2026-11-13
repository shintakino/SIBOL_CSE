"use client";
import { buttonVariants } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import Link from "next/link";
import { useCallback } from "react";
import { client } from "@/utils/orpc";
import { LoadState, useData } from "./learning-ui";

type Progress = Awaited<ReturnType<typeof client.progress.summary>>;
const percent = (v: number | null) => (v === null ? "No data" : `${Math.round(v * 100)}%`);
function Trend({ title, rows }: { title: string; rows: Progress["history"] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-4">{title}</h2>
      {!rows.length ? (
        <p className="text-muted-foreground">No completed sets in this category yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}: original counts and elapsed time</caption>
            <thead>
              <tr className="border-b">
                <th className="p-4" scope="col">
                  Set
                </th>
                <th className="p-4" scope="col">
                  Correct / presented
                </th>
                <th className="p-4" scope="col">
                  Unanswered
                </th>
                <th className="p-4" scope="col">
                  Time used
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="p-4">
                    <Link className="inline-link" href={`/attempts/${a.id}/results`}>
                      {new Date(a.startedAt).toLocaleDateString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}{" "}
                      · {a.status}
                    </Link>
                  </td>
                  <td className="p-4 tabular-nums">
                    {a.correct}/{a.correct + a.incorrect + a.unanswered} (
                    {percent(a.correct / Math.max(1, a.correct + a.incorrect + a.unanswered))})
                  </td>
                  <td className="p-4">{a.unanswered}</td>
                  <td className="p-4">{a.elapsedSeconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
export function ProgressView() {
  const load = useCallback(() => client.progress.summary(), []),
    state = useData(load),
    d = state.data;
  return (
    <>
      <LoadState {...state} />
      {d && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Practice observations", percent(d.total.accuracy)],
              ["Unique questions presented", d.uniquePresented],
              ["Unique questions answered", d.uniqueAnswered],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="my-5 text-muted-foreground">
            {d.total.presented} presented · {d.total.attempted} attempted · {d.total.correct}{" "}
            correct. Blanks count against accuracy. Scheduled review is tracked separately from
            fresh practice evidence.
          </p>
          <Card>
            <CardHeader>
              <h2 className="capitalize">{d.indicator}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                This internal study indicator requires 85% in each of the last three strict short
                timed sets, 30 distinct questions across them, and five distinct answered questions
                in every enabled topic outside full mocks/reviews.
              </p>
              {d.uncoveredTopics.length > 0 && (
                <p>Needs more coverage: {d.uncoveredTopics.join(", ")}.</p>
              )}
              <p className="text-sm text-muted-foreground">
                This is an observation of practice consistency. It is not a CSC rating, prediction
                or pass probability. Extended-time practice and full mocks have their own trends.
              </p>
            </CardContent>
          </Card>
          <section className="mt-8">
            <h2 className="mb-4">First exposure and repeated questions</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["First exposure", d.firstExposure],
                ["Repeated exposure", d.repeated],
              ].map(([label, value]) => {
                if (typeof value === "string") return null;
                return (
                  <div key={String(label)} className="rounded-xl border bg-card p-5">
                    <h3>{String(label)}</h3>
                    <p>
                      {value.correct}/{value.presented} correct · {value.attempted} attempted ·{" "}
                      {percent(value.accuracy)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="mt-8">
            <h2 className="mb-4">Topic evidence</h2>
            <p className="mb-4 text-muted-foreground">
              Fewer than ten answered first exposures is provisional. Completion of a lesson does
              not add proficiency evidence.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {d.topics.map((t) => (
                <article key={t.id} className="rounded-xl border bg-card p-5">
                  <h3>{t.title}</h3>
                  <p className="mt-2">
                    {t.correct}/{t.presented} correct · {t.unique} distinct questions answered
                  </p>
                  <p>
                    {t.firstCorrect}/{t.firstCount} answered first exposures correct
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t.provisional
                      ? "Needs more evidence · provisional"
                      : t.firstCorrect / t.firstCount < 0.7
                        ? "A useful topic to revisit with unfamiliar questions."
                        : "An observed strength in this sample."}
                  </p>
                  <Link className="inline-link mt-4 inline-block" href={`/practice?topic=${t.id}`}>
                    Practice {t.title}
                  </Link>
                </article>
              ))}
            </div>
          </section>
          <Trend title="Strict short timed sets" rows={d.timedSetTrend} />
          <Trend title="Full mock trend" rows={d.fullMockTrend} />
          <Trend title="Practice timing and extended time" rows={d.extendedTrend} />
          <Trend title="Recent completed study sets" rows={d.history} />
          <p className="mt-6 text-muted-foreground">
            Deleting an attempt recalculates these derived statistics. Original keys/scores are
            preserved when content is corrected, with correction notices on the result.
          </p>
          <Link className={buttonVariants({ variant: "outline" })} href="/dashboard">
            Back to Today
          </Link>
        </>
      )}
    </>
  );
}
