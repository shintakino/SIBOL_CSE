"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import { ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";
import { FormError, Success } from "./feedback";

type Mode = "sign-in" | "forgot-password" | "reset-password" | "accept-invitation";
export function AuthForm({
  mode,
  token,
  invalidToken = false,
}: {
  mode: Mode;
  token?: string;
  invalidToken?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const passwordNeeded = mode !== "forgot-password";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const email = String(data.get("email") ?? "")
        .trim()
        .toLowerCase();
      const password = String(data.get("password") ?? "");
      if (mode === "accept-invitation") {
        await client.invitations.accept({
          token: token ?? "",
          name: String(data.get("name")),
          password,
        });
        setDone(true);
      } else if (mode === "sign-in") {
        const result = await authClient.signIn.email({ email, password });
        if (result.error)
          throw new Error(
            "We couldn’t sign you in. Check your email and password, then try again.",
          );
        router.replace("/dashboard");
        router.refresh();
      } else if (mode === "forgot-password") {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (result.error)
          throw new Error("We couldn’t send your request. Please try again shortly.");
        setDone(true);
      } else {
        const result = await authClient.resetPassword({
          newPassword: password,
          token: token ?? "",
        });
        if (result.error)
          throw new Error("This reset link is invalid or expired. Request a new password reset.");
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t connect. Please try again.");
    } finally {
      setPending(false);
    }
  }
  if (invalidToken || ((mode === "reset-password" || mode === "accept-invitation") && !token))
    return (
      <div className="form-stack">
        <FormError message="This link is invalid or expired. Please request a new one." />
        <Link
          className="inline-link"
          href={mode === "reset-password" ? "/forgot-password" : "/sign-in"}
        >
          {mode === "reset-password" ? "Request a reset link" : "Return to sign in"}
        </Link>
      </div>
    );
  if (done)
    return (
      <div className="form-stack">
        <Success>
          {mode === "forgot-password"
            ? "If this email has an account, a reset link will arrive shortly. Check your inbox and spam folder."
            : mode === "accept-invitation"
              ? "Your account is ready. Sign in to make this study space your own."
              : "Your password has been reset. Sign in with your new password."}
        </Success>
        <Link className="inline-link" href="/sign-in">
          Back to sign in
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="form-stack" aria-busy={pending}>
      <FormError message={error} />
      {mode === "accept-invitation" && (
        <div className="field">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" maxLength={100} required />
        </div>
      )}
      {(mode === "sign-in" || mode === "forgot-password") && (
        <div className="field">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            maxLength={254}
            required
          />
        </div>
      )}
      {passwordNeeded && (
        <div className="field">
          <Label htmlFor="password">{mode === "sign-in" ? "Password" : "Create a password"}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={mode === "sign-in" ? 1 : 12}
            maxLength={128}
            aria-describedby={mode === "sign-in" ? undefined : "password-hint"}
            required
          />
          {mode !== "sign-in" && (
            <p id="password-hint" className="field-hint">
              Use 12–128 characters. A memorable passphrase works well.
            </p>
          )}
        </div>
      )}
      {mode === "sign-in" && (
        <Link className="inline-link text-sm self-end" href="/forgot-password">
          Forgot password?
        </Link>
      )}
      <Button type="submit" disabled={pending}>
        {pending
          ? "Please wait…"
          : mode === "sign-in"
            ? "Sign in"
            : mode === "forgot-password"
              ? "Send reset link"
              : mode === "reset-password"
                ? "Reset password"
                : "Accept invitation"}
        <ArrowRight aria-hidden="true" />
      </Button>
      <p className="status-row text-muted-foreground">
        <LockKeyhole className="size-4 shrink-0" aria-hidden="true" />
        {mode === "sign-in"
          ? "Invitation-only. Your learning stays private."
          : "Your password and learning records are private."}
      </p>
    </form>
  );
}
