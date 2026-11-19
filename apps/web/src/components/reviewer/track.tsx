"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Label } from "@sibol-cse/ui/components/label";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { Profile } from "@/lib/server-api";
import { client } from "@/utils/orpc";
import { errorMessage } from "../learning-ui";
export function ReviewerTrack({ profile }: { profile: Profile }) {
  const [level, setLevel] = useState(profile.preferences?.level ?? ""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await client.onboarding.complete({
        level: level as "professional" | "subprofessional",
        days: profile.preferences?.days ?? [1, 3, 5],
        dailyMinutes: profile.preferences?.dailyMinutes ?? 25,
        targetDate: profile.preferences?.targetDate ?? null,
        language: profile.language,
        revision: profile.preferences?.revision ?? 0,
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <Label htmlFor="onboarding-track">Exam track</Label>
      <select
        className="min-h-11 rounded-md border p-3"
        id="onboarding-track"
        value={level}
        required
        onChange={(e) => setLevel(e.target.value)}
      >
        <option value="" disabled>
          Choose your CSE track
        </option>
        <option value="professional">Professional — analytical ability</option>
        <option value="subprofessional">Subprofessional — clerical ability</option>
      </select>
      <p>Both tracks include verbal, numerical and general information questions.</p>
      <Button className="auth-submit" disabled={pending || !level} type="submit">
        {pending ? "Opening reviewer…" : "Start reviewing"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
