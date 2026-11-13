"use client";
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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { client } from "@/utils/orpc";
import { FormError } from "./feedback";
import { errorMessage } from "./learning-ui";
export function DeleteAttempt({ id }: { id: string }) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  async function remove() {
    setPending(true);
    setError("");
    try {
      await client.attempts.delete({ attemptId: id });
      router.replace("/progress");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Delete this attempt</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this attempt record?</DialogTitle>
          <DialogDescription>
            Your answers and result for this attempt will be removed and progress statistics
            recalculated. Historical mistake/review events remain in your notebook. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>
            Keep attempt
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={remove}>
            {pending ? "Deleting…" : "Confirm attempt deletion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
