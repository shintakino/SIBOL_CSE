"use client";
import { ORPCError } from "@orpc/client";
import { Button } from "@sibol-cse/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sibol-cse/ui/components/dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { client } from "@/utils/orpc";
import { AttemptTimer } from "../attempt-timer";
import { errorMessage, LoadState, useData } from "../learning-ui";
import { OrderedAnswer } from "../ordered-answer";
import { ImageZoom, StudyImage } from "../study-image";
import { useReviewer } from "./shell";

type Attempt = Awaited<ReturnType<typeof client.attempts.get>>;
type Item = Attempt["items"][number];
type Save = Parameters<typeof client.attempts.saveAnswer>[0];
const answered = (item: Item) => !!item.selectedChoiceId || !!item.selectedOrder?.length;
function Explanation({ item }: { item: Item }) {
  const feedback = item.feedback;
  if (!feedback) return null;
  const key = feedback.answerOrder
    ? feedback.answerOrder
        .map((id) => item.orderItems.find((i) => i.id === id)?.text ?? id)
        .join(" → ")
    : item.choices.find((c) => c.id === feedback.answerChoiceId)?.text;
  return (
    <section className="explanation-card" aria-label="Answer explanation">
      <h2 className="explanation-title">
        {feedback.correct ? "✅ Correct Answer!" : "❌ Explanation & Rationale"}
      </h2>
      <p className="explanation-body">
        <strong>Correct answer: </strong>
        {key || "See the marked image choice."}
      </p>
      <p className="explanation-body whitespace-pre-wrap">{feedback.explanation}</p>
      {feedback.erratum && (
        <p className="explanation-ref">
          Correction notice: {feedback.erratum}. Original scoring is preserved.
        </p>
      )}
    </section>
  );
}
export function ReviewerPlayer({ id }: { id: string }) {
  const load = useCallback(() => client.attempts.get({ attemptId: id }), [id]),
    state = useData(load),
    router = useRouter(),
    reviewer = useReviewer();
  const [index, setIndex] = useState(0),
    [pending, setPending] = useState(false),
    [saveStatus, setSaveStatus] = useState(""),
    [draft, setDraft] = useState<Save | null>(null),
    [expired, setExpired] = useState(false),
    [eliminated, setEliminated] = useState<Record<string, string[]>>({});
  const active = useRef(false),
    data = state.data,
    item = data?.items[index];
  const bookmarkLoad = useCallback(
    () =>
      item
        ? client.reviewer.bookmark({ attemptId: id, itemId: item.id })
        : Promise.resolve({ saved: false }),
    [id, item],
  );
  const bookmark = useData(bookmarkLoad);
  const onFinalized = useCallback(() => router.replace(`/attempts/${id}/results`), [id, router]);
  const onElapsed = useCallback((value: boolean) => setExpired(value), []);
  const practice = data && ["practice", "review"].includes(data.mode),
    ended = data?.status !== "in_progress",
    locked = pending || expired || ended || !!item?.committed || !!draft;
  function updateItem(itemId: string, patch: Partial<Item>) {
    state.setData((current) =>
      current
        ? {
            ...current,
            items: current.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
          }
        : null,
    );
  }
  async function check(target: Item, revision: number) {
    const feedback = await client.attempts.commit({ attemptId: id, itemId: target.id, revision });
    updateItem(target.id, { committed: true, feedback });
    reviewer.sound(feedback.correct);
  }
  async function persist(input: Save) {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setDraft(input);
    setSaveStatus("Saving…");
    state.setError("");
    try {
      let saved: Awaited<ReturnType<typeof client.attempts.saveAnswer>> | undefined;
      for (let n = 0; n < 3; n++) {
        try {
          saved = await client.attempts.saveAnswer(input);
          break;
        } catch (e) {
          if (
            n === 2 ||
            (e instanceof ORPCError &&
              !["INTERNAL_SERVER_ERROR", "SERVICE_UNAVAILABLE"].includes(e.code))
          )
            throw e;
          await new Promise((resolve) => setTimeout(resolve, 300 * 3 ** n));
        }
      }
      if (!saved) throw new Error("This answer has not been saved. Please retry.");
      updateItem(input.itemId, {
        selectedChoiceId: input.selectedChoiceId,
        selectedOrder: input.selectedOrder ?? null,
        revision: saved.revision,
        savedAt: saved.savedAt,
      });
      const target = data?.items.find((i) => i.id === input.itemId);
      if (practice && target?.kind !== "order" && target) await check(target, saved.revision);
      setDraft(null);
      setSaveStatus("Saved to your account");
    } catch (e) {
      setSaveStatus("Save or feedback pending — retry before continuing");
      state.setError(errorMessage(e));
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  function choose(choiceId: string | null, order: string[] | null = null) {
    if (!item || locked) return;
    void persist({
      attemptId: id,
      itemId: item.id,
      selectedChoiceId: choiceId,
      selectedOrder: order,
      expectedRevision: item.revision,
      mutationId: crypto.randomUUID(),
      confidence: null,
    });
  }
  async function action(run: () => Promise<unknown>) {
    if (active.current) return;
    active.current = true;
    setPending(true);
    state.setError("");
    try {
      await run();
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  function move(next: number) {
    if (pending || draft) return;
    setIndex(next);
    state.setError("");
    setSaveStatus("");
  }
  async function submit() {
    await action(async () => {
      await client.attempts.submit({ attemptId: id });
      router.replace(`/attempts/${id}/results`);
    });
  }
  if (!data || !item) return <LoadState {...state} />;
  return (
    <div className="quiz-wrapper">
      <div className="quiz-header">
        <div className="quiz-progress-info">
          <ExitQuiz />
          <h1 className="quiz-title">
            Question {index + 1} of {data.items.length}
          </h1>
        </div>
        {data.expiresAt && !ended && (
          <AttemptTimer
            compact
            id={id}
            expiresAt={data.expiresAt}
            serverNow={data.serverNow}
            onFinalized={onFinalized}
            onElapsed={onElapsed}
          />
        )}
      </div>
      <div
        className="progress-bar-container"
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={0}
        aria-valuemax={data.items.length}
        aria-valuenow={index + 1}
      >
        <div
          className="progress-bar-fill"
          style={{ width: `${((index + 1) / data.items.length) * 100}%` }}
        />
      </div>
      <div className="quiz-body">
        <div className="question-meta">
          <span className="question-domain">{item.topic}</span>
          <div className="question-actions-top">
            <Button
              className="btn btn-outline"
              disabled={pending || bookmark.loading}
              aria-pressed={bookmark.data?.saved ?? false}
              onClick={() =>
                void action(async () => {
                  await client.reviewer.bookmark({
                    attemptId: id,
                    itemId: item.id,
                    saved: !bookmark.data?.saved,
                  });
                  await bookmark.reload();
                })
              }
            >
              {bookmark.data?.saved ? "★ Bookmarked" : "☆ Bookmark"}
            </Button>
            <Button
              className="btn btn-outline"
              disabled={pending || expired || ended}
              aria-pressed={item.flagged}
              onClick={() =>
                void action(async () => {
                  await client.attempts.setFlag({
                    attemptId: id,
                    itemId: item.id,
                    flagged: !item.flagged,
                  });
                  updateItem(item.id, { flagged: !item.flagged });
                })
              }
            >
              {item.flagged ? "🚩 Flagged" : "🏳️ Flag"}
            </Button>
          </div>
        </div>
        {item.warning && <p className="status-message">{item.warning}</p>}
        {item.passage && <p className="quiz-context">{item.passage}</p>}
        {item.media && (
          <div className="mb-5">
            <StudyImage media={item.media} />
          </div>
        )}
        <h2 className="question-text">{item.prompt}</h2>
        {item.instruction && <p className="quiz-context">{item.instruction}</p>}
        {item.highlight && <p className="quiz-context">{item.highlight}</p>}
        {item.kind === "order" ? (
          <div className="mb-6">
            <OrderedAnswer
              items={item.orderItems}
              value={item.selectedOrder}
              disabled={locked}
              onChange={(order) => choose(null, order)}
            />
          </div>
        ) : (
          <fieldset className="options-container" aria-label="Answer choices">
            {item.choices.map((choice, position) => {
              const selected = item.selectedChoiceId === choice.id,
                correct = item.feedback?.answerChoiceId === choice.id,
                wrong = !!item.feedback && selected && !item.feedback.correct,
                struck = eliminated[item.id]?.includes(choice.id);
              return (
                <div
                  className={`option-row ${choice.media ? "image-option-row" : ""}`}
                  key={choice.id}
                >
                  <Button
                    variant="ghost"
                    className={`option-btn ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""} ${struck ? "eliminated" : ""} ${locked ? "locked" : ""}`}
                    aria-pressed={selected}
                    disabled={locked}
                    onClick={() => choose(choice.id)}
                  >
                    <span className="option-letter">
                      {item.kind === "error"
                        ? (choice.label ?? String.fromCharCode(65 + position))
                        : String.fromCharCode(65 + position)}
                    </span>
                    <span className="option-text">
                      {choice.text}
                      {choice.media && <StudyImage media={choice.media} compact zoom={false} />}
                    </span>
                    {correct && (
                      <span role="img" aria-label="Correct answer">
                        ✓
                      </span>
                    )}
                    {wrong && (
                      <span role="img" aria-label="Incorrect answer">
                        ✕
                      </span>
                    )}
                  </Button>
                  {choice.media && (
                    <ImageZoom
                      media={choice.media}
                      label={`Enlarge choice ${String.fromCharCode(65 + position)} image`}
                    />
                  )}
                  <Button
                    variant="ghost"
                    className="btn-strike"
                    aria-label={`${struck ? "Restore" : "Eliminate"} option ${String.fromCharCode(65 + position)}`}
                    aria-pressed={!!struck}
                    disabled={pending || !!item.feedback}
                    onClick={() =>
                      setEliminated((old) => ({
                        ...old,
                        [item.id]: struck
                          ? (old[item.id] ?? []).filter((id) => id !== choice.id)
                          : [...(old[item.id] ?? []), choice.id],
                      }))
                    }
                  >
                    ✕
                  </Button>
                </div>
              );
            })}
          </fieldset>
        )}
        <p role="status" className="muted mb-3">
          {saveStatus || (item.savedAt ? "Saved to your account" : "")}
        </p>
        <LoadState loading={false} error={state.error || bookmark.error} reload={state.reload} />
        {draft && (
          <div className="flex flex-wrap gap-3 mb-5">
            <Button className="btn" disabled={pending} onClick={() => void persist(draft)}>
              Retry saving answer
            </Button>
            <Button
              className="btn btn-outline"
              disabled={pending}
              onClick={() => {
                setDraft(null);
                setSaveStatus("");
                void state.reload();
              }}
            >
              Reload saved answers
            </Button>
          </div>
        )}
        {practice && !item.committed && answered(item) && !draft && (
          <Button
            className="btn mb-5"
            disabled={pending || expired || ended}
            onClick={() => void action(() => check(item, item.revision))}
          >
            Check answer
          </Button>
        )}
        <Explanation item={item} />
        <div className="quiz-footer">
          <Button
            className="btn btn-outline"
            disabled={index === 0 || pending || !!draft}
            onClick={() => move(index - 1)}
          >
            ⬅️ Previous
          </Button>
          {ended ? (
            <Link className="btn" href={`/attempts/${id}/results`}>
              View results ➔
            </Link>
          ) : index < data.items.length - 1 ? (
            <Button className="btn" disabled={pending || !!draft} onClick={() => move(index + 1)}>
              Next ➔
            </Button>
          ) : (
            <SubmitQuiz
              disabled={pending || !!draft || expired}
              unanswered={data.items.filter((i) => !answered(i)).length}
              onSubmit={submit}
            />
          )}
        </div>
        <section className="mt-8 border-t pt-4" aria-label="Question Navigator">
          <h2 className="muted font-bold">Question Navigator</h2>
          <div className="palette-grid">
            {data.items.map((entry, n) => (
              <Button
                key={entry.id}
                variant="ghost"
                className={`palette-item ${n === index ? "current" : ""} ${answered(entry) ? "answered" : ""} ${entry.flagged ? "flagged" : ""}`}
                aria-label={`Question ${n + 1}, ${answered(entry) ? "answered" : "unanswered"}${entry.flagged ? ", flagged" : ""}`}
                aria-current={n === index ? "step" : undefined}
                disabled={pending || !!draft}
                onClick={() => move(n)}
              >
                {n + 1}
                {entry.flagged ? " ⚑" : ""}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
function ExitQuiz() {
  return (
    <Dialog>
      <DialogTrigger render={<Button className="btn btn-outline" />}>✕ Exit</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return to dashboard?</DialogTitle>
          <DialogDescription>
            Saved answers stay in your account. A timed quiz’s original deadline continues while you
            are away.
          </DialogDescription>
        </DialogHeader>
        <Link className="inline-link min-h-11 py-3" href="/dashboard">
          Exit quiz and return to dashboard
        </Link>
      </DialogContent>
    </Dialog>
  );
}
function SubmitQuiz({
  disabled,
  unanswered,
  onSubmit,
}: {
  disabled: boolean;
  unanswered: number;
  onSubmit: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="btn" disabled={disabled} />}>
        Finish & Submit ➔
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finish this quiz?</DialogTitle>
          <DialogDescription>
            {unanswered
              ? `${unanswered} question${unanswered === 1 ? "" : "s"} remain unanswered. Blanks count toward the total.`
              : "All questions have saved answers."}{" "}
            Your result is final once submitted.
          </DialogDescription>
        </DialogHeader>
        <Button
          disabled={disabled}
          onClick={() => {
            setOpen(false);
            void onSubmit();
          }}
        >
          Submit quiz
        </Button>
      </DialogContent>
    </Dialog>
  );
}
export function ReviewerResults({ id }: { id: string }) {
  const load = useCallback(() => client.attempts.results({ attemptId: id }), [id]),
    state = useData(load),
    reviewer = useReviewer();
  const result = state.data;
  return (
    <>
      <LoadState {...state} />
      {result && (
        <div className="results-card">
          <div className="results-badge-wrap" aria-hidden="true">
            {(result.accuracy ?? 0) >= 0.8 ? "🏆" : "📚"}
          </div>
          <h1 className="results-title">
            {(result.accuracy ?? 0) >= 0.8
              ? `Outstanding Work, ${reviewer.name.split(" ")[0]}!`
              : "Keep Going! Solid Practice Session!"}
          </h1>
          <div className="results-score-display">
            <span className="results-score-num">{Math.round((result.accuracy ?? 0) * 100)}</span>
            <span className="results-score-total">%</span>
          </div>
          <p className="font-semibold mb-4">
            {result.correct} of {result.total} Questions Correct
          </p>
          <div className="results-verdict">Practice complete · {result.unanswered} unanswered</div>
          <h2 className="text-left font-bold mb-4">Domain Score Breakdown</h2>
          <div className="domain-breakdown-grid">
            {result.topics.map((topic) => (
              <div className="domain-score-box" key={topic.topicId}>
                <div className="domain-score-header">
                  <span>{topic.title}</span>
                  <span>
                    {topic.correct}/{topic.count} ({Math.round((topic.correct / topic.count) * 100)}
                    %)
                  </span>
                </div>
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${(topic.correct / topic.count) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="muted">
            Your practice score includes blank answers. It is not an official CSC rating or a
            prediction of passing.
          </p>
          <div className="flashcard-controls">
            {(result.accuracy ?? 0) >= 0.8 && (
              <PracticeCertificate
                name={reviewer.name}
                score={Math.round((result.accuracy ?? 0) * 100)}
                date={result.createdAt}
              />
            )}
            <Button
              className="btn btn-outline"
              disabled={reviewer.busy}
              onClick={() => {
                if (result.detail.mode === "strict_mock" && [25, 50, 75].includes(result.total))
                  void reviewer.mock(result.total as 25 | 50 | 75);
                else void reviewer.start({ mode: "retake", attemptId: id });
              }}
            >
              🔄 Retake Quiz (Shuffled)
            </Button>
            <Link className="btn btn-outline" href="/dashboard">
              🏠 Back to Dashboard
            </Link>
          </div>
          <details className="mt-8 text-left">
            <summary className="cursor-pointer min-h-11 font-bold">
              Review Answers & Explanations
            </summary>
            {result.detail.items.map((item, n) => (
              <article className="cheatsheet-card mt-4" key={item.id}>
                <h2>
                  {n + 1}. {item.prompt}
                </h2>
                {item.passage && <p className="quiz-context">{item.passage}</p>}
                {item.media && <StudyImage media={item.media} />}
                <p className="muted mb-3">
                  Your answer:{" "}
                  {item.kind === "order"
                    ? (item.selectedOrder
                        ?.map((id) => item.orderItems.find((i) => i.id === id)?.text)
                        .join(" → ") ?? "Unanswered")
                    : (item.choices.find((c) => c.id === item.selectedChoiceId)?.text ??
                      "Unanswered")}
                </p>
                {item.choices
                  .filter((c) => c.media)
                  .map((choice) => (
                    <div className="mb-3" key={choice.id}>
                      <p>
                        {choice.text}
                        {item.feedback?.answerChoiceId === choice.id ? " · Correct answer" : ""}
                      </p>
                      {choice.media && <StudyImage media={choice.media} compact />}
                    </div>
                  ))}
                <Explanation item={item} />
              </article>
            ))}
          </details>
        </div>
      )}
    </>
  );
}
function PracticeCertificate({ name, score, date }: { name: string; score: number; date: Date }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button className="btn" />}>
        🎓 View Practice Certificate
      </DialogTrigger>
      <DialogContent className="cmms-certificate max-h-[90svh] overflow-y-auto sm:max-w-3xl print:translate-x-0 print:translate-y-0">
        <DialogHeader>
          <DialogTitle>CSE Exam Prep</DialogTitle>
          <DialogDescription>Independent Practice Achievement</DialogDescription>
        </DialogHeader>
        <div className="certificate-heading">Certificate of Practice Completion</div>
        <p>Presented to</p>
        <div className="certificate-name">{name}</div>
        <p>
          For completing a CSE practice quiz with a recorded score of <strong>{score}%</strong>.
        </p>
        <p className="certificate-note">
          A personal study milestone. This is not an official CSC certificate, eligibility or exam
          rating.
        </p>
        <div className="certificate-date">
          {date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" })}
        </div>
        <Button onClick={() => window.print()}>🖨️ Print / Save PDF</Button>
      </DialogContent>
    </Dialog>
  );
}
