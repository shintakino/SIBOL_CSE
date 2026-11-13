"use client";
import type { Target } from "@sibol-cse/api/library-contracts";
import { Button, buttonVariants } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import { Checkbox } from "@sibol-cse/ui/components/checkbox";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useState } from "react";
import { client } from "@/utils/orpc";
import { errorMessage, LoadState, SelectField, useData } from "./learning-ui";
import { NoteEditor, SavedTools } from "./saved-tools";

type Preview = NonNullable<Awaited<ReturnType<typeof client.notes.get>>["preview"]>;
export function BookmarkLibrary() {
  const [view, setView] = useState("saved"),
    [query, setQuery] = useState(""),
    [draft, setDraft] = useState(""),
    [topic, setTopic] = useState("all"),
    [kind, setKind] = useState("all"),
    [savedOnly, setSavedOnly] = useState(false),
    [page, setPage] = useState(0),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(
    async () => ({
      topics: await client.topics.list(),
      saved: view === "saved" ? await client.bookmarks.list({ page }) : null,
      notes: view === "notes" ? await client.notes.list({ page, query }) : null,
      search:
        view === "search"
          ? await client.search.query({
              query,
              topicId: topic === "all" ? undefined : topic,
              kind: kind as "all" | "lesson" | "question",
              savedOnly,
              page,
            })
          : null,
    }),
    [view, page, query, topic, kind, savedOnly],
  );
  const state = useData(load);
  const d = state.data;
  function changeView(value: string) {
    setView(value);
    setPage(0);
    setQuery("");
    setDraft("");
    setMessage("");
  }
  async function bookmark(target: Target, saved: boolean) {
    setPending(true);
    state.setError("");
    try {
      await client.bookmarks.set({ target, saved });
      setMessage(saved ? "Bookmarked." : "Bookmark removed.");
      await state.reload();
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  function preview(item: Preview) {
    return (
      <Card key={`${item.kind}-${item.id}`}>
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            {item.topic} · {item.kind === "lesson" ? "Lesson" : "Original question review"}
          </p>
          <h3>{item.title}</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap">{item.snippet}</p>
          {item.erratum && <p role="note">Correction notice: {item.erratum}</p>}
          <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants({ variant: "outline" })} href={item.href as Route}>
              {item.kind === "lesson" ? "Read lesson" : "Open original review"}
            </Link>
            <Button
              variant="outline"
              disabled={pending}
              aria-pressed={item.saved}
              onClick={() => bookmark({ kind: item.kind, id: item.id }, !item.saved)}
            >
              {item.saved ? "Remove bookmark" : "Bookmark"}
            </Button>
            <NoteEditor
              target={{ kind: item.kind, id: item.id }}
              onSaved={() => void state.reload()}
            />
          </div>
        </CardContent>
      </Card>
    );
  }
  const hasMore = !!(
    d?.saved?.hasMore ||
    d?.notes?.hasMore ||
    d?.search?.hasMoreLessons ||
    d?.search?.hasMoreQuestions
  );
  return (
    <>
      <div className="mb-6 flex flex-wrap gap-3">
        {[
          ["saved", "Bookmarked items"],
          ["notes", "Private notes"],
          ["search", "Search reviewed material"],
        ].map(([value, label]) => (
          <Button
            key={value}
            variant={view === value ? "default" : "outline"}
            aria-pressed={view === value}
            onClick={() => changeView(value ?? "saved")}
          >
            {label}
          </Button>
        ))}
      </div>
      {view !== "saved" && (
        <form
          className="mb-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(draft.trim());
            setPage(0);
          }}
        >
          <div className="field">
            <Label htmlFor="library-query">
              {view === "notes" ? "Search your note text" : "Keyword"}
            </Label>
            <Input
              id="library-query"
              maxLength={120}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          {view === "search" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="search-topic"
                  label="Topic filter"
                  value={topic}
                  options={[
                    { value: "all", label: "All enabled topics" },
                    ...(d?.topics
                      .filter((t) => t.enabled)
                      .map((t) => ({ value: t.id, label: t.title })) ?? []),
                  ]}
                  onChange={(v) => {
                    setTopic(v);
                    setPage(0);
                  }}
                />
                <SelectField
                  id="search-kind"
                  label="Material type"
                  value={kind}
                  options={[
                    { value: "all", label: "Lessons and permitted question reviews" },
                    { value: "lesson", label: "Published lessons" },
                    { value: "question", label: "Permitted question reviews" },
                  ]}
                  onChange={(v) => {
                    setKind(v);
                    setPage(0);
                  }}
                />
              </div>
              <Label htmlFor="search-saved" className="flex min-h-11 items-center gap-3">
                <Checkbox
                  id="search-saved"
                  checked={savedOnly}
                  onCheckedChange={(v) => {
                    setSavedOnly(!!v);
                    setPage(0);
                  }}
                />
                Only bookmarked material
              </Label>
            </>
          )}
          <Button type="submit">Search</Button>
        </form>
      )}
      <LoadState {...state} />
      <p role="status" className="my-4 text-success">
        {message}
      </p>
      {d?.saved && (
        <>
          <h2 className="mb-4">Saved for another day</h2>
          {!d.saved.items.length && (
            <p>No bookmarks yet. Save a lesson or a question while studying to find it here.</p>
          )}
          <div className="space-y-5">
            {d.saved.items.map((item) =>
              item.preview ? (
                preview(item.preview)
              ) : (
                <Card key={item.bookmarkId}>
                  <CardContent className="space-y-4">
                    <h3>Saved item currently unavailable</h3>
                    <p>
                      It may belong to another selected level, be unpublished, or need a permitted
                      completed review. Your bookmark and private note remain yours.
                    </p>
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => bookmark(item.target, false)}
                    >
                      Remove bookmark
                    </Button>
                    <NoteEditor target={item.target} />
                  </CardContent>
                </Card>
              ),
            )}
          </div>
        </>
      )}
      {d?.notes && (
        <>
          <h2 className="mb-4">Your private notebook</h2>
          {!d.notes.items.length && (
            <p>
              No private notes match. Write a thought on a lesson or practice question to keep it
              here.
            </p>
          )}
          <div className="space-y-5">
            {d.notes.items.map((note) => (
              <Card key={note.id}>
                <CardHeader>
                  <h3>{note.preview?.title ?? "Private note · source unavailable"}</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="whitespace-pre-wrap">{note.body}</p>
                  <NoteEditor target={note.target} onSaved={() => void state.reload()} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      {d?.search && (
        <>
          {!d.search.lessons.length && !d.search.questions.length && (
            <p>
              No permitted results match. Try a different keyword or topic. Drafts and unreleased
              solutions never appear here.
            </p>
          )}
          <h2 className="mb-4">Published lessons</h2>
          <div className="space-y-5">{d.search.lessons.map(preview)}</div>
          <h2 className="mb-4 mt-8">Permitted question reviews</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Original versions you have committed or completed; historical correction notices
            preserve their scoring.
          </p>
          <div className="space-y-5">{d.search.questions.map(preview)}</div>
        </>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={page === 0 || state.loading}
          onClick={() => setPage(page - 1)}
        >
          Previous page
        </Button>
        <Button
          variant="outline"
          disabled={!hasMore || state.loading}
          onClick={() => setPage(page + 1)}
        >
          Next page
        </Button>
        <span className="self-center text-sm text-muted-foreground">
          Page {page + 1} · up to 20 items per section
        </span>
      </div>
    </>
  );
}
export function LibraryQuestion({ versionId }: { versionId: string }) {
  const load = useCallback(() => client.search.question({ versionId }), [versionId]),
    state = useData(load),
    d = state.data;
  return (
    <>
      <LoadState {...state} />
      {d && (
        <>
          <div className="page-heading">
            <p className="eyebrow">Original question review · Version {d.version}</p>
            <h1>Revisit the reasoning</h1>
            <p>
              Reviewed content from your permitted history. Corrections keep the original key
              unchanged.
            </p>
          </div>
          <Card>
            <CardContent className="space-y-5">
              {d.passage && (
                <blockquote className="reading whitespace-pre-wrap border-l-2 pl-5">
                  {d.passage}
                </blockquote>
              )}
              <p
                className="reading whitespace-pre-wrap"
                lang={d.language === "filipino" ? "fil" : "en"}
              >
                {d.prompt}
              </p>
              <ul className="space-y-3">
                {d.choices.map((c) => (
                  <li key={c.id} className="rounded-lg border p-4">
                    {c.text}
                    {d.answerChoiceId === c.id && (
                      <span className="ml-3 font-medium">Original answer</span>
                    )}
                  </li>
                ))}
              </ul>
              <h2>Reviewed explanation</h2>
              <p className="reading whitespace-pre-wrap">{d.explanation}</p>
              {d.erratum && <p role="note">Correction notice: {d.erratum}</p>}
              {d.status !== "published" && (
                <p>
                  This is a historical version. New sessions use currently published, eligible
                  material.
                </p>
              )}
            </CardContent>
          </Card>
          <SavedTools target={{ kind: "question", id: d.id }} />
        </>
      )}
    </>
  );
}
