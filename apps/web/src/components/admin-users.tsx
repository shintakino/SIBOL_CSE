"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@sibol-cse/ui/components/card";
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
import { MailPlus } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { client } from "@/utils/orpc";
import { FormError, Success } from "./feedback";

type Users = Awaited<ReturnType<typeof client.users.list>>;
export function AdminUsers() {
  const [users, setUsers] = useState<Users>([]);
  const [error, setError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUsers(await client.users.list());
    } catch {
      setError("The account list could not be loaded. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email")).trim().toLowerCase();
    setPending(true);
    setError("");
    setSent(false);
    try {
      await client.users.invite({ email });
      setSent(true);
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The invitation could not be sent.");
    } finally {
      setPending(false);
    }
  }
  async function changeRole(user: Users[number]) {
    setPending(true);
    setRoleError("");
    try {
      await client.users.setRole({
        userId: user.id,
        role: user.role === "admin" ? "learner" : "admin",
      });
      setOpenUser(null);
      await load();
    } catch (e) {
      setRoleError(e instanceof Error ? e.message : "The role could not be changed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-6">
      <FormError message={error} />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>
            <h2>Invite someone to grow</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="form-stack" onSubmit={invite}>
            <div className="field">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
              <p className="field-hint">
                Invitations expire in 48 hours and create learner accounts.
              </p>
            </div>
            <Button className="self-start" type="submit" disabled={pending}>
              <MailPlus aria-hidden="true" />
              {pending ? "Sending…" : "Send invitation"}
            </Button>
            {sent && (
              <Success>
                Invitation sent. The recipient can create their private account from the email.
              </Success>
            )}
          </form>
        </CardContent>
      </Card>
      <section>
        <h2 className="mb-4">Accounts</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Manage access only. Learning answers, results and private notes are not available here.
          Role changes are audited and end that account’s sessions.
        </p>
        {loading ? (
          <p role="status">Loading accounts…</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card px-5">
            {users.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="min-w-0">
                  <p className="font-medium">{user.name}</p>
                  <p className="break-all text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-sm capitalize">{user.role}</p>
                </div>
                <Dialog
                  open={openUser === user.id}
                  onOpenChange={(open) => {
                    setOpenUser(open ? user.id : null);
                    setRoleError("");
                  }}
                >
                  <DialogTrigger render={<Button variant="outline" />}>Change role</DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Change account role?</DialogTitle>
                      <DialogDescription>
                        {user.name} will become{" "}
                        {user.role === "admin" ? "a learner" : "an administrator"}. Administrators
                        can manage invitations and content, but cannot access another learner’s
                        private learning records.
                      </DialogDescription>
                    </DialogHeader>
                    <FormError message={roleError} />
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" disabled={pending} />}>
                        Cancel
                      </DialogClose>
                      <Button disabled={pending} onClick={() => changeRole(user)}>
                        Confirm role change
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </li>
            ))}
          </ul>
        )}
        <Button variant="ghost" className="mt-3" onClick={load} disabled={loading}>
          Reload accounts
        </Button>
      </section>
    </div>
  );
}
