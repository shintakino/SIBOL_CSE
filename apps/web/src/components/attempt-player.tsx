"use client";
import { ORPCError } from "@orpc/client";
import { areaLabels, providerTopicLabels, providerTopics } from "@sibol-cse/api/study-catalog";
import { Badge } from "@sibol-cse/ui/components/badge";
import { Button, buttonVariants } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sibol-cse/ui/components/dialog";
import { Label } from "@sibol-cse/ui/components/label";
import { Progress } from "@sibol-cse/ui/components/progress";
import { RadioGroup, RadioGroupItem } from "@sibol-cse/ui/components/radio-group";
import { Textarea } from "@sibol-cse/ui/components/textarea";
import { AlertCircle, Bookmark, CheckCircle2, CloudOff, Flag, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "@/utils/orpc";
import { AttemptTimer } from "./attempt-timer";
import { DeleteAttempt } from "./delete-attempt";
import { FormError } from "./feedback";
import { errorMessage, LoadState, SelectField, useData } from "./learning-ui";
import { OrderedAnswer } from "./ordered-answer";
import { ImageZoom, StudyImage } from "./study-image";

type Attempt = Awaited<ReturnType<typeof client.attempts.get>>;
type Item = Attempt["items"][number];
type SaveInput = Parameters<typeof client.attempts.saveAnswer>[0];
function answered(item: { selectedChoiceId: string | null; selectedOrder?: string[] | null }) {
  return !!item.selectedChoiceId || !!item.selectedOrder?.length;
}
function responseText(item: Item, key = false) {
  if (item.kind === "order")
    return (
      (key ? item.feedback?.answerOrder : item.selectedOrder)
        ?.map((id) => item.orderItems.find((i) => i.id === id)?.text ?? id)
        .join(" → ") ?? (key ? "Feedback unavailable" : "Unanswered")
    );
  return (
    item.choices.find((c) => c.id === (key ? item.feedback?.answerChoiceId : item.selectedChoiceId))
      ?.text ?? (key ? "Feedback unavailable" : "Unanswered")
  );
}
function ChoiceMedia({ item, choiceId }: { item: Item; choiceId: string | null | undefined }) {
  const media = item.choices.find((c) => c.id === choiceId)?.media;
  return media ? <StudyImage media={media} compact /> : null;
}
export function Feedback({
  feedback,
  orderItems = [],
}: {
  feedback: NonNullable<Item["feedback"]>;
  orderItems?: Item["orderItems"];
}) {
  return (
    <section className="space-y-4 border-t pt-5" aria-label="Answer explanation">
      <p className="status-row font-medium">
        {feedback.correct ? (
          <CheckCircle2 aria-hidden="true" />
        ) : (
          <AlertCircle aria-hidden="true" />
        )}
        {feedback.correct ? "Correct reasoning" : "Let’s work through it"}
      </p>
      {feedback.answerOrder && (
        <div>
          <h3 className="text-base font-medium">Correct order</h3>
          <ol className="list-inside list-decimal space-y-2">
            {feedback.answerOrder.map((id) => (
              <li key={id}>{orderItems.find((i) => i.id === id)?.text ?? id}</li>
            ))}
          </ol>
        </div>
      )}
      <p className="whitespace-pre-wrap reading">{feedback.explanation}</p>
      {Object.entries(feedback.distractorExplanations).map(([id, text]) => (
        <p key={id} className="text-sm text-muted-foreground">
          Choice {id}: {text}
        </p>
      ))}
      {feedback.erratum && (
        <p className="rounded-md bg-secondary p-4 text-secondary-foreground">
          Correction notice: {feedback.erratum} Original scoring is preserved.
        </p>
      )}
    </section>
  );
}
function PersonalTools({ attemptId, item }: { attemptId: string; item: Item }) {
  const load = useCallback(
    () => client.studyTools.get({ attemptId, itemId: item.id }),
    [attemptId, item.id],
  );
  const state = useData(load);
  const [note, setNote] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("unclear");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setNote(state.data?.note ?? "");
  }, [state.data?.note]);
  async function save(kind: "note" | "bookmark" | "report") {
    setPending(true);
    setSaved("");
    state.setError("");
    try {
      if (kind === "report") {
        await client.issues.report({
          attemptId,
          itemId: item.id,
          category: category as "wrong_answer" | "unclear" | "typo" | "rights",
          description,
        });
        setSaved("Issue reported. Thank you for helping improve this item.");
        setDescription("");
      } else {
        await client.studyTools.save({
          attemptId,
          itemId: item.id,
          kind,
          value: kind === "note" ? note : !state.data?.bookmarked,
          revision: state.data?.noteRevision ?? 0,
          mutationId: crypto.randomUUID(),
        });
        setSaved(kind === "note" ? "Private note saved." : "Bookmark updated.");
        await state.reload();
      }
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="mt-8 space-y-5 border-t pt-6" aria-label="Private study tools">
      <h2>Your study notebook</h2>
      <LoadState {...state} />
      <Button
        variant="outline"
        disabled={pending || !state.data}
        onClick={() => save("bookmark")}
        aria-pressed={state.data?.bookmarked ?? false}
      >
        <Bookmark aria-hidden="true" />
        {state.data?.bookmarked ? "Bookmarked" : "Bookmark question"}
      </Button>
      <div className="field">
        <Label htmlFor="private-note">Private note</Label>
        <Textarea
          id="private-note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setSaved("");
          }}
          maxLength={10000}
          rows={4}
        />
        <p className="field-hint">Only you can read this note.</p>
        <Button
          variant="outline"
          className="self-start"
          disabled={pending || !state.data}
          onClick={() => save("note")}
        >
          Save private note
        </Button>
      </div>
      <details>
        <summary className="cursor-pointer py-3 font-medium">Report an issue</summary>
        <div className="space-y-4 pt-4">
          <SelectField
            id="issue-category"
            label="Issue category"
            value={category}
            options={[
              { value: "wrong_answer", label: "Answer may be wrong" },
              { value: "unclear", label: "Unclear wording" },
              { value: "typo", label: "Typo" },
              { value: "rights", label: "Content rights concern" },
            ]}
            onChange={setCategory}
          />
          <div className="field">
            <Label htmlFor="issue-description">What needs a second look?</Label>
            <Textarea
              id="issue-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>
          <Button
            variant="outline"
            disabled={pending || !description.trim()}
            onClick={() => save("report")}
          >
            Send issue report
          </Button>
        </div>
      </details>
      <p role="status" className="text-sm text-success">
        {saved}
      </p>
    </section>
  );
}
export function AttemptPlayer({ id }: { id: string }) {
  const load = useCallback(() => client.attempts.get({ attemptId: id }), [id]);
  const state = useData(load);
  const [position, setPosition] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<SaveInput | null>(null);
  const attemptData = state.data;
  const item = attemptData?.items[position];
  const router = useRouter();
  const [deadlineReached, setDeadlineReached] = useState(false);
  const finalized = useCallback(() => router.replace(`/attempts/${id}/results`), [id, router]);
  const elapsed = useCallback((value: boolean) => setDeadlineReached(value), []);
  const generation = useRef(0);
  async function persist(input: SaveInput) {
    const run = ++generation.current;
    setDraft(input);
    setSaveStatus("saving");
    state.setError("");
    for (let n = 0; n < 3; n++) {
      try {
        const response = await client.attempts.saveAnswer(input);
        if (run !== generation.current) return;
        state.setData((current) =>
          current
            ? {
                ...current,
                items: current.items.map((i) =>
                  i.id === input.itemId
                    ? {
                        ...i,
                        selectedChoiceId: input.selectedChoiceId,
                        selectedOrder: input.selectedOrder ?? null,
                        confidence: input.confidence ?? null,
                        revision: response.revision,
                        savedAt: response.savedAt,
                      }
                    : i,
                ),
              }
            : null,
        );
        setDraft(null);
        setSaveStatus("saved");
        return;
      } catch (e) {
        if (
          e instanceof ORPCError &&
          !["INTERNAL_SERVER_ERROR", "SERVICE_UNAVAILABLE"].includes(e.code)
        ) {
          setSaveStatus("failed");
          state.setError(errorMessage(e));
          return;
        }
        if (n === 2) {
          setSaveStatus("failed");
          state.setError(
            "This change is not saved. Check your connection, then retry or reload the last acknowledged answer.",
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * 3 ** n));
      }
    }
  }
  async function choose(
    selectedChoiceId: string | null,
    confidence = item?.confidence ?? null,
    selectedOrder = item?.selectedOrder ?? null,
  ) {
    if (!item || saveStatus === "saving") return;
    await persist({
      attemptId: id,
      itemId: item.id,
      selectedChoiceId,
      selectedOrder: item.kind === "order" ? selectedOrder : null,
      confidence: confidence as "guessed" | "unsure" | "confident" | null,
      expectedRevision: item.revision,
      mutationId: crypto.randomUUID(),
    });
  }
  async function commit() {
    if (!item) return;
    setPending(true);
    state.setError("");
    try {
      const result = await client.attempts.commit({
        attemptId: id,
        itemId: item.id,
        revision: item.revision,
      });
      state.setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((i) =>
                i.id === item.id ? { ...i, committed: true, feedback: result } : i,
              ),
            }
          : null,
      );
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function flag() {
    if (!item) return;
    setPending(true);
    state.setError("");
    try {
      await client.attempts.setFlag({ attemptId: id, itemId: item.id, flagged: !item.flagged });
      state.setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((i) =>
                i.id === item.id ? { ...i, flagged: !i.flagged } : i,
              ),
            }
          : null,
      );
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function submit() {
    setPending(true);
    state.setError("");
    try {
      await client.attempts.submit({ attemptId: id });
      router.replace(`/attempts/${id}/results`);
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  function move(index: number) {
    setPosition(index);
    setSaveStatus("idle");
    setDraft(null);
    state.setError("");
  }
  const unsaved = saveStatus === "saving" || saveStatus === "failed";
  const ended = attemptData?.status !== "in_progress";
  const locked = ended || deadlineReached || item?.committed || pending || unsaved;
  return (
    <>
      <LoadState
        loading={state.loading}
        error={state.error}
        reload={() => {
          if (draft) {
            void persist(draft);
            return;
          }
          setSaveStatus("idle");
          void state.reload();
        }}
      />
      {attemptData && item && (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">
                {attemptData.mode === "diagnostic"
                  ? "Balanced diagnostic"
                  : attemptData.mode === "review"
                    ? "Scheduled review"
                    : attemptData.mode === "strict_mock"
                      ? attemptData.setKind === "full"
                        ? "Full strict mock"
                        : "Strict timed set"
                      : attemptData.mode === "timed_practice"
                        ? `Timed practice · ${attemptData.timeMultiplier / 100}× time`
                        : "Practice"}
              </p>
              <h1 className="mt-2 text-2xl">One question at a time.</h1>
            </div>
            <div className="status-row" role="status">
              {saveStatus === "saving" ? (
                <>
                  <LoaderCircle className="size-4" aria-hidden="true" />
                  Saving…
                </>
              ) : saveStatus === "failed" ? (
                <>
                  <CloudOff className="size-4" aria-hidden="true" />
                  Save failed · not acknowledged
                </>
              ) : saveStatus === "saved" || item.savedAt ? (
                <>
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Saved
                </>
              ) : (
                "No answer saved yet"
              )}
            </div>
          </div>
          {saveStatus === "failed" && (
            <div className="mb-5 flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  if (draft) void persist(draft);
                }}
              >
                Retry save
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDraft(null);
                  setSaveStatus("idle");
                  void state.reload();
                }}
              >
                Reload saved answer
              </Button>
            </div>
          )}
          {attemptData.expiresAt && !ended && (
            <AttemptTimer
              id={id}
              expiresAt={attemptData.expiresAt}
              serverNow={attemptData.serverNow}
              onFinalized={finalized}
              onElapsed={elapsed}
            />
          )}
          <Progress
            value={((position + 1) / attemptData.items.length) * 100}
            aria-label={`Question ${position + 1} of ${attemptData.items.length}`}
          />
          <Card className="mt-5">
            <CardHeader>
              <div className="flex flex-wrap justify-between gap-3">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {areaLabels[item.area as keyof typeof areaLabels] ?? "Study"} / {item.topic}
                  </Badge>
                  {item.provider &&
                    providerTopics.some(
                      (source) =>
                        source.subcategory === item.provider?.subcategory &&
                        source.topicId === item.topicId,
                    ) && (
                      <span className="text-sm text-muted-foreground">
                        {providerTopicLabels[item.provider.subcategory]}
                      </span>
                    )}
                </span>
                <span className="text-sm text-muted-foreground">
                  Question {position + 1} of {attemptData.items.length} ·{" "}
                  {item.firstExposure ? "First exposure" : "Repeated question"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {item.warning && (
                <p role="note" className="rounded-md border p-4 text-sm">
                  {item.warning}
                </p>
              )}
              {item.passage && (
                <blockquote className="reading whitespace-pre-wrap border-l-2 pl-5">
                  {item.passage}
                </blockquote>
              )}
              {item.instruction && <p className="text-sm font-medium">{item.instruction}</p>}
              {item.media && <StudyImage media={item.media} />}
              <p id="question-prompt" className="reading whitespace-pre-wrap">
                {item.prompt}
              </p>
              {item.highlight && (
                <p className="rounded-lg bg-secondary p-3">
                  Highlighted text: <strong>{item.highlight}</strong>
                </p>
              )}
              {item.kind === "order" ? (
                <OrderedAnswer
                  items={item.orderItems}
                  value={
                    draft?.itemId === item.id ? (draft.selectedOrder ?? null) : item.selectedOrder
                  }
                  disabled={!!locked}
                  onChange={(order) => {
                    void choose(null, item.confidence, order);
                  }}
                />
              ) : (
                <RadioGroup
                  className={
                    item.choices.some((c) => c.media) ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"
                  }
                  aria-labelledby="question-prompt"
                  value={
                    draft?.itemId === item.id
                      ? (draft.selectedChoiceId ?? "")
                      : (item.selectedChoiceId ?? "")
                  }
                  disabled={!!locked}
                  onValueChange={(v) => {
                    if (typeof v === "string") void choose(v);
                  }}
                >
                  {item.choices.map((c, index) => (
                    <div key={c.id} className="flex min-w-0 flex-col gap-2">
                      <Label
                        htmlFor={`answer-${item.id}-${c.id}`}
                        className="answer-option flex-1 items-start"
                      >
                        <RadioGroupItem id={`answer-${item.id}-${c.id}`} value={c.id} />
                        <span className="min-w-0 flex-1 space-y-3">
                          <span className="block">
                            <span
                              aria-hidden={item.kind !== "error"}
                              className="mr-2 inline-flex min-w-8 items-center justify-center rounded-md border px-2 py-1 text-sm font-medium"
                            >
                              {c.label ?? String.fromCharCode(65 + index)}
                            </span>
                            {c.text}
                          </span>
                          {c.media && <StudyImage media={c.media} compact zoom={false} />}
                          {item.feedback?.answerChoiceId === c.id && (
                            <span className="block text-sm font-medium">Correct answer</span>
                          )}
                        </span>
                      </Label>
                      {c.media && (
                        <span className="flex justify-end">
                          <ImageZoom
                            media={c.media}
                            label={`Enlarge choice ${c.label ?? String.fromCharCode(65 + index)}`}
                          />
                        </span>
                      )}
                    </div>
                  ))}
                </RadioGroup>
              )}
              {!ended && !item.committed && (
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    disabled={!!locked || !answered(item)}
                    onClick={() => choose(null, item.confidence, null)}
                  >
                    Clear answer
                  </Button>
                  <Button variant="outline" disabled={pending || unsaved} onClick={flag}>
                    <Flag aria-hidden="true" />
                    {item.flagged ? "Flagged" : "Flag for review"}
                  </Button>
                </div>
              )}
              {["practice", "review"].includes(attemptData.mode) && !item.committed && !ended && (
                <>
                  <SelectField
                    id="confidence"
                    label="Confidence (optional)"
                    value={item.confidence ?? "none"}
                    options={[
                      { value: "none", label: "No confidence label" },
                      { value: "guessed", label: "Guessed" },
                      { value: "unsure", label: "Unsure" },
                      { value: "confident", label: "Confident" },
                    ]}
                    disabled={!!locked}
                    onChange={(v) => choose(item.selectedChoiceId, v === "none" ? null : v)}
                  />
                  <Button disabled={pending || unsaved} onClick={commit}>
                    {pending
                      ? "Committing…"
                      : answered(item)
                        ? "Commit answer and see explanation"
                        : "Commit as unanswered"}
                  </Button>
                </>
              )}
              {attemptData.mode === "diagnostic" && !ended && (
                <p className="text-sm text-muted-foreground">
                  Your answer can change until submission. Explanations appear after the entire
                  diagnostic is completed.
                </p>
              )}
              {item.feedback && <Feedback feedback={item.feedback} orderItems={item.orderItems} />}
            </CardContent>
          </Card>
          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <Button
              variant="outline"
              disabled={position === 0 || unsaved || pending}
              onClick={() => move(position - 1)}
            >
              Previous question
            </Button>
            {position < attemptData.items.length - 1 ? (
              <Button disabled={unsaved || pending} onClick={() => move(position + 1)}>
                Next question
              </Button>
            ) : ended ? (
              <Link className={buttonVariants()} href={`/attempts/${id}/results`}>
                View results
              </Link>
            ) : (
              <Dialog>
                <DialogTrigger render={<Button disabled={unsaved || pending} />}>
                  Finish set
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Finish this set?</DialogTitle>
                    <DialogDescription>
                      {attemptData.items.filter((i) => !answered(i)).length} questions have no saved
                      answer. Blanks count against accuracy. Your acknowledged choices will be
                      finalized once.
                    </DialogDescription>
                  </DialogHeader>
                  <FormError message={state.error} />
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" disabled={pending} />}>
                      Keep studying
                    </DialogClose>
                    <Button disabled={pending || unsaved} onClick={submit}>
                      Submit saved answers
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <nav aria-label="Question navigation" className="mt-6 flex flex-wrap gap-2">
            {attemptData.items.map((i, index) => (
              <Button
                key={i.id}
                variant={position === index ? "default" : "outline"}
                disabled={unsaved || pending}
                aria-label={`Question ${index + 1}, ${answered(i) ? "answered" : "unanswered"}${i.flagged ? ", flagged" : ""}`}
                aria-current={position === index ? "step" : undefined}
                onClick={() => move(index)}
              >
                {index + 1}
                {i.flagged && <Flag className="size-3" aria-hidden="true" />}
                {answered(i) && <CheckCircle2 className="size-3" aria-hidden="true" />}
              </Button>
            ))}
          </nav>
          {!(["strict_mock", "diagnostic"].includes(attemptData.mode) && !ended) && (
            <PersonalTools key={item.id} attemptId={id} item={item} />
          )}
        </>
      )}
    </>
  );
}
export function AttemptResults({ id }: { id: string }) {
  const load = useCallback(() => client.attempts.results({ attemptId: id }), [id]);
  const state = useData(load);
  const r = state.data;
  return (
    <>
      <LoadState {...state} />
      {r && (
        <>
          <div className="page-heading">
            <p className="eyebrow">A useful checkpoint</p>
            <h1>
              {r.detail.mode === "diagnostic"
                ? "Your diagnostic starting point"
                : "What this set shows"}
            </h1>
            <p>
              These are practice observations, not an official rating or a prediction of passing.
              Blank answers are included in the denominator.
            </p>
          </div>
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            {[
              ["Correct", r.correct],
              ["Incorrect choices", r.incorrect],
              ["Unanswered", r.unanswered],
              ["Practice accuracy", `${Math.round((r.accuracy ?? 0) * 100)}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            {r.total} presented · {r.correct + r.incorrect} attempted · {r.elapsedSeconds} seconds ·
            Original scoring ({r.scoringVersion})
          </p>
          <div className="mb-6 space-y-3 rounded-xl border bg-card p-5">
            <p>
              Attempted accuracy:{" "}
              {r.attemptedAccuracy === null
                ? "No attempted answers"
                : `${Math.round(r.attemptedAccuracy * 100)}% of ${r.correct + r.incorrect} attempted`}
              .
            </p>
            <p>
              {r.uniqueQuestions} unique questions · {r.firstExposure.presented} first exposures (
              {r.firstExposure.correct} correct) · {r.repeated.presented} repeated (
              {r.repeated.correct} correct).
            </p>
            <p>
              Pacing:{" "}
              {r.secondsPerPresented === null
                ? "No timing data"
                : `${r.secondsPerPresented.toFixed(1)} seconds per presented question`}
              . Elapsed time includes reading and idle time.
            </p>
            {r.detail.expiresAt && (
              <p>
                {r.detail.setKind === "full"
                  ? "Full mock"
                  : r.detail.mode === "timed_practice"
                    ? "Practice timing / extended time"
                    : "Strict timed set"}{" "}
                ·{" "}
                {r.detail.status === "expired"
                  ? "Time expired; only acknowledged pre-deadline answers were scored."
                  : "Submitted before the original deadline."}
              </p>
            )}
          </div>
          <h2 className="mb-4">Observed topic coverage</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {r.topics.map((t) => (
              <div key={t.topicId} className="rounded-xl border p-5">
                <h3>{t.title}</h3>
                <p>
                  {t.correct}/{t.count} correct · {t.firstExposureCount} first-exposure answers
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t.provisional
                    ? "Needs more evidence: fewer than 10 first-exposure answers."
                    : t.firstExposureCorrect / t.firstExposureCount >= 0.7
                      ? "An observed strength in this sample. Keep checking unfamiliar questions."
                      : "A useful focus for your next lesson or practice set."}
                </p>
              </div>
            ))}
          </div>
          <div className="my-7 flex flex-wrap gap-3">
            <Link className={buttonVariants()} href="/practice">
              Choose another practice topic
            </Link>
            <Link className={buttonVariants({ variant: "outline" })} href="/learn">
              Find a lesson
            </Link>
            <Link className={buttonVariants({ variant: "outline" })} href="/review">
              Revisit mistakes
            </Link>
            <Link className={buttonVariants({ variant: "outline" })} href="/progress">
              View learning progress
            </Link>
            <DeleteAttempt id={id} />
          </div>
          <h2 className="mb-4">Review your reasoning</h2>
          <div className="space-y-6">
            {r.detail.items.map((item, index) => (
              <Card key={item.id}>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Question {index + 1} ·{" "}
                    {item.firstExposure ? "First exposure" : "Repeated exposure"} · Version{" "}
                    {item.version}
                  </p>
                  <p className="eyebrow">
                    {areaLabels[item.area as keyof typeof areaLabels] ?? "Study"} / {item.topic}
                  </p>
                  {item.passage && (
                    <blockquote className="reading whitespace-pre-wrap border-l-2 pl-4">
                      {item.passage}
                    </blockquote>
                  )}
                  {item.media && <StudyImage media={item.media} />}
                  {item.instruction && <p>{item.instruction}</p>}
                  <h3>{item.prompt}</h3>
                  {item.highlight && <p>Referenced text: {item.highlight}</p>}
                  {item.warning && <p role="note">{item.warning}</p>}
                  <p>Your saved answer: {responseText(item)}</p>
                  <p>Original key: {responseText(item, true)}</p>
                  <ChoiceMedia item={item} choiceId={item.selectedChoiceId} />
                  <ChoiceMedia item={item} choiceId={item.feedback?.answerChoiceId} />
                  {item.feedback && (
                    <Feedback feedback={item.feedback} orderItems={item.orderItems} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
