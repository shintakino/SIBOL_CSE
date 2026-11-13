"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent } from "@sibol-cse/ui/components/card";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import { Textarea } from "@sibol-cse/ui/components/textarea";
import { useState } from "react";
import { client } from "@/utils/orpc";
import { FormError } from "./feedback";
import { errorMessage, SelectField } from "./learning-ui";
export function AdminImports() {
  const [format, setFormat] = useState("json"),
    [file, setFile] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [result, setResult] = useState<Awaited<ReturnType<typeof client.imports.validate>> | null>(
      null,
    ),
    [committed, setCommitted] = useState(false);
  async function validate() {
    setPending(true);
    setError("");
    setCommitted(false);
    try {
      setResult(await client.imports.validate({ format: format as "json" | "csv", file }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function commit() {
    if (!result?.batchId) return;
    setPending(true);
    setError("");
    try {
      await client.imports.commit({ id: result.batchId });
      setCommitted(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5">
          <p className="text-muted-foreground">
            Validate up to 100 questions / 512 KiB at a time. Committing creates drafts; each
            question still needs checklist review and explicit publication.
          </p>
          <SelectField
            id="import-format"
            label="Import format"
            value={format}
            options={[
              { value: "json", label: "JSON question array" },
              { value: "csv", label: "CSV with headers" },
            ]}
            onChange={(v) => {
              setFormat(v);
              setResult(null);
            }}
          />
          <div className="field">
            <Label htmlFor="import-upload">Choose a CSV or JSON file</Label>
            <Input
              id="import-upload"
              type="file"
              accept=".json,.csv,application/json,text/csv"
              onChange={async (e) => {
                const selected = e.target.files?.[0];
                if (!selected) return;
                if (selected.size > 524288) {
                  setError("The file exceeds 512 KiB.");
                  return;
                }
                setFile(await selected.text());
                setFormat(selected.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
                setResult(null);
                setCommitted(false);
              }}
            />
          </div>
          <div className="field">
            <Label htmlFor="import-source">Import contents</Label>
            <Textarea
              id="import-source"
              rows={12}
              value={file}
              onChange={(e) => {
                setFile(e.target.value);
                setResult(null);
                setCommitted(false);
              }}
            />
            <p className="field-hint">
              Question fields: externalId, level, topicId, language, difficulty, prompt, choices,
              answerChoiceId, explanation, source. Optional passage, media and
              distractorExplanations are supported. In CSV, choices and source contain quoted JSON
              objects/arrays.
            </p>
          </div>
          <Button disabled={pending || !file.trim()} onClick={validate}>
            {pending ? "Validating…" : "Validate and preview"}
          </Button>
          <FormError message={error} />
        </CardContent>
      </Card>
      {result && (
        <section aria-label="Import validation">
          <h2 className="mb-4">
            {result.valid ? "Ready to create drafts" : "Fix these rows before committing"}
          </h2>
          {result.errors.length > 0 && (
            <ul className="mb-5 list-inside list-disc space-y-3 text-destructive">
              {result.errors.map((error, i) => (
                <li key={`${error.row}-${i}`}>
                  Row {error.row}: {error.message}
                </li>
              ))}
            </ul>
          )}
          <ul className="mb-5 divide-y rounded-xl border bg-card p-5">
            {result.preview.map((row) => (
              <li key={row.externalId} className="py-4">
                <p className="font-medium">
                  {row.externalId} · {row.level}
                </p>
                <p>{row.prompt}</p>
                <p className="text-sm text-muted-foreground">Topic: {row.topicId}</p>
              </li>
            ))}
          </ul>
          <Button disabled={pending || !result.valid || committed} onClick={commit}>
            Commit validated drafts
          </Button>
          <p role="status" className="mt-4 text-success">
            {committed ? "Drafts created. Review and publish them in the content workspace." : ""}
          </p>
        </section>
      )}
    </div>
  );
}
