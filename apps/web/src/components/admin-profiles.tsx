"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@sibol-cse/ui/components/card";
import { Checkbox } from "@sibol-cse/ui/components/checkbox";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import { type FormEvent, useCallback, useState } from "react";
import { client } from "@/utils/orpc";
import { FormError } from "./feedback";
import { errorMessage, LoadState, SelectField, useData } from "./learning-ui";
export function AdminProfiles() {
  const load = useCallback(
    async () => ({ ...(await client.profiles.list()), topics: await client.topics.list() }),
    [],
  );
  const state = useData(load);
  const [level, setLevel] = useState("professional"),
    [checked, setChecked] = useState(false),
    [edq, setEdq] = useState(false),
    [pending, setPending] = useState(false),
    [notice, setNotice] = useState("");
  const [inventory, setInventory] = useState<Awaited<
    ReturnType<typeof client.profiles.inventory>
  > | null>(null);
  const [profileId, setProfileId] = useState(""),
    [quotas, setQuotas] = useState<Record<string, number>>({});
  async function run(task: () => Promise<unknown>, message: string) {
    setPending(true);
    state.setError("");
    setNotice("");
    try {
      await task();
      setNotice(message);
      await state.reload();
    } catch (e) {
      state.setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        client.profiles.create({
          level: level as "professional" | "subprofessional",
          itemCount: Number(form.get("items")),
          durationMinutes: Number(form.get("duration")),
          diagnosticCount: Number(form.get("diagnostic-count")),
          sourceUrl: String(form.get("url")),
          sourceTitle: String(form.get("title")),
          publishedOn: String(form.get("published")) || null,
          verifiedOn: String(form.get("verified")),
          announcementChecked: checked as true,
          edqExcluded: edq as true,
        }),
      "Verified profile saved. Activate it explicitly when appropriate.",
    );
  }
  const selected = state.data?.profiles.find((p) => p.id === profileId);
  const topics =
    state.data?.topics.filter((t) => t.enabled && selected && t.levels.includes(selected.level)) ??
    [];
  return (
    <div className="space-y-8">
      <LoadState {...state} />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Verify an exam-cycle profile</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="form-stack" onSubmit={create}>
            <SelectField
              id="profile-level"
              label="Profile level"
              value={level}
              options={[
                { value: "professional", label: "Professional" },
                { value: "subprofessional", label: "Subprofessional" },
              ]}
              onChange={setLevel}
            />
            <p className="text-sm text-muted-foreground">
              PRD reference only: Professional 150 scored items / 190 minutes; Subprofessional 145 /
              160. Recheck the applicable announcement before saving. EDQ items are excluded from
              scoring.
            </p>
            <div className="grid gap-5 sm:grid-cols-3">
              <div className="field">
                <Label htmlFor="profile-items">Scored item count</Label>
                <Input id="profile-items" name="items" type="number" min={1} max={500} required />
              </div>
              <div className="field">
                <Label htmlFor="profile-duration">Time limit (minutes)</Label>
                <Input
                  id="profile-duration"
                  name="duration"
                  type="number"
                  min={1}
                  max={600}
                  required
                />
              </div>
              <div className="field">
                <Label htmlFor="diagnostic-count">Diagnostic length</Label>
                <Input
                  id="diagnostic-count"
                  name="diagnostic-count"
                  type="number"
                  min={1}
                  max={120}
                  defaultValue={30}
                  required
                />
              </div>
            </div>
            <div className="field">
              <Label htmlFor="profile-url">Official CSC HTTPS source URL</Label>
              <Input id="profile-url" name="url" type="url" required />
            </div>
            <div className="field">
              <Label htmlFor="profile-title">Source title</Label>
              <Input id="profile-title" name="title" required maxLength={300} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="field">
                <Label htmlFor="profile-published">Publication date (if known)</Label>
                <Input id="profile-published" name="published" type="date" />
              </div>
              <div className="field">
                <Label htmlFor="profile-verified">Verification date</Label>
                <Input id="profile-verified" name="verified" type="date" required />
              </div>
            </div>
            <Label
              htmlFor="announcement-checked"
              className="flex min-h-11 items-start gap-3 leading-relaxed"
            >
              <Checkbox
                id="announcement-checked"
                checked={checked}
                onCheckedChange={(v) => setChecked(!!v)}
              />
              I checked the applicable announcement and its coverage, scored count and time limit.
            </Label>
            <Label
              htmlFor="edq-excluded"
              className="flex min-h-11 items-start gap-3 leading-relaxed"
            >
              <Checkbox id="edq-excluded" checked={edq} onCheckedChange={(v) => setEdq(!!v)} />
              The personal-data EDQ is excluded from scored practice items.
            </Label>
            <Button type="submit" disabled={pending || !checked || !edq}>
              Save verified profile version
            </Button>
            <FormError message={state.error} />
          </form>
        </CardContent>
      </Card>
      <section>
        <h2 className="mb-4">Profile versions</h2>
        <ul className="space-y-4">
          {state.data?.profiles.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5"
            >
              <div>
                <p className="font-medium capitalize">
                  {p.level} · v{p.version} {p.active ? "· Active" : ""}
                </p>
                <p>
                  {p.itemCount} scored items · {p.durationMinutes} minutes · Diagnostic{" "}
                  {p.diagnosticCount}
                </p>
                <p className="text-sm text-muted-foreground">
                  {p.sourceTitle ?? "Verification required"}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={pending || p.active}
                onClick={() =>
                  run(
                    () => client.profiles.activate({ id: p.id }),
                    "Profile activated. Content launch readiness is checked separately.",
                  )
                }
              >
                Activate profile
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Editorial mock blueprint</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SelectField
            id="blueprint-profile"
            label="Blueprint profile"
            value={profileId}
            options={
              state.data?.profiles.map((p) => ({
                value: p.id,
                label: `${p.level} v${p.version}`,
              })) ?? []
            }
            onChange={(v) => {
              setProfileId(v);
              setQuotas({});
            }}
          />
          <p className="text-sm text-muted-foreground">
            Topic quotas are editorial settings, not official CSC distributions. They must total the
            scored item count and cover every major area.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {topics.map((t) => (
              <div className="field" key={t.id}>
                <Label htmlFor={`quota-${t.id}`}>{t.title}</Label>
                <Input
                  id={`quota-${t.id}`}
                  type="number"
                  min={0}
                  max={500}
                  value={quotas[t.id] ?? 0}
                  onChange={(e) => setQuotas({ ...quotas, [t.id]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
          <p>
            Total: {Object.values(quotas).reduce((a, b) => a + b, 0)} / {selected?.itemCount ?? "—"}
          </p>
          <Button
            disabled={pending || !selected}
            onClick={() =>
              run(
                () => client.blueprints.create({ profileId, quotas }),
                "Blueprint version published.",
              )
            }
          >
            Publish blueprint version
          </Button>
          <ul className="space-y-3">
            {state.data?.blueprints.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
              >
                <span>
                  {state.data?.profiles.find((p) => p.id === b.profileVersionId)?.level} blueprint v
                  {b.version}
                </span>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => client.blueprints.buildForms({ id: b.id }),
                      "Two complete nonoverlapping forms created.",
                    )
                  }
                >
                  Build two mock forms
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <section className="space-y-5">
        <h2>Launch inventory gate</h2>
        <SelectField
          id="inventory-level"
          label="Inventory level"
          value={level}
          options={[
            { value: "professional", label: "Professional" },
            { value: "subprofessional", label: "Subprofessional" },
          ]}
          onChange={(v) => {
            setLevel(v);
            setInventory(null);
          }}
        />
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              async () =>
                setInventory(
                  await client.profiles.inventory({
                    level: level as "professional" | "subprofessional",
                  }),
                ),
              "Inventory checked.",
            )
          }
        >
          Check inventory
        </Button>
        {inventory && (
          <>
            <p className="font-medium">
              {inventory.ready ? "Inventory gates passed" : "Launch blocked by inventory"}
            </p>
            <p>
              {inventory.questionCount} reviewed unique questions. At least 300 are required, with
              30 per major area, lesson coverage, all quotas and two nonoverlapping forms.
            </p>
            <ul className="list-inside list-disc space-y-2">
              {inventory.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
            <Button
              disabled={pending || !inventory.ready}
              onClick={() =>
                run(
                  () => client.profiles.launch({ level: inventory.level }),
                  "Level launch gate recorded. Operational release checks are still required.",
                )
              }
            >
              Confirm content launch readiness
            </Button>
          </>
        )}
      </section>
      <p role="status" className="text-success">
        {notice}
      </p>
      <FormError message={state.error} />
    </div>
  );
}
