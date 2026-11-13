import type { Database } from "@sibol-cse/db";
import {
  auditEvent,
  examProfileVersion,
  lessonVersion,
  levelLaunch,
  mockBlueprintVersion,
  mockFormItem,
  mockFormSet,
  question,
  questionVersion,
  topic,
} from "@sibol-cse/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { profileInput } from "../learning-contracts";
import { assertAdmin, fail, missing, type Store } from "./learning-shared";
export const areasFor = (level: string) => [
  "verbal",
  "numerical",
  "general",
  level === "professional" ? "analytical" : "clerical",
];
export const supportsLevel = (level: "professional" | "subprofessional") =>
  sql`${level} = any(coalesce(${questionVersion.levels}, array[${questionVersion.level}]))`;
export async function candidates(db: Store, level: "professional" | "subprofessional") {
  return db
    .select({
      id: questionVersion.id,
      questionId: question.id,
      topicId: questionVersion.primaryTopicId,
      difficulty: questionVersion.difficulty,
      area: topic.area,
      providerSubcategory: sql<string | null>`${questionVersion.provider}->>'subcategory'`,
    })
    .from(questionVersion)
    .innerJoin(question, eq(question.id, questionVersion.questionId))
    .innerJoin(topic, eq(topic.id, questionVersion.primaryTopicId))
    .where(
      and(
        eq(questionVersion.status, "published"),
        supportsLevel(level),
        eq(question.blocked, false),
        eq(topic.enabled, true),
        sql`${level} = any(${topic.levels})`,
      ),
    )
    .orderBy(question.id)
    .limit(10000);
}
export async function activeProfile(db: Store, level: "professional" | "subprofessional") {
  const [p] = await db
    .select()
    .from(examProfileVersion)
    .where(and(eq(examProfileVersion.level, level), eq(examProfileVersion.active, true)));
  if (!p) fail("A reviewed exam profile must be activated before starting a set.");
  return p;
}
export async function profileList(db: Store) {
  return db
    .select()
    .from(examProfileVersion)
    .orderBy(examProfileVersion.level, desc(examProfileVersion.version));
}
export async function createProfile(
  db: Database,
  actorId: string,
  input: z.infer<typeof profileInput>,
) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    const today = new Date().toISOString().slice(0, 10);
    if (input.verifiedOn > today || (input.publishedOn && input.publishedOn > input.verifiedOn))
      fail("Use valid publication and verification dates, not future dates.");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`profile:${input.level}`}))`);
    const [last] = await tx
      .select({ version: examProfileVersion.version })
      .from(examProfileVersion)
      .where(eq(examProfileVersion.level, input.level))
      .orderBy(desc(examProfileVersion.version))
      .limit(1);
    const [p] = await tx
      .insert(examProfileVersion)
      .values({
        level: input.level,
        version: (last?.version ?? 0) + 1,
        itemCount: input.itemCount,
        durationMinutes: input.durationMinutes,
        diagnosticCount: input.diagnosticCount,
        sourceUrl: input.sourceUrl,
        sourceTitle: input.sourceTitle,
        publishedOn: input.publishedOn,
        verifiedAt: new Date(`${input.verifiedOn}T00:00:00Z`),
        reviewerId: actorId,
      })
      .returning();
    if (!p) throw new Error("Profile insert failed");
    await tx.insert(auditEvent).values({ actorId, action: "profile.verified", targetId: p.id });
    return { id: p.id };
  });
}
export async function activateProfile(db: Database, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    await tx.execute(sql`select pg_advisory_xact_lock(712031)`);
    const [p] = await tx.select().from(examProfileVersion).where(eq(examProfileVersion.id, id));
    if (!p) return missing();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`profile:${p.level}`}))`);
    if (!p.sourceUrl || !p.sourceTitle || !p.verifiedAt || !p.reviewerId)
      fail("Verify the applicable official announcement before activation.");
    const topics = await tx
      .select()
      .from(topic)
      .where(and(eq(topic.enabled, true), sql`${p.level} = any(${topic.levels})`));
    if (p.diagnosticCount < topics.length)
      fail(`The diagnostic needs at least ${topics.length} items to cover enabled topics.`);
    await tx
      .update(examProfileVersion)
      .set({ active: false })
      .where(and(eq(examProfileVersion.level, p.level), eq(examProfileVersion.active, true)));
    await tx.update(examProfileVersion).set({ active: true }).where(eq(examProfileVersion.id, id));
    await tx.insert(auditEvent).values({ actorId, action: "profile.activated", targetId: id });
    return { activated: true };
  });
}
export async function createBlueprint(
  db: Database,
  actorId: string,
  profileId: string,
  quotas: Record<string, number>,
) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    await tx.execute(sql`select pg_advisory_xact_lock(712031)`);
    const [p] = await tx
      .select()
      .from(examProfileVersion)
      .where(eq(examProfileVersion.id, profileId))
      .for("update");
    if (!p) return missing();
    const enabled = await tx
      .select()
      .from(topic)
      .where(and(eq(topic.enabled, true), sql`${p.level} = any(${topic.levels})`));
    if (Object.values(quotas).reduce((a, b) => a + b, 0) !== p.itemCount)
      fail("Blueprint quotas must equal the profile's scored item count; EDQ is excluded.");
    if (Object.keys(quotas).some((id) => !enabled.some((t) => t.id === id)))
      fail("Blueprint topics must match the profile level.");
    const areaSet = new Set(enabled.filter((t) => (quotas[t.id] ?? 0) > 0).map((t) => t.area));
    if (areasFor(p.level).some((area) => !areaSet.has(area)))
      fail("Include every major exam area in the blueprint.");
    const [last] = await tx
      .select()
      .from(mockBlueprintVersion)
      .where(eq(mockBlueprintVersion.profileVersionId, profileId))
      .orderBy(desc(mockBlueprintVersion.version))
      .limit(1);
    const [b] = await tx
      .insert(mockBlueprintVersion)
      .values({
        profileVersionId: profileId,
        version: (last?.version ?? 0) + 1,
        quotas,
        durationMinutes: p.durationMinutes,
        published: true,
      })
      .returning();
    if (!b) throw new Error("Blueprint insert failed");
    await tx.insert(auditEvent).values({ actorId, action: "blueprint.published", targetId: b.id });
    return { id: b.id };
  });
}
export async function buildForms(db: Database, actorId: string, blueprintId: string) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    await tx.execute(sql`select pg_advisory_xact_lock(712031)`);
    const [b] = await tx
      .select()
      .from(mockBlueprintVersion)
      .where(eq(mockBlueprintVersion.id, blueprintId))
      .for("share");
    if (!b) return missing();
    const [p] = await tx
      .select()
      .from(examProfileVersion)
      .where(eq(examProfileVersion.id, b.profileVersionId));
    if (!p) return missing();
    const pool = await candidates(tx, p.level);
    const selected: { id: string; questionId: string; form: number; position: number }[] = [];
    for (const [topicId, count] of Object.entries(b.quotas)) {
      const found = pool.filter((q) => q.topicId === topicId);
      if (found.length < count * 2)
        fail(
          `Topic ${topicId} needs ${count * 2} reviewed unique questions for two nonoverlapping forms; found ${found.length}.`,
        );
      for (let form = 1; form <= 2; form++) {
        for (const q of found.slice((form - 1) * count, form * count))
          selected.push({ ...q, form, position: selected.filter((x) => x.form === form).length });
      }
    }
    const [set] = await tx
      .insert(mockFormSet)
      .values({ blueprintId, createdBy: actorId })
      .returning();
    if (!set) throw new Error("Form set insert failed");
    await tx.insert(mockFormItem).values(
      selected.map((q) => ({
        setId: set.id,
        form: q.form,
        position: q.position,
        questionVersionId: q.id,
        questionId: q.questionId,
      })),
    );
    await tx.insert(auditEvent).values({ actorId, action: "mock.forms.created", targetId: set.id });
    return { id: set.id };
  });
}
export async function inventory(db: Store, level: "professional" | "subprofessional") {
  const pool = await candidates(db, level);
  const topics = await db
    .select()
    .from(topic)
    .where(and(eq(topic.enabled, true), sql`${level} = any(${topic.levels})`));
  const lessons = await db
    .select({ topicId: lessonVersion.topicId })
    .from(lessonVersion)
    .where(
      and(eq(lessonVersion.status, "published"), sql`${level} = any(${lessonVersion.levels})`),
    );
  const gaps: string[] = [];
  if (pool.length < 300) gaps.push(`Reviewed questions: ${pool.length}/300.`);
  const areas = areasFor(level).map((area) => ({
    area,
    count: pool.filter((q) => q.area === area).length,
  }));
  for (const a of areas) if (a.count < 30) gaps.push(`${a.area}: ${a.count}/30 questions.`);
  for (const t of topics)
    if (!lessons.some((l) => l.topicId === t.id))
      gaps.push(`Missing lesson/worked example: ${t.title}.`);
  const [profile] = await db
    .select()
    .from(examProfileVersion)
    .where(and(eq(examProfileVersion.level, level), eq(examProfileVersion.active, true)));
  let formSetId: string | null = null;
  const blueprints = profile
    ? await db
        .select()
        .from(mockBlueprintVersion)
        .where(eq(mockBlueprintVersion.profileVersionId, profile.id))
    : [];
  for (const b of blueprints) {
    for (const [id, quota] of Object.entries(b.quotas)) {
      const n = pool.filter((q) => q.topicId === id).length;
      if (n < quota) gaps.push(`Blueprint v${b.version}: ${id} has ${n}/${quota} items.`);
    }
    const sets = await db
      .select()
      .from(mockFormSet)
      .where(eq(mockFormSet.blueprintId, b.id))
      .orderBy(desc(mockFormSet.createdAt));
    for (const set of sets) {
      const items = await db.select().from(mockFormItem).where(eq(mockFormItem.setId, set.id));
      if (
        items.length !== 2 * (profile?.itemCount ?? 0) ||
        new Set(items.map((x) => x.questionId)).size !== items.length ||
        items.some((item) => !pool.some((q) => q.id === item.questionVersionId))
      )
        continue;
      if (
        [1, 2].every((form) =>
          Object.entries(b.quotas).every(
            ([id, n]) =>
              items.filter(
                (item) =>
                  item.form === form &&
                  pool.some((q) => q.id === item.questionVersionId && q.topicId === id),
              ).length === n,
          ),
        )
      )
        formSetId = set.id;
    }
  }
  if (!profile) gaps.push("No verified active exam profile.");
  if (!formSetId) gaps.push("Two complete, reviewed, nonoverlapping mock forms are required.");
  return {
    level,
    questionCount: pool.length,
    areas,
    topics: topics.map((t) => ({
      id: t.id,
      title: t.title,
      questions: pool.filter((q) => q.topicId === t.id).length,
      hasLesson: lessons.some((l) => l.topicId === t.id),
    })),
    gaps,
    ready: gaps.length === 0,
    formSetId,
    profileId: profile?.id ?? null,
  };
}
export async function launchLevel(
  db: Database,
  actorId: string,
  level: "professional" | "subprofessional",
) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    await tx.execute(sql`select pg_advisory_xact_lock(712031)`);
    const report = await inventory(tx, level);
    if (!report.ready || !report.profileId || !report.formSetId) fail(report.gaps.join(" "));
    await tx
      .insert(levelLaunch)
      .values({
        level,
        profileId: report.profileId,
        formSetId: report.formSetId,
        launchedBy: actorId,
      })
      .onConflictDoUpdate({
        target: levelLaunch.level,
        set: {
          profileId: report.profileId,
          formSetId: report.formSetId,
          launchedBy: actorId,
          launchedAt: new Date(),
        },
      });
    await tx.insert(auditEvent).values({ actorId, action: "level.launched", targetId: level });
    return { launched: true };
  });
}
