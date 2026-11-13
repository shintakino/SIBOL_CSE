"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { client } from "@/utils/orpc";
import { errorMessage, LoadState, SelectField, useData } from "./learning-ui";
export function MockStart() {
  const load = useCallback(() => client.mocks.list(), []),
    state = useData(load),
    router = useRouter();
  const [kind, setKind] = useState("short"),
    [mode, setMode] = useState("strict_mock"),
    [count, setCount] = useState("10"),
    [multiplier, setMultiplier] = useState("100"),
    [pending, setPending] = useState(false);
  const request = useRef<string | null>(null);
  const change = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    request.current = null;
  };
  async function start() {
    setPending(true);
    state.setError("");
    try {
      request.current ??= crypto.randomUUID();
      const a = await client.mocks.start({
        requestId: request.current,
        kind: kind as "short" | "full",
        mode: kind === "full" ? "strict_mock" : (mode as "strict_mock" | "timed_practice"),
        count: Number(count) as 10 | 20 | 30,
        multiplier: (kind === "full" || mode === "strict_mock" ? 100 : Number(multiplier)) as
          | 100
          | 150
          | 200,
      });
      router.push(`/attempts/${a.id}`);
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  const d = state.data,
    p = d?.profile;
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
        <Card>
          <CardHeader>
            <h2>One uninterrupted set</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="capitalize">
              {d.level} · {p ? `Profile v${p.version}` : "No activated profile"}
            </p>
            {p && (
              <p className="text-sm text-muted-foreground">
                {p.itemCount} scored questions / {p.durationMinutes} minutes for a full mock. EDQ is
                excluded. Source: {p.sourceTitle}. This independent practice does not provide an
                official rating.
              </p>
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
                <SelectField
                  id="mock-count"
                  label="Timed set length"
                  value={count}
                  options={[10, 20, 30].map((n) => ({ value: String(n), label: `${n} questions` }))}
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
                ? `${Math.round(minutes * 60)} seconds · server-timed from the moment you start.`
                : "An administrator must activate a verified exam profile before starting."}
            </p>
            <p>
              No pause or explanations during the set. Refresh and reconnect retain the original
              deadline. Only answers acknowledged before expiry count. Repeated questions are
              labeled; unseen items are preferred. Flags and leaving a tab are study/navigation
              actions, not proof of cheating.
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
            <Button disabled={pending || !p || (kind === "full" && !d.fullReady)} onClick={start}>
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
      )}
    </>
  );
}
