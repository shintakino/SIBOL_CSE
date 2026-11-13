"use client";
import { type PreferencesInput, preferencesInput } from "@sibol-cse/api/contracts";
import { Button } from "@sibol-cse/ui/components/button";
import { Checkbox } from "@sibol-cse/ui/components/checkbox";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@sibol-cse/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sibol-cse/ui/components/select";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { Profile } from "@/lib/server-api";
import { client } from "@/utils/orpc";
import { FormError } from "./feedback";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function PreferencesForm({
  profile,
  onboarding = false,
}: {
  profile: Profile;
  onboarding?: boolean;
}) {
  const old = profile.preferences;
  const router = useRouter();
  const [level, setLevel] = useState<PreferencesInput["level"] | undefined>(old?.level);
  const [days, setDays] = useState<number[]>(old?.days ?? []);
  const [language, setLanguage] = useState<PreferencesInput["language"]>(profile.language);
  const [revision, setRevision] = useState(old?.revision ?? 0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = () => setSaved(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = preferencesInput.safeParse({
      level,
      days,
      dailyMinutes: Number(form.get("minutes")),
      targetDate: form.get("target-date") || null,
      language,
      revision,
    });
    if (!result.success) {
      setError(result.error.issues.map((i) => i.message).join(" "));
      return;
    }
    setPending(true);
    setError("");
    setSaved(false);
    try {
      const response = await (onboarding
        ? client.onboarding.complete(result.data)
        : client.profile.update(result.data));
      setRevision(response.revision);
      setSaved(true);
      if (onboarding) router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your changes could not be saved. Please retry.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit} onChange={changed} aria-busy={pending}>
      <FormError message={error} />
      <fieldset>
        <legend className="mb-3 font-medium">Which exam are you preparing for?</legend>
        <RadioGroup
          aria-label="Exam level"
          value={level ?? ""}
          onValueChange={(value) => {
            if (value === "professional" || value === "subprofessional") setLevel(value);
            changed();
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Label className="answer-option items-start" htmlFor="professional">
            <RadioGroupItem id="professional" value="professional" className="mt-1" />
            <span>
              <span className="block text-base font-medium">Professional</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                Includes analytical ability
              </span>
            </span>
          </Label>
          <Label className="answer-option items-start" htmlFor="subprofessional">
            <RadioGroupItem id="subprofessional" value="subprofessional" className="mt-1" />
            <span>
              <span className="block text-base font-medium">Subprofessional</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                Includes clerical ability
              </span>
            </span>
          </Label>
        </RadioGroup>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-medium">Your preferred study days</legend>
        <p id="days-hint" className="field-hint mb-3">
          Choose at least one day. Leave room for the rest of your life.
        </p>
        <div className="flex flex-wrap gap-2">
          {dayNames.map((name, day) => (
            <Label key={name} className="day-option" htmlFor={`day-${day}`}>
              <Checkbox
                id={`day-${day}`}
                aria-describedby="days-hint"
                checked={days.includes(day)}
                onCheckedChange={(checked) => {
                  setDays((current) =>
                    checked ? [...current, day].sort() : current.filter((d) => d !== day),
                  );
                  changed();
                }}
              />
              {name}
            </Label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="field">
          <Label htmlFor="minutes">Minutes per study day</Label>
          <Input
            id="minutes"
            name="minutes"
            type="number"
            min={5}
            max={240}
            step={1}
            defaultValue={old?.dailyMinutes ?? ""}
            placeholder="e.g. 25"
            required
            aria-describedby="minutes-hint"
          />
          <p id="minutes-hint" className="field-hint">
            Between 5 and 240 minutes. Start with what fits.
          </p>
        </div>
        <div className="field">
          <Label htmlFor="target-date">
            Personal target date <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="target-date"
            name="target-date"
            type="date"
            defaultValue={old?.targetDate ?? ""}
            aria-describedby="date-hint"
          />
          <p id="date-hint" className="field-hint">
            Your own goal, not a verified CSC exam announcement.
          </p>
        </div>
      </div>
      <div className="field">
        <Label htmlFor="language">Preferred explanation language</Label>
        <Select
          value={language}
          onValueChange={(value) => {
            if (value === "english" || value === "filipino") setLanguage(value);
            changed();
          }}
          items={[
            { label: "English", value: "english" },
            { label: "Filipino", value: "filipino" },
          ]}
        >
          <SelectTrigger id="language" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="english">English</SelectItem>
            <SelectItem value="filipino">Filipino</SelectItem>
          </SelectContent>
        </Select>
        <p className="field-hint">
          Study calendar: Asia/Manila. You can adjust these preferences later.
        </p>
      </div>
      {!onboarding && (
        <p className="field-hint">
          Saving starts a new plan revision. Completed work and earlier attempts remain in your
          history.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : onboarding ? "Create my study space" : "Save preferences"}
          <ArrowRight aria-hidden="true" />
        </Button>
        <span role="status" className="status-row text-success">
          {saved && (
            <>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Preferences saved
            </>
          )}
        </span>
      </div>
    </form>
  );
}
