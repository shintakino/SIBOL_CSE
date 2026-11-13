"use client";
import { Button, buttonVariants } from "@sibol-cse/ui/components/button";
import { Card, CardContent } from "@sibol-cse/ui/components/card";
import { Checkbox } from "@sibol-cse/ui/components/checkbox";
import { Label } from "@sibol-cse/ui/components/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { client } from "@/utils/orpc";
import { FormError } from "./feedback";
import { errorMessage, LoadState, SelectField, useData } from "./learning-ui";
import {
  StudyCatalogCards,
  StudyFilters,
  type StudySelection,
  selectionAvailability,
} from "./study-catalog";
export function PracticeStart({ initialTopic = "" }: { initialTopic?: string }) {
  const router = useRouter();
  const load = useCallback(
    async () => ({
      catalog: await client.topics.catalog(),
      profile: await client.profile.get(),
      attempts: await client.attempts.list(),
    }),
    [],
  );
  const state = useData(load);
  const [selection, setSelection] = useState<StudySelection>({
      area: "all",
      topicId: initialTopic || "mixed",
      providerSubcategory: null,
    }),
    [difficulty, setDifficulty] = useState("any"),
    [count, setCount] = useState("5"),
    [unseen, setUnseen] = useState(true),
    [pending, setPending] = useState(false);
  const request = useRef(crypto.randomUUID());
  async function start() {
    setPending(true);
    state.setError("");
    try {
      const a = await client.practice.create({
        ...selection,
        difficulty: difficulty as "any" | "easy" | "medium" | "hard",
        count: Number(count) as 5 | 10 | 20,
        unseenFirst: unseen,
        requestId: request.current,
      });
      router.push(`/attempts/${a.id}`);
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  const changed = () => {
    request.current = crypto.randomUUID();
    state.setError("");
  };
  const available = state.data ? selectionAvailability(state.data.catalog, selection) : 0;
  const select = (value: StudySelection) => {
    setSelection(value);
    changed();
  };
  return (
    <>
      <LoadState {...state} />
      {state.data && (
        <StudyCatalogCards
          catalog={state.data.catalog}
          onSelect={(value) => {
            select(value);
            document.getElementById("practice-options-heading")?.focus();
          }}
        />
      )}
      <Card className="mt-8 max-w-2xl" id="practice-options">
        <CardContent className="space-y-6">
          <h2 id="practice-options-heading" tabIndex={-1} className="scroll-mt-8">
            Prepare a practice set
          </h2>
          {state.data && (
            <StudyFilters
              catalog={state.data.catalog}
              value={selection}
              onChange={select}
              prefix="practice"
            />
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id="practice-difficulty"
              label="Difficulty"
              value={difficulty}
              options={["any", "easy", "medium", "hard"].map((v) => ({
                value: v,
                label: v === "any" ? "Any difficulty" : v[0]?.toUpperCase() + v.slice(1),
              }))}
              onChange={(v) => {
                setDifficulty(v);
                changed();
              }}
            />
            <SelectField
              id="practice-length"
              label="Set length"
              value={count}
              options={[5, 10, 20].map((n) => ({ value: String(n), label: `${n} questions` }))}
              onChange={(v) => {
                setCount(v);
                changed();
              }}
            />
          </div>
          <Label htmlFor="unseen-first" className="flex min-h-11 items-center gap-3">
            <Checkbox
              id="unseen-first"
              checked={unseen}
              onCheckedChange={(v) => {
                setUnseen(!!v);
                changed();
              }}
            />
            Prefer questions I haven’t seen
          </Label>
          <p className="text-sm text-muted-foreground">
            Every choice is saved before commitment. Explanations appear when you commit an answer.
            Shortages never create duplicate questions.
          </p>
          {available < Number(count) && state.data && (
            <p role="note">
              {available} published questions match this selection. Choose a smaller set or another
              subcategory.
            </p>
          )}
          <Button disabled={pending || available < Number(count) || !state.data} onClick={start}>
            {pending ? "Preparing your set…" : "Start practice"}
          </Button>
          <FormError message={state.error} />
        </CardContent>
      </Card>
      <section className="mt-8">
        <h2 className="mb-3">A balanced starting point</h2>
        <p className="mb-4 text-muted-foreground">
          A diagnostic samples the enabled topic areas and keeps early results provisional.
        </p>
        <Link className={buttonVariants({ variant: "outline" })} href="/diagnostic">
          Take or skip a diagnostic
        </Link>
      </section>
      <section className="mt-8">
        <h2 className="mb-4">Your recent sets</h2>
        {state.data?.attempts.length === 0 && (
          <p className="text-muted-foreground">Your first set will appear here.</p>
        )}
        <ul className="space-y-3">
          {state.data?.attempts.map((a) => (
            <li key={a.id}>
              <Link
                className="inline-link"
                href={
                  a.status === "in_progress" ? `/attempts/${a.id}` : `/attempts/${a.id}/results`
                }
              >
                {a.mode === "diagnostic"
                  ? "Diagnostic"
                  : a.mode === "review"
                    ? "Review"
                    : a.mode === "strict_mock"
                      ? "Strict timed set / mock"
                      : a.mode === "timed_practice"
                        ? "Timed practice"
                        : "Practice"}{" "}
                · {a.status === "in_progress" ? "Resume saved set" : "View result"}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
export function DiagnosticStart() {
  const load = useCallback(() => client.diagnostic.options(), []);
  const state = useData(load);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const request = useRef(crypto.randomUUID());
  async function act(skip: boolean) {
    setPending(true);
    state.setError("");
    try {
      if (skip) {
        await client.diagnostic.skip();
        router.push("/dashboard");
      } else {
        const a = await client.diagnostic.create({ requestId: request.current });
        router.push(`/attempts/${a.id}`);
      }
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-6">
        <LoadState {...state} />
        <p className="reading">
          {state.data?.count ?? 30} questions, balanced across your level’s enabled topics.
          Explanations stay hidden until you finish.
        </p>
        <p className="text-muted-foreground">
          This is a starting point, not an official rating or a prediction of passing. Topics with
          fewer than 10 first-exposure answers need more evidence.
        </p>
        {state.data && !state.data.available && (
          <p>
            No verified exam profile is active yet. You can still skip and keep a balanced starter
            plan.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button disabled={pending || !state.data?.available} onClick={() => act(false)}>
            {pending ? "Please wait…" : "Start diagnostic"}
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => act(true)}>
            Skip for now
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Skipping uses broad coverage without inventing proficiency. You can return when you’re
          ready.
        </p>
        <FormError message={state.error} />
      </CardContent>
    </Card>
  );
}
