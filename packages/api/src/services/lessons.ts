import { ORPCError } from "@orpc/server";
import type { Database } from "@sibol-cse/db";
import {
  lesson,
  lessonProgress,
  lessonVersion,
  studyPreferences,
  topic,
} from "@sibol-cse/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { lessonStructure } from "../learning-contracts";
import { fail, missing, preferences } from "./learning-shared";
export async function listLessons(db: Database, userId: string) {
  const prefs = await preferences(db, userId);
  return db
    .select({
      id: lesson.id,
      slug: lesson.slug,
      title: lessonVersion.title,
      version: lessonVersion.version,
      topicId: topic.id,
      topic: topic.title,
      completedAt: lessonProgress.completedAt,
      location: lessonProgress.location,
    })
    .from(lessonVersion)
    .innerJoin(lesson, eq(lesson.id, lessonVersion.lessonId))
    .innerJoin(topic, eq(topic.id, lessonVersion.topicId))
    .leftJoin(
      lessonProgress,
      and(eq(lessonProgress.lessonId, lesson.id), eq(lessonProgress.userId, userId)),
    )
    .where(
      and(
        eq(lessonVersion.status, "published"),
        eq(topic.enabled, true),
        sql`${prefs.level} = any(${lessonVersion.levels})`,
      ),
    )
    .orderBy(topic.slug, lesson.slug)
    .limit(200);
}
export async function getLesson(db: Database, userId: string, slug: string, latest = false) {
  const prefs = await preferences(db, userId);
  const [stable] = await db.select().from(lesson).where(eq(lesson.slug, slug));
  if (!stable) return missing();
  const [progress] = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, stable.id)));
  const [current] = await db
    .select()
    .from(lessonVersion)
    .where(
      and(
        eq(lessonVersion.lessonId, stable.id),
        eq(lessonVersion.status, "published"),
        sql`${prefs.level} = any(${lessonVersion.levels})`,
      ),
    )
    .orderBy(desc(lessonVersion.version))
    .limit(1);
  if (!current) return missing();
  let version = current;
  if (!latest && progress && !progress.completedAt) {
    const [pinned] = await db
      .select()
      .from(lessonVersion)
      .where(eq(lessonVersion.id, progress.versionId));
    if (
      pinned &&
      ["published", "retired"].includes(pinned.status) &&
      pinned.levels.includes(prefs.level)
    )
      version = pinned;
  }
  const [t] = await db.select().from(topic).where(eq(topic.id, version.topicId));
  if (!t?.enabled) return missing();
  const parsed = lessonStructure.safeParse(version.structure);
  if (!parsed.success) fail("This lesson needs editorial review before it can be displayed.");
  return {
    id: stable.id,
    slug,
    title: version.title,
    version: version.version,
    versionId: version.id,
    latestVersionId: current.id,
    topicId: version.topicId,
    topic: t.title,
    structure: parsed.data,
    erratum: version.erratum,
    progress: progress ?? null,
  };
}
export async function saveLessonProgress(
  db: Database,
  userId: string,
  versionId: string,
  location: string,
  revision: number,
  complete: boolean,
) {
  return db.transaction(async (tx) => {
    const [prefs] = await tx
      .select()
      .from(studyPreferences)
      .where(eq(studyPreferences.userId, userId))
      .for("update");
    if (!prefs) return missing();
    const [version] = await tx.select().from(lessonVersion).where(eq(lessonVersion.id, versionId));
    if (
      !version ||
      !["published", "retired"].includes(version.status) ||
      !version.levels.includes(prefs.level)
    )
      return missing();
    const [old] = await tx
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, version.lessonId)))
      .for("update");
    if (version.status !== "published" && old?.versionId !== version.id) return missing();
    if ((old?.revision ?? 0) !== revision)
      throw new ORPCError("CONFLICT", {
        message: "Reading progress changed in another tab. Reload before saving.",
      });
    const values = {
      versionId,
      location,
      revision: revision + 1,
      completedAt: complete ? new Date() : (old?.completedAt ?? null),
    };
    await tx
      .insert(lessonProgress)
      .values({ ...values, userId, lessonId: version.lessonId })
      .onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.lessonId],
        set: values,
      });
    return { revision: revision + 1, completed: !!values.completedAt };
  });
}
