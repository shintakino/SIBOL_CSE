"use client";
import { Badge } from "@sibol-cse/ui/components/badge";
import { Button, buttonVariants } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@sibol-cse/ui/components/card";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { client } from "@/utils/orpc";
import { FormError } from "./feedback";
import { errorMessage, LoadState, SelectField, useData } from "./learning-ui";
import { LessonBody, lessonSections } from "./lesson-content";
import { SavedTools } from "./saved-tools";
export function LessonLibrary() {
  const load = useCallback(() => client.lessons.list(), []);
  const state = useData(load);
  return (
    <>
      <LoadState {...state} />
      {state.data?.length === 0 && (
        <p className="rounded-xl border bg-card p-6">
          No reviewed lessons are available for your selected level yet.
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {state.data?.map((lesson) => (
          <Card key={lesson.id}>
            <CardHeader>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge variant="secondary">{lesson.topic}</Badge>
                <Badge variant="outline">Version {lesson.version}</Badge>
              </div>
              <CardTitle>
                <h2>{lesson.title}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-5 text-sm text-muted-foreground">
                {lesson.completedAt
                  ? "Reading completed · proficiency is measured separately"
                  : lesson.location
                    ? "Pick up where you left off"
                    : "A concept, a worked example, and a useful technique."}
              </p>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/learn/${lesson.slug}`}
              >
                {lesson.location && !lesson.completedAt ? "Resume lesson" : "Read lesson"}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
export function LessonReader({ slug }: { slug: string }) {
  const [latest, setLatest] = useState(false);
  const load = useCallback(() => client.lessons.get({ slug, latest }), [slug, latest]);
  const state = useData(load);
  const [location, setLocation] = useState("concept");
  const [pending, setPending] = useState(false),
    [saved, setSaved] = useState("");
  useEffect(() => {
    if (!state.data) return;
    const remembered =
      state.data.progress?.versionId === state.data.versionId
        ? (state.data.progress.location ?? "concept")
        : "concept";
    setLocation(remembered);
    if (remembered !== "concept") document.getElementById(remembered)?.scrollIntoView();
  }, [state.data]);
  async function save(complete: boolean) {
    if (!state.data) return;
    setPending(true);
    state.setError("");
    setSaved("");
    try {
      await client.lessons.saveProgress({
        versionId: state.data.versionId,
        location: location as "concept" | "workedExample" | "commonMistake" | "technique",
        revision: state.data.progress?.revision ?? 0,
        complete,
      });
      setSaved(
        complete
          ? "Reading completed. Proficiency is measured separately."
          : "Reading place saved.",
      );
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
      {state.data && (
        <>
          <div className="page-heading">
            <p className="eyebrow">
              {state.data.topic} · Version {state.data.version}
            </p>
            <h1>{state.data.title}</h1>
            {state.data.erratum && <p role="note">Correction notice: {state.data.erratum}</p>}
            {state.data.versionId !== state.data.latestVersionId && (
              <div className="mt-4 flex flex-wrap gap-3">
                <p>You’re resuming the version you started. A newer version is available.</p>
                <Button variant="outline" onClick={() => setLatest(true)}>
                  Read latest version
                </Button>
              </div>
            )}
          </div>
          <Card className="max-w-4xl">
            <CardContent>
              <LessonBody structure={state.data.structure} />
            </CardContent>
          </Card>
          <div className="mt-8 max-w-4xl space-y-5">
            <SelectField
              id="reading-place"
              label="Remember my place"
              value={location}
              options={lessonSections.map((s) => ({ value: s.key, label: s.title }))}
              onChange={(v) => {
                setLocation(v);
                setSaved("");
              }}
            />
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" disabled={pending} onClick={() => save(false)}>
                Save reading place
              </Button>
              <Button disabled={pending} onClick={() => save(true)}>
                Mark reading complete
              </Button>
              <Link
                className={buttonVariants({ variant: "secondary" })}
                href={`/practice?topic=${state.data.topicId}`}
              >
                Practice this topic
              </Link>
            </div>
            <p role="status" className="text-sm text-success">
              {saved}
            </p>
            <FormError message={state.error} />
            <SavedTools target={{ kind: "lesson", id: state.data.id }} />
          </div>
        </>
      )}
    </>
  );
}
