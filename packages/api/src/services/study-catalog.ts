import type { Database } from "@sibol-cse/db";
import { questionVersion, topic } from "@sibol-cse/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { type StudyFilter, studyFilterInput } from "../learning-contracts";
import { areaLabels, providerTopicLabels, providerTopics } from "../study-catalog";
import { areasFor, candidates } from "./catalog";
import { fail, preferences, type Store } from "./learning-shared";

export async function resolveStudyFilter(
  db: Store,
  level: "professional" | "subprofessional",
  raw: Partial<StudyFilter> = {},
) {
  const filter = studyFilterInput.parse(raw);
  if (filter.area !== "all" && !areasFor(level).includes(filter.area))
    fail("Choose a category available for your study track.");
  if (filter.topicId !== "mixed") {
    const [row] = await db.select().from(topic).where(eq(topic.id, filter.topicId));
    if (
      !row?.enabled ||
      !row.levels.includes(level) ||
      (filter.area !== "all" && row.area !== filter.area)
    )
      fail("Choose an enabled subcategory within the selected category and track.");
  }
  if (filter.providerSubcategory) {
    const source = providerTopics.find((t) => t.subcategory === filter.providerSubcategory);
    if (
      !source ||
      !(source.levels as readonly string[]).includes(level) ||
      (filter.topicId !== "mixed" && source.topicId && source.topicId !== filter.topicId)
    )
      fail("Choose a source focus matching your subcategory and track.");
  }
  return filter;
}
export function matchesStudyFilter(
  row: { area: string | null; topicId: string; providerSubcategory?: string | null },
  filter: StudyFilter,
) {
  return (
    (filter.area === "all" || row.area === filter.area) &&
    (filter.topicId === "mixed" || row.topicId === filter.topicId) &&
    (!filter.providerSubcategory || row.providerSubcategory === filter.providerSubcategory)
  );
}
export function studyFilterWhere(filter: StudyFilter) {
  return and(
    filter.area === "all" ? undefined : eq(topic.area, filter.area),
    filter.topicId === "mixed" ? undefined : eq(questionVersion.primaryTopicId, filter.topicId),
    filter.providerSubcategory
      ? sql`${questionVersion.provider}->>'subcategory' = ${filter.providerSubcategory}`
      : undefined,
  );
}
export async function studyCatalog(db: Database, userId: string) {
  const prefs = await preferences(db, userId);
  const pool = await candidates(db, prefs.level);
  const topics = await db
    .select()
    .from(topic)
    .where(and(eq(topic.enabled, true), sql`${prefs.level} = any(${topic.levels})`))
    .orderBy(topic.slug);
  return {
    level: prefs.level,
    publishedQuestions: pool.length,
    areas: areasFor(prefs.level).map((area) => ({
      id: area,
      label: areaLabels[area as keyof typeof areaLabels],
      count: pool.filter((q) => q.area === area).length,
      topics: topics
        .filter((t) => t.area === area)
        .map((t) => ({
          id: t.id,
          label: t.title,
          count: pool.filter((q) => q.topicId === t.id).length,
          focuses: providerTopics
            .filter(
              (s) => (s.levels as readonly string[]).includes(prefs.level) && s.topicId === t.id,
            )
            .map((s) => ({
              id: s.subcategory,
              label: providerTopicLabels[s.subcategory] ?? s.subcategory,
              count: pool.filter(
                (q) => q.topicId === t.id && q.providerSubcategory === s.subcategory,
              ).length,
            })),
        })),
    })),
  };
}
