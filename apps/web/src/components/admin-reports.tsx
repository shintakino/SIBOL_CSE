"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent } from "@sibol-cse/ui/components/card";
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
import { Label } from "@sibol-cse/ui/components/label";
import { Textarea } from "@sibol-cse/ui/components/textarea";
import { useCallback, useState } from "react";
import { client } from "@/utils/orpc";
import { FormError } from "./feedback";
import { errorMessage, LoadState, useData } from "./learning-ui";
export function AdminReports() {
  const load = useCallback(() => client.issues.list(), []);
  const state = useData(load);
  const [id, setId] = useState<string | null>(null),
    [resolution, setResolution] = useState(""),
    [quarantine, setQuarantine] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  async function resolve() {
    if (!id) return;
    setPending(true);
    setError("");
    try {
      await client.issues.resolve({ id, resolution, quarantine });
      setId(null);
      await state.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <LoadState {...state} />
      {state.data?.length === 0 && (
        <p className="rounded-xl border bg-card p-6">No reported issues yet.</p>
      )}
      <div className="space-y-5">
        {state.data?.map((issue) => (
          <Card key={issue.id}>
            <CardContent className="space-y-4">
              <h2>{issue.category.replaceAll("_", " ")}</h2>
              <p className="whitespace-pre-wrap">{issue.description}</p>
              <p className="text-sm text-muted-foreground">
                {issue.status} · Question version {issue.versionId}
              </p>
              {issue.resolution && <p>Resolution: {issue.resolution}</p>}
              <Button
                variant="outline"
                onClick={() => {
                  setId(issue.id);
                  setResolution("");
                  setQuarantine(false);
                  setError("");
                }}
              >
                Review issue
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog
        open={!!id}
        onOpenChange={(open) => {
          if (!open) setId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve this content issue</DialogTitle>
            <DialogDescription>
              Quarantine excludes this question from new sets. Existing attempts retain their
              original version, scoring and a visible warning.
            </DialogDescription>
          </DialogHeader>
          <div className="field">
            <Label htmlFor="issue-resolution">Resolution or quarantine reason</Label>
            <Textarea
              id="issue-resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              maxLength={2000}
            />
          </div>
          <Label htmlFor="quarantine-question" className="flex min-h-11 items-center gap-3">
            <Checkbox
              id="quarantine-question"
              checked={quarantine}
              onCheckedChange={(v) => setQuarantine(!!v)}
            />
            Quarantine the question
          </Label>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button disabled={pending || !resolution.trim()} onClick={resolve}>
              Save issue decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
