"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import { Checkbox } from "@sibol-cse/ui/components/checkbox";
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
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";
import { useAppearance } from "./appearance-provider";
import { FormError } from "./feedback";
import { errorMessage, SelectField } from "./learning-ui";
export function AccountControls() {
  const appearance = useAppearance();
  const [theme, setTheme] = useState("light"),
    [motion, setMotion] = useState("system"),
    [inApp, setInApp] = useState(true),
    [futureEmail, setFutureEmail] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [exportError, setExportError] = useState(""),
    [exportMessage, setExportMessage] = useState(""),
    [pending, setPending] = useState(false),
    [open, setOpen] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [deleteError, setDeleteError] = useState("");
  useEffect(() => {
    const row = appearance?.settings;
    if (row) {
      setTheme(row.theme);
      setMotion(row.motion);
      setInApp(row.inAppReminders);
      setFutureEmail(row.futureEmailOptIn);
    }
  }, [appearance?.settings]);
  async function save() {
    setMessage("");
    setError("");
    try {
      await appearance?.update({
        theme: theme as "light" | "dark",
        motion: motion as "system" | "reduce",
        inAppReminders: inApp,
        futureEmailOptIn: futureEmail,
      });
      setMessage("Appearance and reminder preferences saved.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function download() {
    setPending(true);
    setExportError("");
    setExportMessage("");
    try {
      await client.account.export();
      const response = await fetch("/api/account/export", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const failure = await response.json();
        throw new Error(
          typeof failure.error === "string" ? failure.error : "Export could not be completed.",
        );
      }
      const text = await response.text();
      JSON.parse(text);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "sibol-account.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage("Your account export is ready. Store it somewhere private.");
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    setPending(true);
    setDeleteError("");
    try {
      const receipt = await client.account.requestDeletion({
        password,
        confirmation: confirmation as "DELETE",
      });
      setPassword("");
      await authClient.signOut().catch(() => {});
      localStorage.removeItem("theme");
      localStorage.removeItem("sibol-motion");
      window.location.replace(`/account-deleted?receipt=${encodeURIComponent(receipt.receiptId)}`);
    } catch (e) {
      setDeleteError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-8 max-w-3xl space-y-8">
      <Card>
        <CardHeader>
          <h2>Appearance & reminders</h2>
        </CardHeader>
        <CardContent className="space-y-5">
          <SelectField
            id="account-theme"
            label="Theme"
            value={theme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={setTheme}
          />
          <SelectField
            id="account-motion"
            label="Motion preference"
            value={motion}
            options={[
              { value: "system", label: "Follow device accessibility preference" },
              { value: "reduce", label: "Reduce motion" },
            ]}
            onChange={setMotion}
          />
          <p className="text-sm text-muted-foreground">
            Sibol starts light. Your explicit account choice persists. A device request for reduced
            motion is always respected.
          </p>
          <Label className="flex min-h-11 items-center gap-3" htmlFor="in-app-reminders">
            <Checkbox
              id="in-app-reminders"
              checked={inApp}
              onCheckedChange={(v) => setInApp(!!v)}
            />
            Show in-app due-review reminders
          </Label>
          <Label className="flex min-h-11 items-center gap-3" htmlFor="future-email">
            <Checkbox
              id="future-email"
              checked={futureEmail}
              onCheckedChange={(v) => setFutureEmail(!!v)}
            />
            Save my interest in future email reminders
          </Label>
          <p className="text-sm text-muted-foreground">
            Scheduled email and push reminders are not available. This records a preference only; no
            reminder messages are sent. Your study tasks and review notebook remain available.
          </p>
          <FormError message={error || appearance?.error || ""} />
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!appearance?.settings || appearance.pending || pending}
              onClick={save}
            >
              Save appearance & reminders
            </Button>
            <Button
              variant="outline"
              disabled={appearance?.pending}
              onClick={() => void appearance?.reload()}
            >
              Reload saved settings
            </Button>
          </div>
          <p role="status" className="text-success">
            {message}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2>Your account data</h2>
        </CardHeader>
        <CardContent className="space-y-5">
          <p>
            Download your preferences, notes and learning records as JSON. Course prompts, choices,
            explanations, answer keys, passwords and tokens are excluded. Finish an active strict
            mock or diagnostic before exporting.
          </p>
          <Button variant="outline" disabled={pending} onClick={download}>
            {pending ? "Working…" : "Download my data"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Account deletion removes live answers, notes, bookmarks, progress, plans, sessions and
            credentials, including unfinished attempts. Published material and source/rights
            attribution remain. Publication references use “Deleted account.” Backups expire after
            30 days; deletion receipts are reapplied before a restored database goes online.
          </p>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              setPassword("");
              setConfirmation("");
              setDeleteError("");
            }}
          >
            <DialogTrigger render={<Button variant="outline" disabled={pending} />}>
              Delete my account
            </DialogTrigger>
            <DialogContent className="max-h-[90svh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Delete your account?</DialogTitle>
                <DialogDescription>
                  This permanently removes live personal learning data and signs you out. Backups
                  may retain it for up to 30 days. Published content and pseudonymized
                  publication/deletion references remain.
                </DialogDescription>
              </DialogHeader>
              <div className="field">
                <Label htmlFor="delete-password">Current password</Label>
                <Input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <Label htmlFor="delete-confirmation">Type DELETE to confirm</Label>
                <Input
                  id="delete-confirmation"
                  autoComplete="off"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>
              <FormError message={deleteError} />
              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={pending} />}>
                  Keep my account
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={pending || !password || confirmation !== "DELETE"}
                  onClick={remove}
                >
                  {pending ? "Deleting…" : "Permanently delete my account"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <FormError message={exportError} />
          <p role="status" className="text-success">
            {exportMessage}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
