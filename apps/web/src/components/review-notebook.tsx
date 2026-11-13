"use client";
import { areaLabels } from "@sibol-cse/api/study-catalog";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { client } from "@/utils/orpc";
import { errorMessage, LoadState, SelectField, useData } from "./learning-ui";
import { NoteEditor } from "./saved-tools";
import { allSubjects, StudyFilters, type StudySelection } from "./study-catalog";
import { StudyImage } from "./study-image";
export function ReviewNotebook() {
  const [page, setPage] = useState(0),
    [count, setCount] = useState("10"),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [selection, setSelection] = useState<StudySelection>(allSubjects);
  const request = useRef<string | null>(null),
    manual = useRef(new Map<string, string>());
  const router = useRouter();
  const load = useCallback(
      async () => ({
        ...(await client.review.listDue({ page, ...selection })),
        catalog: await client.topics.catalog(),
      }),
      [page, selection],
    ),
    state = useData(load);
  async function start() {
    setPending(true);
    state.setError("");
    try {
      request.current ??= crypto.randomUUID();
      const a = await client.review.start({
        requestId: request.current,
        count: Number(count),
        ...selection,
      });
      router.push(`/attempts/${a.id}`);
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function tomorrow(questionId: string) {
    setPending(true);
    setMessage("");
    state.setError("");
    try {
      const requestId = manual.current.get(questionId) ?? crypto.randomUUID();
      manual.current.set(questionId, requestId);
      const result = await client.review.tomorrow({ questionId, requestId });
      manual.current.delete(questionId);
      setMessage(
        result.scheduled
          ? "Scheduled for tomorrow in your study timezone. The interval is reset."
          : "This item is unavailable for future review. Its history is preserved.",
      );
      await state.reload();
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  const data = state.data;
  return (
    <>
      <LoadState {...state} />
      {data && (
        <>
          <Card>
            <CardHeader>
              <h2>{data.dueCount} reviews due</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <p>
                Revisit a concept after a delay. Correct scheduled reviews return in 3, 7, 14, then
                30 days; mistakes return tomorrow. Repeating a question today does not advance
                several intervals.
              </p>
              {data.blockedCount > 0 && (
                <p role="note">
                  Some study material is hidden during your active assessment. Resume it from Today.
                </p>
              )}
              <StudyFilters
                catalog={data.catalog}
                value={selection}
                onChange={(value) => {
                  setSelection(value);
                  setPage(0);
                  request.current = null;
                }}
                prefix="review"
              />
              <SelectField
                id="review-count"
                label="Review session length"
                value={count}
                options={[5, 10, 20].map((n) => ({
                  value: String(n),
                  label: `Up to ${n} due questions`,
                }))}
                onChange={(v) => {
                  setCount(v);
                  request.current = null;
                }}
              />
              <Button disabled={pending || data.dueCount === 0} onClick={start}>
                {pending ? "Preparing…" : "Start due review"}
              </Button>
              {data.dueCount === 0 && (
                <p className="text-muted-foreground">
                  Nothing eligible is due right now. Your next scheduled review will appear here.
                </p>
              )}
            </CardContent>
          </Card>
          <p role="status" className="my-5 text-success">
            {message}
          </p>
          <h2 className="mb-4 mt-8">Your learning history, by concept</h2>
          <p className="mb-5 text-muted-foreground">
            Later success keeps earlier mistakes visible. These repeated questions do not become new
            first-exposure evidence.
          </p>
          {!data.history.length && (
            <p>
              No visible mistake or review history yet. Missed and skipped practice questions will
              appear here.
            </p>
          )}
          <div className="space-y-6">
            {[...new Set(data.history.map((e) => e.topicId))].map((topicId) => (
              <section key={topicId} className="rounded-xl border bg-card p-5">
                <p className="eyebrow">
                  {areaLabels[
                    data.history.find((e) => e.topicId === topicId)?.area as keyof typeof areaLabels
                  ] ?? "Study history"}
                </p>
                <h3 className="mb-4">{data.history.find((e) => e.topicId === topicId)?.topic}</h3>
                {data.history
                  .filter((e) => e.topicId === topicId)
                  .map((event) => (
                    <details key={event.id} className="border-t py-4">
                      <summary className="cursor-pointer py-2">
                        <span className="font-medium capitalize">{event.outcome}</span> ·{" "}
                        {event.studyDate} · {event.prompt}
                      </summary>
                      <div className="mt-4 space-y-4 reading">
                        {event.instruction && <p>{event.instruction}</p>}
                        {event.passage && (
                          <blockquote className="whitespace-pre-wrap border-l-2 pl-4">
                            {event.passage}
                          </blockquote>
                        )}
                        {event.media && <StudyImage media={event.media} />}
                        {event.highlight && <p>Referenced text: {event.highlight}</p>}
                        <p>Your response: {event.selected}</p>
                        {event.selectedMedia && <StudyImage media={event.selectedMedia} compact />}
                        <p>Original answer: {event.key ?? "Unavailable"}</p>
                        {event.keyMedia && <StudyImage media={event.keyMedia} compact />}
                        <p className="whitespace-pre-wrap">{event.explanation}</p>
                        {event.erratum && (
                          <p role="note">
                            Correction notice: {event.erratum} Original scoring is preserved.
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          Schedule step {event.fromStep} → {event.toStep}
                        </p>
                        <Button
                          variant="outline"
                          disabled={pending}
                          onClick={() => tomorrow(event.questionId)}
                        >
                          Review again tomorrow
                        </Button>
                        {data.blockedCount === 0 && (
                          <NoteEditor target={{ kind: "question", id: event.questionId }} />
                        )}
                      </div>
                    </details>
                  ))}
              </section>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <Button
              variant="outline"
              disabled={page === 0 || pending}
              onClick={() => setPage(page - 1)}
            >
              Previous history page
            </Button>
            <Button
              variant="outline"
              disabled={!data.hasMore || pending}
              onClick={() => setPage(page + 1)}
            >
              Next history page
            </Button>
          </div>
        </>
      )}
    </>
  );
}
