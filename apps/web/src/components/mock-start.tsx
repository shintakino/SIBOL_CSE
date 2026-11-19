"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { client } from "@/utils/orpc";
import { errorMessage, LoadState, SelectField, useData } from "./learning-ui";
import {
  allSubjects,
  StudyFilters,
  type StudySelection,
  selectionAvailability,
} from "./study-catalog";
export function MockStart() {
  const load = useCallback(
      async () => ({ ...(await client.mocks.list()), catalog: await client.topics.catalog() }),
      [],
    ),
    state = useData(load),
    router = useRouter();
  const [kind, setKind] = useState("short"),
    [mode, setMode] = useState("strict_mock"),
    [count, setCount] = useState("10"),
    [multiplier, setMultiplier] = useState("100"),
    [pending, setPending] = useState(false);
  const [selection, setSelection] = useState<StudySelection>(allSubjects);
  const request = useRef<string | null>(null);
  const requestConfig = useRef("");
  const creating = useRef(false);
  const change = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    request.current = null;
  };
  async function start(preset?: 10 | 20 | 30) {
    if (creating.current) return;
    creating.current = true;
    setPending(true);
    state.setError("");
    try {
      const config = {
        ...(preset || kind === "full" ? allSubjects : selection),
        kind: (preset ? "short" : kind) as "short" | "full",
        mode: (preset || kind === "full" ? "strict_mock" : mode) as
          | "strict_mock"
          | "timed_practice",
        count: (preset ?? Number(count)) as 10 | 20 | 30,
        multiplier: (preset || kind === "full" || mode === "strict_mock"
          ? 100
          : Number(multiplier)) as 100 | 150 | 200,
      };
      const key = JSON.stringify(config);
      if (!request.current || requestConfig.current !== key) {
        request.current = crypto.randomUUID();
        requestConfig.current = key;
      }
      const a = await client.mocks.start({ ...config, requestId: request.current });
      router.push(`/attempts/${a.id}`);
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      creating.current = false;
      setPending(false);
    }
  }
  const d = state.data,
    p = d?.profile;
  const available = d ? selectionAvailability(d.catalog, selection) : 0;
  const minutes = p
    ? kind === "full"
      ? p.durationMinutes
      : Math.ceil((p.durationMinutes * Number(count)) / p.itemCount) *
        (mode === "strict_mock" ? 1 : Number(multiplier) / 100)
    : null;
  return (
    <>
      <LoadState {...state} />
      {d && (
        <>
          <section aria-label="Quick timed exams" className="mb-8 grid gap-4 sm:grid-cols-3">
            {([10, 20, 30] as const).map((length) => (
              <Card key={length}>
                <CardHeader>
                  <h2 className="text-lg">{length}-question exam</h2>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {p
                      ? `${Math.ceil((p.durationMinutes * length) / p.itemCount)} minutes · strict timing`
                      : "An active exam profile is needed."}
                  </p>
                  <Button
                    className="w-full"
                    variant={length === 20 ? "default" : "outline"}
                    disabled={pending || !p || d.catalog.publishedQuestions < length}
                    onClick={() => start(length)}
                  >
                    Start {length}-question exam
                  </Button>
                </CardContent>
              </Card>
            ))}
          </section>
          <Card>
            <CardHeader>
              <h2>Build your own timed set</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="capitalize">
                {d.level} · {p ? `Profile v${p.version}` : "No activated profile"}
              </p>
              {p && (
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer font-medium">
                    Exam format & timing details
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {p.itemCount} scored questions / {p.durationMinutes} minutes for a full mock.
                    EDQ is excluded. Source: {p.sourceTitle}. This independent practice does not
                    provide an official rating.
                  </p>
                </details>
              )}
              <SelectField
                id="mock-kind"
                label="Timed set type"
                value={kind}
                options={[
                  { value: "short", label: "Short timed set" },
                  { value: "full", label: "Full strict mock" },
                ]}
                onChange={change(setKind)}
              />
              {kind === "short" && (
                <>
                  <StudyFilters
                    catalog={d.catalog}
                    value={selection}
                    onChange={(value) => {
                      setSelection(value);
                      request.current = null;
                    }}
                    prefix="mock"
                  />
                  <SelectField
                    id="mock-count"
                    label="Timed set length"
                    value={count}
                    options={[10, 20, 30].map((n) => ({
                      value: String(n),
                      label: `${n} questions`,
                    }))}
                    onChange={change(setCount)}
                  />
                  <SelectField
                    id="mock-mode"
                    label="Timing mode"
                    value={mode}
                    options={[
                      { value: "strict_mock", label: "Strict timing" },
                      { value: "timed_practice", label: "Practice timing / extended time" },
                    ]}
                    onChange={change(setMode)}
                  />
                  {mode === "timed_practice" && (
                    <SelectField
                      id="mock-multiplier"
                      label="Practice time allowance"
                      value={multiplier}
                      options={[
                        { value: "100", label: "Standard time · practice" },
                        { value: "150", label: "1.5× time · practice" },
                        { value: "200", label: "2× time · practice" },
                      ]}
                      onChange={change(setMultiplier)}
                    />
                  )}
                </>
              )}
              <p>
                {minutes !== null
                  ? `${minutes} minutes · the clock starts when you begin.`
                  : "An administrator must activate a verified exam profile before starting."}
              </p>
              <p>
                Explanations appear after you finish. Refresh keeps your saved answers and the
                original time limit. Check that your answer is saved before moving on.
              </p>
              {kind === "full" && !d.fullReady && (
                <div role="note" className="rounded-lg border p-4">
                  <p className="font-medium">Full mock unavailable</p>
                  <ul className="mt-3 list-inside list-disc">
                    {d.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
              {mode === "timed_practice" && kind === "short" && (
                <p className="rounded-lg bg-secondary p-4">
                  Practice timing is tracked separately from strict timed-set consistency.
                </p>
              )}
              {kind === "short" && available < Number(count) && (
                <p role="note">
                  {available} published questions match this focus; {count} are required. Choose a
                  broader category or a shorter timed set.
                </p>
              )}
              <Button
                disabled={
                  pending || !p || (kind === "full" ? !d.fullReady : available < Number(count))
                }
                onClick={() => start()}
              >
                {pending
                  ? "Preparing…"
                  : kind === "full"
                    ? "Start full strict mock"
                    : mode === "timed_practice"
                      ? "Start timed practice"
                      : "Start strict timed set"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
