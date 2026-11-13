import type { Database } from "@sibol-cse/db";
import { mockBlueprintVersion, mockFormSet } from "@sibol-cse/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { StudyFilter } from "../learning-contracts";
import { pinSelected, reconcileExpired, shuffled } from "./attempts";
import { activeProfile, candidates, inventory } from "./catalog";
import { fail, preferences } from "./learning-shared";
import { matchesStudyFilter, resolveStudyFilter } from "./study-catalog";
import { lockStudyOwner, seenQuestions } from "./study-session";
export type MockInput = Partial<StudyFilter> & {
  requestId: string;
  kind: "short" | "full";
  mode: "strict_mock" | "timed_practice";
  count: 10 | 20 | 30;
  multiplier: 100 | 150 | 200;
};
export async function mockOptions(db: Database, userId: string) {
  const prefs = await preferences(db, userId);
  const report = await inventory(db, prefs.level);
  const profile = report.profileId ? await activeProfile(db, prefs.level) : null;
  return {
    level: prefs.level,
    profile: profile
      ? {
          id: profile.id,
          version: profile.version,
          itemCount: profile.itemCount,
          durationMinutes: profile.durationMinutes,
          sourceTitle: profile.sourceTitle,
          sourceUrl: profile.sourceUrl,
          verifiedAt: profile.verifiedAt,
        }
      : null,
    fullReady: report.ready,
    gaps: report.gaps,
    available: report.questionCount,
  };
}
export async function startMock(db: Database, userId: string, input: MockInput) {
  await reconcileExpired(db, userId);
  return db.transaction(async (tx) => {
    const existing = await lockStudyOwner(tx, userId, input.requestId, input.mode);
    if (existing) {
      if (existing.setKind !== input.kind || existing.timeMultiplier !== input.multiplier)
        fail("This start ID belongs to a different timed set.");
      return { id: existing.id };
    }
    // Serialize inventory validation with publication, quarantine and profile changes.
    await tx.execute(sql`select pg_advisory_xact_lock(712031)`);
    const prefs = await preferences(tx, userId),
      profile = await activeProfile(tx, prefs.level);
    const filter = await resolveStudyFilter(tx, prefs.level, {
      area: input.area,
      topicId: input.topicId,
      providerSubcategory: input.providerSubcategory,
    });
    if (
      input.kind === "full" &&
      (filter.area !== "all" || filter.topicId !== "mixed" || filter.providerSubcategory)
    )
      fail(
        "Full mocks use the complete reviewed blueprint. Choose a short timed set to focus on a category.",
      );
    if (input.mode === "strict_mock" && input.multiplier !== 100)
      fail("Extended time must use the separately labeled practice mode.");
    if (input.kind === "full" && input.mode !== "strict_mock")
      fail("Full mock trends use strict timing. Choose a short set for extended-time practice.");
    const pool = await candidates(tx, prefs.level),
      seen = await seenQuestions(tx, userId);
    const order = (rows: typeof pool) => [
      ...shuffled(rows.filter((q) => !seen.has(q.questionId))),
      ...shuffled(rows.filter((q) => seen.has(q.questionId))),
    ];
    let selected: typeof pool, blueprintId: string | undefined;
    if (input.kind === "full") {
      const report = await inventory(tx, prefs.level);
      if (!report.ready) fail(`Full mock unavailable: ${report.gaps.join(" ")}`);
      const [validatedSet] = await tx
        .select()
        .from(mockFormSet)
        .where(eq(mockFormSet.id, report.formSetId ?? ""));
      if (!validatedSet) fail("Two validated forms are required for the selected blueprint.");
      const blueprints = await tx
        .select()
        .from(mockBlueprintVersion)
        .where(
          and(
            eq(mockBlueprintVersion.profileVersionId, profile.id),
            eq(mockBlueprintVersion.published, true),
            eq(mockBlueprintVersion.id, validatedSet.blueprintId),
          ),
        );
      const blueprint = blueprints.find(
        (b) => Object.values(b.quotas).reduce((n, q) => n + q, 0) === profile.itemCount,
      );
      if (!blueprint) fail("A published, complete blueprint is required.");
      blueprintId = blueprint.id;
      selected = [];
      for (const [topicId, count] of Object.entries(blueprint.quotas)) {
        const available = order(pool.filter((q) => q.topicId === topicId));
        if (available.length < count)
          fail(`Blueprint shortage: ${topicId} needs ${count} questions.`);
        selected.push(...available.slice(0, count));
      }
      if (selected.length !== profile.itemCount)
        fail("The full mock must match its profile's scored item count.");
      selected = shuffled(selected);
    } else {
      const filtered = pool.filter((q) => matchesStudyFilter(q, filter));
      if (filtered.length < input.count)
        fail(
          `Not enough reviewed inventory: ${filtered.length}/${input.count}. No shortened set was created.`,
        );
      selected = order(filtered).slice(0, input.count);
    }
    const minutes =
      input.kind === "full"
        ? profile.durationMinutes
        : Math.ceil((profile.durationMinutes * input.count) / profile.itemCount);
    return pinSelected(
      tx,
      userId,
      selected,
      seen,
      {
        mode: input.mode,
        profileVersionId: profile.id,
        blueprintVersionId: blueprintId,
        creationKey: input.requestId,
        setKind: input.kind,
        timeMultiplier: input.multiplier,
      },
      Math.ceil((minutes * 60 * input.multiplier) / 100),
    );
  });
}
