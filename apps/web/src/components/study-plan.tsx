"use client";
import { Button, buttonVariants } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "@/utils/orpc";
import { errorMessage, LoadState, useData } from "./learning-ui";
export function StudyPlan() {
  const load = useCallback(() => client.plan.get(), []),
    state = useData(load);
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [weights, setWeights] = useState({ review: "20", priority: "60", mixed: "20" });
  const request = useRef<string | null>(null);
  useEffect(() => {
    if (state.data?.plan?.allocation) {
      const a = state.data.plan.allocation;
      setWeights({
        review: String(a.review),
        priority: String(a.priority),
        mixed: String(a.mixed),
      });
    }
  }, [state.data?.plan?.allocation]);
  async function rebuild() {
    setPending(true);
    state.setError("");
    setMessage("");
    try {
      request.current ??= crypto.randomUUID();
      const plan = await client.plan.generate({
        requestId: request.current,
        allocation: {
          review: Number(weights.review),
          priority: Number(weights.priority),
          mixed: Number(weights.mixed),
        },
      });
      state.setData(plan);
      request.current = null;
      setMessage("Plan rebuilt. Completed tasks are preserved.");
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function complete(id: string) {
    setPending(true);
    state.setError("");
    try {
      await client.plan.completeTask({ id });
      setMessage(
        "Task marked complete. This is a self-reported study session, separate from assessed proficiency.",
      );
      await state.reload();
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  const d = state.data;
  return (
    <>
      <LoadState {...state} />
      {d && (
        <>
          <Card>
            <CardHeader>
              <h2>A manageable week</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <p>
                {d.weekStart} – {d.weekEnd} · {d.completed}/{d.total} tasks completed
              </p>
              <p>
                {d.plan?.reason ?? "Generate a plan from your availability and reviewed content."}
              </p>
              <p className="text-sm text-muted-foreground">
                Estimates use five-minute units. At most two missed tasks, within 20% of remaining
                weekly time, carry forward. Uncarried missed tasks are archived; work older than 14
                days is not carried. The plan stops at your personal target date.
              </p>
              <details>
                <summary className="cursor-pointer py-3 font-medium">
                  Adjust time allocation
                </summary>
                <div className="grid gap-4 pt-4 sm:grid-cols-3">
                  {(["review", "priority", "mixed"] as const).map((kind) => (
                    <div className="field" key={kind}>
                      <Label htmlFor={`weight-${kind}`}>
                        {kind === "priority"
                          ? "Priority topics"
                          : kind === "mixed"
                            ? "Mixed retrieval"
                            : "Due reviews"}{" "}
                        (%)
                      </Label>
                      <Input
                        id={`weight-${kind}`}
                        type="number"
                        min={0}
                        max={100}
                        value={weights[kind]}
                        onChange={(e) => {
                          setWeights({ ...weights, [kind]: e.target.value });
                          request.current = null;
                        }}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm">
                  Percentages must total 100. Unavailable work leaves room for other eligible study.
                </p>
              </details>
              <div className="flex flex-wrap gap-3">
                <Button disabled={pending} onClick={rebuild}>
                  {pending ? "Updating…" : "Rebuild this week"}
                </Button>
                <Link className={buttonVariants({ variant: "outline" })} href="/settings">
                  Change availability
                </Link>
              </div>
            </CardContent>
          </Card>
          <p role="status" className="my-5 text-success">
            {message}
          </p>
          {d.tasks.length === 0 && (
            <p>
              No tasks fit your remaining dates, time and reviewed inventory. You can adjust your
              availability without losing completed work.
            </p>
          )}
          <div className="space-y-6">
            {[...new Set(d.tasks.map((t) => t.scheduledOn))].map((day) => (
              <section key={day} className="rounded-xl border bg-card p-5">
                <h2 className="mb-4">
                  {day === d.today ? "Today" : day} ·{" "}
                  {d.tasks.filter((t) => t.scheduledOn === day).reduce((n, t) => n + t.minutes, 0)}{" "}
                  planned minutes
                </h2>
                <ul className="divide-y">
                  {d.tasks
                    .filter((t) => t.scheduledOn === day)
                    .map((task) => (
                      <li
                        key={task.id}
                        className="flex flex-wrap items-center justify-between gap-4 py-5"
                      >
                        <div className="max-w-xl">
                          <p className="font-medium capitalize">
                            {task.kind} · {task.minutes} minutes
                            {task.completedAt ? " · Completed" : ""}
                            {task.carriedFromOn ? " · Carried forward" : ""}
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">{task.reason}</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <Link
                            className={buttonVariants({ variant: "outline" })}
                            href={task.href as Route}
                          >
                            Open study task
                          </Link>
                          <Button
                            variant="secondary"
                            disabled={pending || !!task.completedAt || task.scheduledOn > d.today}
                            onClick={() => complete(task.id)}
                          >
                            {task.completedAt ? "Completed" : "Mark task complete"}
                          </Button>
                        </div>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
