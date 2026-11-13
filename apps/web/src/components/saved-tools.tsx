"use client";
import type { Target } from "@sibol-cse/api/library-contracts";
import { Button } from "@sibol-cse/ui/components/button";
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
import { Textarea } from "@sibol-cse/ui/components/textarea";
import { Bookmark, NotebookPen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "@/utils/orpc";
import { FormError } from "./feedback";
import { errorMessage, LoadState, useData } from "./learning-ui";
export function NoteEditor({ target, onSaved }: { target: Target; onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <NotebookPen aria-hidden="true" />
        Private note
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your private note</DialogTitle>
          <DialogDescription>
            Only you can read this note. Plain text, up to 10,000 characters.
          </DialogDescription>
        </DialogHeader>
        {open && <NoteForm target={target} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}
function NoteForm({ target, onSaved }: { target: Target; onSaved?: () => void }) {
  const { kind, id } = target;
  const load = useCallback(() => client.notes.get({ target: { kind, id } }), [kind, id]),
    state = useData(load);
  const [body, setBody] = useState(""),
    [pending, setPending] = useState(false),
    [saved, setSaved] = useState(""),
    [deleteOpen, setDeleteOpen] = useState(false);
  const mutation = useRef<string | null>(null);
  useEffect(() => {
    if (state.data) setBody(state.data.body);
  }, [state.data]);
  async function save(remove = false) {
    if (!state.data) return;
    setPending(true);
    state.setError("");
    setSaved("");
    try {
      mutation.current ??= crypto.randomUUID();
      if (remove)
        await client.notes.delete({
          target,
          revision: state.data.revision,
          mutationId: mutation.current,
        });
      else
        await client.notes.save({
          target,
          body,
          revision: state.data.revision,
          mutationId: mutation.current,
        });
      mutation.current = null;
      setSaved(remove ? "Note deleted." : "Private note saved.");
      setDeleteOpen(false);
      await state.reload();
      onSaved?.();
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
        <div className="space-y-4">
          <div className="field">
            <Label htmlFor="library-note">Note text</Label>
            <Textarea
              id="library-note"
              rows={7}
              maxLength={10000}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                mutation.current = null;
                setSaved("");
              }}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={pending || !body.trim()} onClick={() => save()}>
              Save private note
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                mutation.current = null;
                void state.reload();
              }}
            >
              Reload saved note
            </Button>
            <Dialog
              open={deleteOpen}
              onOpenChange={(v) => {
                setDeleteOpen(v);
                mutation.current = null;
              }}
            >
              <DialogTrigger
                render={<Button variant="outline" disabled={pending || !state.data.body} />}
              >
                Delete note
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this private note?</DialogTitle>
                  <DialogDescription>
                    The saved note text will be cleared. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <FormError message={state.error} />
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" disabled={pending} />}>
                    Keep note
                  </DialogClose>
                  <Button variant="destructive" disabled={pending} onClick={() => save(true)}>
                    Confirm note deletion
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <p role="status" className="text-success">
            {saved}
          </p>
        </div>
      )}
    </>
  );
}
export function SavedTools({ target }: { target: Target }) {
  const { kind, id } = target;
  const load = useCallback(() => client.notes.get({ target: { kind, id } }), [kind, id]),
    state = useData(load);
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function toggle() {
    setPending(true);
    state.setError("");
    try {
      const saved = !state.data?.preview?.saved;
      await client.bookmarks.set({ target, saved });
      setMessage(saved ? "Bookmarked." : "Bookmark removed.");
      await state.reload();
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="mt-8 space-y-4 border-t pt-6" aria-label="Saved study tools">
      <h2>Keep a thought for later</h2>
      <LoadState {...state} />
      {state.data && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            aria-pressed={state.data.preview?.saved ?? false}
            disabled={pending || !state.data.preview}
            onClick={toggle}
          >
            <Bookmark aria-hidden="true" />
            {state.data.preview?.saved ? "Bookmarked" : "Bookmark this item"}
          </Button>
          <NoteEditor target={target} onSaved={() => void state.reload()} />
        </div>
      )}
      <p role="status" className="text-success">
        {message}
      </p>
    </section>
  );
}
