"use client";
import { type QuestionInput, questionInput, sourceInput } from "@sibol-cse/api/learning-contracts";
import { Badge } from "@sibol-cse/ui/components/badge";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@sibol-cse/ui/components/card";
import { Checkbox } from "@sibol-cse/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sibol-cse/ui/components/dialog";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import { Textarea } from "@sibol-cse/ui/components/textarea";
import { type FormEvent, useCallback, useState } from "react";
import { client } from "@/utils/orpc";
import {
  blankStructure,
  emptySource,
  SourceEditor,
  StructureEditor,
} from "./content-editor-fields";
import { FormError } from "./feedback";
import { errorMessage, LoadState, SelectField, useData } from "./learning-ui";

const newQuestion = (): QuestionInput => ({
  externalId: "",
  level: "professional",
  topicId: "",
  language: "english",
  difficulty: "easy",
  prompt: "",
  choices: [
    { id: "a", text: "" },
    { id: "b", text: "" },
  ],
  answerChoiceId: "",
  explanation: "",
  passage: null,
  media: null,
  distractorExplanations: {},
  source: { ...emptySource },
});
const checks = [
  { id: "accurate", label: "The answer or worked steps are accurate." },
  {
    id: "explanation",
    label: "The explanation teaches the reasoning and useful distractor distinctions.",
  },
  {
    id: "rights",
    label: "Authorship and usage rights are documented; this is not confidential exam content.",
  },
  { id: "alignment", label: "The topic and selected exam level are appropriate." },
  {
    id: "accessible",
    label: "Language, tables, diagrams and image descriptions are readable and accessible.",
  },
] as const;
type RecordRow = { id: string; version: number; status: string };
export function AdminContent() {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const load = useCallback(() => client.content.list({ query, page }), [query, page]);
  const state = useData(load);
  const [kind, setKind] = useState("question"),
    [q, setQ] = useState(newQuestion),
    [correctionId, setCorrectionId] = useState<string | undefined>();
  const [lesson, setLesson] = useState({
    slug: "",
    title: "",
    topicId: "",
    levels: ["professional" as const],
    structure: blankStructure(),
    source: { ...emptySource },
  });
  const [pending, setPending] = useState(false),
    [success, setSuccess] = useState("");
  const [action, setAction] = useState<{
    kind: "question" | "lesson";
    row: RecordRow;
    type: "review" | "publish" | "retire";
  } | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({}),
    [reason, setReason] = useState(""),
    [dialogError, setDialogError] = useState("");
  const topics = state.data?.topics.filter((t) => t.enabled) ?? [];
  async function create(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    state.setError("");
    setSuccess("");
    try {
      if (kind === "question") {
        questionInput.parse(q);
        await client.content.createQuestion({ question: q, correctionId });
        setQuery(q.externalId);
        setSearch(q.externalId);
        setPage(0);
        setQ(newQuestion());
        setCorrectionId(undefined);
      } else {
        await client.content.createLesson(lesson);
        setQuery(lesson.slug);
        setSearch(lesson.slug);
        setPage(0);
      }
      setSuccess("Draft saved. Review the checklist, then publish explicitly.");
      await state.reload();
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function correct(id: string) {
    setPending(true);
    state.setError("");
    try {
      const row = await client.content.question({ id });
      let source = { ...emptySource };
      try {
        const parsed = sourceInput.safeParse(JSON.parse(row.source?.rights ?? "{}"));
        if (parsed.success) source = parsed.data;
      } catch {}
      setQ({
        externalId: row.externalId ?? "",
        level: row.level,
        topicId: row.primaryTopicId,
        language: row.language,
        difficulty: row.difficulty as QuestionInput["difficulty"],
        prompt: row.prompt,
        choices: row.choices,
        answerChoiceId: row.answerChoiceId,
        explanation: row.explanation,
        passage: row.passage,
        media: row.media as QuestionInput["media"],
        distractorExplanations: row.distractorExplanations ?? {},
        source,
      });
      setKind("question");
      setCorrectionId(row.questionId);
      document.getElementById("editor-heading")?.scrollIntoView();
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function perform() {
    if (!action) return;
    setPending(true);
    setDialogError("");
    try {
      if (action.type === "review")
        await client.content.review({
          kind: action.kind,
          versionId: action.row.id,
          checklist: checklist as {
            accurate: true;
            explanation: true;
            rights: true;
            alignment: true;
            accessible: true;
          },
        });
      else if (action.type === "publish")
        await client.content.publish({
          kind: action.kind,
          versionId: action.row.id,
          erratum: reason || null,
        });
      else await client.content.retire({ kind: action.kind, versionId: action.row.id, reason });
      setAction(null);
      await state.reload();
    } catch (e) {
      setDialogError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  function actions(row: RecordRow, kind: "question" | "lesson") {
    return (
      <div className="flex flex-wrap gap-2">
        {row.status === "draft" && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setAction({ kind, row, type: "review" });
              setChecklist({});
              setDialogError("");
            }}
          >
            Review checklist
          </Button>
        )}
        {row.status === "reviewed" && (
          <Button
            disabled={pending}
            onClick={() => {
              setAction({ kind, row, type: "publish" });
              setReason("");
              setDialogError("");
            }}
          >
            Publish version
          </Button>
        )}
        {row.status === "published" && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setAction({ kind, row, type: "retire" });
              setReason("");
              setDialogError("");
            }}
          >
            Retire version
          </Button>
        )}
        {kind === "question" && (
          <Button variant="outline" disabled={pending} onClick={() => correct(row.id)}>
            Create correction
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <LoadState {...state} />
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
          setPage(0);
        }}
      >
        <div className="field min-w-0 flex-1">
          <Label htmlFor="content-search">Find content by ID, title or question text</Label>
          <Input
            id="content-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={120}
          />
        </div>
        <Button type="submit" variant="outline">
          Find content
        </Button>
      </form>
      <section>
        <h2 id="editor-heading" className="mb-5">
          {correctionId ? "Create a new correction version" : "Create reviewed learning material"}
        </h2>
        <SelectField
          id="editor-kind"
          label="Content type"
          value={kind}
          options={[
            { value: "question", label: "Question" },
            { value: "lesson", label: "Lesson" },
          ]}
          onChange={setKind}
        />
        <form onSubmit={create} className="form-stack mt-5">
          <fieldset disabled={pending} className="space-y-6">
            {kind === "question" ? (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="field">
                    <Label htmlFor="external-id">Stable external ID</Label>
                    <Input
                      id="external-id"
                      value={q.externalId}
                      onChange={(e) => setQ({ ...q, externalId: e.target.value })}
                      disabled={!!correctionId}
                      required
                      maxLength={100}
                    />
                  </div>
                  <SelectField
                    id="question-level"
                    label="Exam level"
                    value={q.level}
                    options={[
                      { value: "professional", label: "Professional" },
                      { value: "subprofessional", label: "Subprofessional" },
                    ]}
                    onChange={(v) =>
                      setQ({ ...q, level: v as QuestionInput["level"], topicId: "" })
                    }
                  />
                  <SelectField
                    id="question-topic"
                    label="Primary scoring topic"
                    value={q.topicId}
                    options={topics
                      .filter((t) => t.levels.includes(q.level))
                      .map((t) => ({ value: t.id, label: t.title }))}
                    onChange={(v) => setQ({ ...q, topicId: v })}
                  />
                  <SelectField
                    id="question-language"
                    label="Content language"
                    value={q.language}
                    options={[
                      { value: "english", label: "English" },
                      { value: "filipino", label: "Filipino" },
                    ]}
                    onChange={(v) => setQ({ ...q, language: v as QuestionInput["language"] })}
                  />
                  <SelectField
                    id="question-difficulty"
                    label="Question difficulty"
                    value={q.difficulty}
                    options={["easy", "medium", "hard"].map((v) => ({ value: v, label: v }))}
                    onChange={(v) => setQ({ ...q, difficulty: v as QuestionInput["difficulty"] })}
                  />
                </div>
                <div className="field">
                  <Label htmlFor="question-passage">Passage (optional)</Label>
                  <Textarea
                    id="question-passage"
                    value={q.passage ?? ""}
                    onChange={(e) => setQ({ ...q, passage: e.target.value || null })}
                    maxLength={20000}
                  />
                </div>
                <div className="field">
                  <Label htmlFor="question-prompt-editor">Question prompt</Label>
                  <Textarea
                    id="question-prompt-editor"
                    value={q.prompt}
                    onChange={(e) => setQ({ ...q, prompt: e.target.value })}
                    required
                    rows={4}
                    maxLength={12000}
                  />
                </div>
                <fieldset className="space-y-5">
                  <legend className="mb-3 font-medium">Choices and stable identifiers</legend>
                  {q.choices.map((c, index) => (
                    <div key={c.id} className="rounded-xl border p-5">
                      <div className="field">
                        <Label htmlFor={`choice-text-${c.id}`}>Choice {c.id}</Label>
                        <Textarea
                          id={`choice-text-${c.id}`}
                          value={c.text}
                          required
                          onChange={(e) =>
                            setQ({
                              ...q,
                              choices: q.choices.map((old, i) =>
                                i === index ? { ...old, text: e.target.value } : old,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="field mt-4">
                        <Label htmlFor={`distractor-${c.id}`}>
                          Reasoning for choice {c.id} (optional)
                        </Label>
                        <Textarea
                          id={`distractor-${c.id}`}
                          value={q.distractorExplanations[c.id] ?? ""}
                          onChange={(e) => {
                            const explanations = { ...q.distractorExplanations };
                            if (e.target.value) explanations[c.id] = e.target.value;
                            else delete explanations[c.id];
                            setQ({ ...q, distractorExplanations: explanations });
                          }}
                        />
                      </div>
                      {q.choices.length > 2 && (
                        <Button
                          type="button"
                          className="mt-3"
                          variant="outline"
                          onClick={() =>
                            setQ({
                              ...q,
                              choices: q.choices.filter((x) => x.id !== c.id),
                              answerChoiceId: q.answerChoiceId === c.id ? "" : q.answerChoiceId,
                            })
                          }
                        >
                          Remove choice {c.id}
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={q.choices.length >= 6}
                    onClick={() => {
                      const id = [..."abcdef"].find((id) => !q.choices.some((c) => c.id === id));
                      if (id) setQ({ ...q, choices: [...q.choices, { id, text: "" }] });
                    }}
                  >
                    Add choice
                  </Button>
                </fieldset>
                <SelectField
                  id="correct-choice"
                  label="Correct answer"
                  value={q.answerChoiceId}
                  options={q.choices.map((c) => ({
                    value: c.id,
                    label: `Choice ${c.id}: ${c.text.slice(0, 70) || "Not written yet"}`,
                  }))}
                  onChange={(v) => setQ({ ...q, answerChoiceId: v })}
                />
                <div className="field">
                  <Label htmlFor="question-explanation">Reviewed answer explanation</Label>
                  <Textarea
                    id="question-explanation"
                    value={q.explanation}
                    onChange={(e) => setQ({ ...q, explanation: e.target.value })}
                    required
                    rows={5}
                  />
                </div>
                <SourceEditor
                  prefix="question"
                  value={q.source}
                  onChange={(source) => setQ({ ...q, source })}
                />
              </>
            ) : (
              <>
                <div className="field">
                  <Label htmlFor="lesson-slug">Lesson address slug</Label>
                  <Input
                    id="lesson-slug"
                    value={lesson.slug}
                    onChange={(e) => setLesson({ ...lesson, slug: e.target.value })}
                    placeholder="fractions-made-clear"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  />
                  <p className="field-hint">
                    Use the same slug to create a new version of an existing lesson.
                  </p>
                </div>
                <div className="field">
                  <Label htmlFor="lesson-title">Lesson title</Label>
                  <Input
                    id="lesson-title"
                    value={lesson.title}
                    onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
                    required
                  />
                </div>
                <SelectField
                  id="lesson-level"
                  label="Lesson exam level"
                  value={lesson.levels[0] ?? "professional"}
                  options={[
                    { value: "professional", label: "Professional" },
                    { value: "subprofessional", label: "Subprofessional" },
                  ]}
                  onChange={(v) =>
                    setLesson({ ...lesson, levels: [v as "professional"], topicId: "" })
                  }
                />
                <SelectField
                  id="lesson-topic"
                  label="Lesson topic"
                  value={lesson.topicId}
                  options={topics
                    .filter((t) => t.levels.includes(lesson.levels[0] ?? "professional"))
                    .map((t) => ({ value: t.id, label: t.title }))}
                  onChange={(v) => setLesson({ ...lesson, topicId: v })}
                />
                <StructureEditor
                  value={lesson.structure}
                  onChange={(structure) => setLesson({ ...lesson, structure })}
                />
                <SourceEditor
                  prefix="lesson"
                  value={lesson.source}
                  onChange={(source) => setLesson({ ...lesson, source })}
                />
              </>
            )}
          </fieldset>
          <FormError message={state.error} />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving draft…" : "Save draft"}
            </Button>
            {correctionId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCorrectionId(undefined);
                  setQ(newQuestion());
                }}
              >
                Cancel correction
              </Button>
            )}
          </div>
          <p role="status" className="text-sm text-success">
            {success}
          </p>
        </form>
      </section>
      <section>
        <h2 className="mb-4">Question versions</h2>
        <div className="space-y-4">
          {state.data?.questions.length === 0 && (
            <p>No questions yet. Create a draft or validate an import.</p>
          )}
          {state.data?.questions.map((row) => (
            <Card key={row.id}>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{row.status}</Badge>
                  <Badge variant="outline">
                    v{row.version} · {row.level}
                  </Badge>
                  <span className="text-sm">{row.externalId}</span>
                </div>
                <p className="whitespace-pre-wrap">{row.prompt}</p>
                {actions(row, "question")}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-4">Lesson versions</h2>
        <div className="space-y-4">
          {state.data?.lessons.map((row) => (
            <Card key={row.id}>
              <CardHeader>
                <CardTitle>{row.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  {row.slug} · v{row.version} · {row.status}
                </p>
                {actions(row, "lesson")}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {action?.type === "review"
                ? "Review this draft"
                : action?.type === "publish"
                  ? "Publish this version?"
                  : "Retire this version?"}
            </DialogTitle>
            <DialogDescription>
              {action?.type === "review"
                ? "Self-review is permitted only with an explicit checklist. This decision is audited."
                : "Published history and original scoring are preserved. Learners see only published material."}
            </DialogDescription>
          </DialogHeader>
          {action?.type === "review" ? (
            checks.map((check) => (
              <Label
                key={check.id}
                htmlFor={`review-${check.id}`}
                className="flex min-h-11 items-start gap-3 leading-relaxed"
              >
                <Checkbox
                  id={`review-${check.id}`}
                  checked={!!checklist[check.id]}
                  onCheckedChange={(v) => setChecklist({ ...checklist, [check.id]: !!v })}
                />
                {check.label}
              </Label>
            ))
          ) : (
            <div className="field">
              <Label htmlFor="publication-reason">
                {action?.type === "publish"
                  ? "Correction notice (required for a replacement version)"
                  : "Retirement reason"}
              </Label>
              <Textarea
                id="publication-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
              />
            </div>
          )}
          <FormError message={dialogError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={pending} />}>
              Cancel
            </DialogClose>
            <Button
              disabled={
                pending ||
                (action?.type === "review" && !checks.every((c) => checklist[c.id])) ||
                (action?.type === "retire" && !reason.trim())
              }
              onClick={perform}
            >
              {pending ? "Saving…" : "Confirm editorial decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
