import { randomInt } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { Database } from "@sibol-cse/db";
import {
  attempt,
  attemptAnswer,
  attemptItem,
  attemptResult,
  bookmark,
  choice,
  examProfileVersion,
  question,
  questionExposure,
  questionIssue,
  questionVersion,
  studyPlan,
  topic,
  userProfile,
} from "@sibol-cse/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AnswerInput, PracticeInput } from "../learning-contracts";
import { activeProfile, areasFor, candidates } from "./catalog";
import {
  assertFeedbackAllowed,
  assertStudyWindow,
  fail,
  missing,
  preferences,
  type Store,
  strictQuestions,
  type Tx,
} from "./learning-shared";
import { readNote, writeBookmark, writeNote } from "./note-store";
import { applyReviewOutcome, serverClock } from "./review-schedule";

export function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = result[i];
    const b = result[j];
    if (a !== undefined && b !== undefined) {
      result[i] = b;
      result[j] = a;
    }
  }
  return result;
}
export async function ownerAttempt(db: Store, userId: string, id: string) {
  const [a] = await db
    .select()
    .from(attempt)
    .where(and(eq(attempt.id, id), eq(attempt.userId, userId)))
    .for("update");
  if (!a) return missing();
  return a;
}
function editable(a: typeof attempt.$inferSelect, now: Date) {
  if (a.status !== "in_progress")
    throw new ORPCError("CONFLICT", {
      message: "This attempt has ended. Reload to see its results.",
    });
  if (a.expiresAt && a.expiresAt <= now)
    throw new ORPCError("CONFLICT", {
      message: "The original deadline has passed. Reload to finalize saved answers.",
    });
}
async function itemRow(db: Store, attemptId: string, itemId: string) {
  const [item] = await db
    .select()
    .from(attemptItem)
    .where(and(eq(attemptItem.id, itemId), eq(attemptItem.attemptId, attemptId)));
  if (!item) return missing();
  return item;
}
export function balancedQuotas(
  topics: { id: string; area: string | null }[],
  level: string,
  count: number,
) {
  const quotas: Record<string, number> = {};
  const areas = areasFor(level);
  if (count < topics.length)
    fail("The configured diagnostic is too short to cover enabled topics.");
  for (const [i, area] of areas.entries()) {
    const group = topics.filter((t) => t.area === area).sort((a, b) => a.id.localeCompare(b.id));
    if (!group.length) fail(`No enabled topics for ${area}.`);
    const n = Math.floor(count / areas.length) + (i < count % areas.length ? 1 : 0);
    if (n < group.length) fail(`Increase diagnostic length to cover all ${area} topics.`);
    group.forEach((t, j) => {
      quotas[t.id] = Math.floor(n / group.length) + (j < n % group.length ? 1 : 0);
    });
  }
  return quotas;
}
export async function diagnosticOptions(db: Database, userId: string) {
  const prefs = await preferences(db, userId);
  const [profile] = await db
    .select()
    .from(examProfileVersion)
    .where(and(eq(examProfileVersion.level, prefs.level), eq(examProfileVersion.active, true)));
  return { level: prefs.level, count: profile?.diagnosticCount ?? 30, available: !!profile };
}
export async function createAttempt(
  db: Database,
  userId: string,
  mode: "practice" | "diagnostic",
  input: PracticeInput | { requestId: string },
) {
  await reconcileExpired(db, userId);
  return db.transaction(async (tx) => {
    await tx.select().from(userProfile).where(eq(userProfile.userId, userId)).for("update");
    const [existing] = await tx
      .select({ id: attempt.id, mode: attempt.mode })
      .from(attempt)
      .where(and(eq(attempt.userId, userId), eq(attempt.creationKey, input.requestId)));
    if (existing) {
      if (existing.mode !== mode) fail("This request ID was already used for a different mode.");
      return { id: existing.id };
    }
    const strict = await tx
      .select({ id: attempt.id })
      .from(attempt)
      .where(
        and(
          eq(attempt.userId, userId),
          inArray(attempt.mode, ["strict_mock", "diagnostic"]),
          eq(attempt.status, "in_progress"),
        ),
      )
      .limit(1);
    if (strict.length)
      throw new ORPCError("FORBIDDEN", {
        message: "Finish your diagnostic or strict mock before starting another study set.",
      });
    const prefs = await preferences(tx, userId);
    const profile = await activeProfile(tx, prefs.level);
    const pool = await candidates(tx, prefs.level);
    const history = await tx
      .select({ questionId: questionVersion.questionId })
      .from(attemptItem)
      .innerJoin(attempt, eq(attempt.id, attemptItem.attemptId))
      .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
      .where(eq(attempt.userId, userId));
    const seen = new Set(history.map((x) => x.questionId));
    let selected: typeof pool = [];
    const pick = (found: typeof pool, n: number, unseen: boolean) => {
      const ordered = unseen
        ? [
            ...shuffled(found.filter((q) => !seen.has(q.questionId))),
            ...shuffled(found.filter((q) => seen.has(q.questionId))),
          ]
        : shuffled(found);
      return ordered.slice(0, n);
    };
    if (mode === "practice") {
      const config = input as PracticeInput;
      const [t] = await tx.select().from(topic).where(eq(topic.id, config.topicId));
      if (config.topicId !== "mixed" && (!t?.enabled || !t.levels.includes(prefs.level)))
        fail("Choose an enabled topic for your selected level.");
      const found = pool.filter(
        (q) =>
          (config.topicId === "mixed" || q.topicId === config.topicId) &&
          (config.difficulty === "any" || q.difficulty === config.difficulty),
      );
      if (found.length < config.count)
        fail(
          `Not enough reviewed questions: ${found.length} available, ${config.count} required. Try a smaller set or another topic.`,
        );
      selected = pick(found, config.count, config.unseenFirst);
    } else {
      const topics = await tx
        .select()
        .from(topic)
        .where(and(eq(topic.enabled, true), sql`${prefs.level} = any(${topic.levels})`));
      const quotas = balancedQuotas(topics, prefs.level, profile.diagnosticCount);
      for (const [id, n] of Object.entries(quotas)) {
        const found = pool.filter((q) => q.topicId === id);
        if (found.length < n)
          fail(
            `Diagnostic coverage shortage: ${topics.find((t) => t.id === id)?.title ?? id} needs ${n} reviewed questions; found ${found.length}. You can skip for a balanced starter plan.`,
          );
        selected.push(...pick(found, n, true));
      }
      selected = shuffled(selected);
    }
    if (new Set(selected.map((q) => q.questionId)).size !== selected.length)
      throw new Error("Duplicate stable question selection");
    return pinSelected(tx, userId, selected, seen, {
      mode,
      profileVersionId: profile.id,
      creationKey: input.requestId,
    });
  });
}
export async function pinSelected(
  tx: Tx,
  userId: string,
  selected: Awaited<ReturnType<typeof candidates>>,
  seen: Set<string>,
  config: {
    mode: string;
    profileVersionId: string;
    blueprintVersionId?: string;
    creationKey: string;
    setKind?: string;
    timeMultiplier?: number;
  },
  durationSeconds?: number,
) {
  // Lock selected publication rows so quarantine/publication cannot race selection.
  const identities = await tx
    .select()
    .from(question)
    .where(
      inArray(
        question.id,
        selected.map((q) => q.questionId),
      ),
    )
    .for("share");
  const locked = await tx
    .select({ id: questionVersion.id, status: questionVersion.status })
    .from(questionVersion)
    .where(
      inArray(
        questionVersion.id,
        selected.map((q) => q.id),
      ),
    )
    .for("share");
  if (locked.some((q) => q.status !== "published") || identities.some((q) => q.blocked))
    throw new ORPCError("CONFLICT", {
      message: "Content availability changed. Retry with a new request ID.",
    });
  const now = await serverClock(tx);
  const [a] = await tx
    .insert(attempt)
    .values({
      userId,
      ...config,
      startedAt: now,
      expiresAt: durationSeconds ? new Date(now.getTime() + durationSeconds * 1000) : null,
    })
    .returning();
  if (!a) throw new Error("Attempt insert failed");
  for (const [position, q] of selected.entries()) {
    const choices = await tx
      .select({ id: choice.id })
      .from(choice)
      .where(eq(choice.questionVersionId, q.id));
    const [item] = await tx
      .insert(attemptItem)
      .values({
        attemptId: a.id,
        position,
        questionVersionId: q.id,
        choiceOrder: shuffled(choices.map((c) => c.id)),
        firstExposure: !seen.has(q.questionId),
      })
      .returning();
    if (!item) throw new Error("Item insert failed");
    await tx
      .insert(questionExposure)
      .values({ userId, questionId: q.questionId, firstItemId: item.id })
      .onConflictDoNothing();
  }
  return { id: a.id };
}
export async function skipDiagnostic(db: Database, userId: string) {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .for("update");
    if (profile?.diagnosticDecision === "completed")
      return { skipped: false, reason: "Your completed diagnostic evidence is preserved." };
    const active = await tx
      .select()
      .from(attempt)
      .where(
        and(
          eq(attempt.userId, userId),
          eq(attempt.mode, "diagnostic"),
          eq(attempt.status, "in_progress"),
        ),
      )
      .limit(1);
    if (active.length) fail("Finish your active diagnostic before changing this decision.");
    const prefs = await preferences(tx, userId);
    await tx
      .update(userProfile)
      .set({ diagnosticDecision: "skipped" })
      .where(eq(userProfile.userId, userId));
    await tx
      .insert(studyPlan)
      .values({
        userId,
        level: prefs.level,
        preferencesRevision: prefs.revision,
        reason: "Balanced starter plan: diagnostic skipped; insufficient evidence.",
      })
      .onConflictDoUpdate({
        target: [studyPlan.userId, studyPlan.preferencesRevision],
        set: { reason: "Balanced starter plan: diagnostic skipped; insufficient evidence." },
      });
    return {
      skipped: true,
      reason: "Balanced starter plan: insufficient evidence. No proficiency is assumed.",
    };
  });
}
async function feedback(db: Store, userId: string, item: typeof attemptItem.$inferSelect) {
  const [v] = await db
    .select()
    .from(questionVersion)
    .where(eq(questionVersion.id, item.questionVersionId));
  if (!v) return missing();
  await assertFeedbackAllowed(db, userId, [v.questionId]);
  const [answer] = await db
    .select()
    .from(attemptAnswer)
    .where(eq(attemptAnswer.attemptItemId, item.id));
  return {
    answerChoiceId: v.answerChoiceId,
    explanation: v.explanation,
    distractorExplanations: v.distractorExplanations ?? {},
    correct: answer?.selectedChoiceId === v.answerChoiceId,
    erratum: v.erratum,
    status: v.status,
  };
}
export async function saveAnswer(db: Database, userId: string, input: AnswerInput) {
  return db.transaction(async (tx) => {
    const a = await ownerAttempt(tx, userId, input.attemptId);
    editable(a, await serverClock(tx));
    const item = await itemRow(tx, a.id, input.itemId);
    const [old] = await tx
      .select()
      .from(attemptAnswer)
      .where(eq(attemptAnswer.attemptItemId, item.id));
    if (old?.mutationId === input.mutationId) {
      if (old.selectedChoiceId !== input.selectedChoiceId || old.confidence !== input.confidence)
        fail("A save ID cannot be reused with different content.");
      return { revision: old.revision, savedAt: old.savedAt };
    }
    if (item.committedAt)
      throw new ORPCError("CONFLICT", { message: "This answer is already committed." });
    if ((old?.revision ?? 0) !== input.expectedRevision)
      throw new ORPCError("CONFLICT", {
        message: "A newer answer is saved. Reload before changing it.",
      });
    if (input.selectedChoiceId !== null && !item.choiceOrder.includes(input.selectedChoiceId))
      fail("This choice does not belong to the pinned question.");
    const values = {
      selectedChoiceId: input.selectedChoiceId,
      confidence: input.confidence,
      revision: input.expectedRevision + 1,
      mutationId: input.mutationId,
    };
    // The locked parent serializes saves. An explicit update also avoids firing
    // the first-revision INSERT guard before PostgreSQL resolves an upsert.
    const [saved] = old
      ? await tx
          .update(attemptAnswer)
          .set(values)
          .where(eq(attemptAnswer.attemptItemId, item.id))
          .returning()
      : await tx
          .insert(attemptAnswer)
          .values({ ...values, attemptItemId: item.id, questionVersionId: item.questionVersionId })
          .returning();
    if (!saved) throw new Error("Save failed");
    return { revision: saved.revision, savedAt: saved.savedAt };
  });
}
export async function commitAnswer(
  db: Database,
  userId: string,
  attemptId: string,
  itemId: string,
  revision: number,
) {
  return db.transaction(async (tx) => {
    const a = await ownerAttempt(tx, userId, attemptId);
    const item = await itemRow(tx, a.id, itemId);
    if (!["practice", "review"].includes(a.mode))
      fail("Diagnostic and mock feedback is available only after completion.");
    if (item.committedAt) return feedback(tx, userId, item);
    editable(a, await serverClock(tx));
    const [answer] = await tx
      .select()
      .from(attemptAnswer)
      .where(eq(attemptAnswer.attemptItemId, item.id));
    if ((answer?.revision ?? 0) !== revision)
      throw new ORPCError("CONFLICT", {
        message: "Wait for your latest answer to save before committing.",
      });
    await tx
      .update(attemptItem)
      .set({ committedAt: new Date() })
      .where(eq(attemptItem.id, item.id));
    await applyReviewOutcome(tx, userId, item, a.mode);
    return feedback(tx, userId, item);
  });
}
async function finalize(tx: Tx, userId: string, a: typeof attempt.$inferSelect) {
  const [existing] = await tx.select().from(attemptResult).where(eq(attemptResult.attemptId, a.id));
  if (existing) return existing;
  if (a.status !== "in_progress")
    throw new ORPCError("CONFLICT", { message: "The attempt has no available final result." });
  const rows = await tx
    .select({ item: attemptItem, answer: attemptAnswer, key: questionVersion.answerChoiceId })
    .from(attemptItem)
    .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
    .leftJoin(attemptAnswer, eq(attemptAnswer.attemptItemId, attemptItem.id))
    .where(eq(attemptItem.attemptId, a.id));
  let correct = 0,
    incorrect = 0,
    unanswered = 0;
  for (const row of rows) {
    if (!row.answer?.selectedChoiceId) unanswered++;
    else if (row.answer.selectedChoiceId === row.key) correct++;
    else incorrect++;
    if (["practice", "review"].includes(a.mode))
      await applyReviewOutcome(tx, userId, row.item, a.mode);
  }
  const now = await serverClock(tx);
  const endedAt = a.expiresAt && a.expiresAt < now ? a.expiresAt : now;
  await tx
    .update(attempt)
    .set({
      status: a.expiresAt && a.expiresAt <= now ? "expired" : "submitted",
      submittedAt: endedAt,
    })
    .where(eq(attempt.id, a.id));
  const [result] = await tx
    .insert(attemptResult)
    .values({
      attemptId: a.id,
      correct,
      incorrect,
      unanswered,
      elapsedSeconds: Math.max(0, Math.floor((endedAt.getTime() - a.startedAt.getTime()) / 1000)),
      scoringVersion: "objective-v1",
    })
    .returning();
  if (!result) throw new Error("Result insert failed");
  if (a.mode === "diagnostic") {
    await tx.select().from(userProfile).where(eq(userProfile.userId, userId)).for("update");
    const prefs = await preferences(tx, userId);
    const [pinned] = await tx
      .select()
      .from(examProfileVersion)
      .where(eq(examProfileVersion.id, a.profileVersionId));
    if (pinned?.level === prefs.level)
      await tx
        .update(userProfile)
        .set({ diagnosticDecision: "completed" })
        .where(eq(userProfile.userId, userId));
  }
  return result;
}
export async function submitAttempt(db: Database, userId: string, id: string) {
  return db.transaction(async (tx) => {
    const a = await ownerAttempt(tx, userId, id);
    return finalize(tx, userId, a);
  });
}
export async function getAttempt(db: Database, userId: string, id: string) {
  return db.transaction(async (tx) => {
    let a = await ownerAttempt(tx, userId, id);
    if (a.status === "in_progress" && a.expiresAt && a.expiresAt <= (await serverClock(tx))) {
      await finalize(tx, userId, a);
      a = { ...a, status: "expired" };
    }
    const rows = await tx
      .select({
        item: attemptItem,
        version: questionVersion,
        answer: attemptAnswer,
        blocked: question.blocked,
        topic: topic.title,
      })
      .from(attemptItem)
      .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
      .innerJoin(question, eq(question.id, questionVersion.questionId))
      .innerJoin(topic, eq(topic.id, questionVersion.primaryTopicId))
      .leftJoin(attemptAnswer, eq(attemptAnswer.attemptItemId, attemptItem.id))
      .where(eq(attemptItem.attemptId, id))
      .orderBy(attemptItem.position);
    const strict = await strictQuestions(tx, userId);
    const allChoices = rows.length
      ? await tx
          .select({ versionId: choice.questionVersionId, id: choice.id, text: choice.text })
          .from(choice)
          .where(
            inArray(
              choice.questionVersionId,
              rows.map((r) => r.version.id),
            ),
          )
      : [];
    const choicesByVersion = new Map<string, { id: string; text: string }[]>();
    for (const c of allChoices) {
      const group = choicesByVersion.get(c.versionId) ?? [];
      group.push({ id: c.id, text: c.text });
      choicesByVersion.set(c.versionId, group);
    }
    const items = [];
    for (const { item, version, answer, blocked, topic } of rows) {
      const choices = choicesByVersion.get(version.id) ?? [];
      const canReveal =
        (a.status !== "in_progress" ||
          (["practice", "review"].includes(a.mode) && !!item.committedAt)) &&
        !strict.has(version.questionId);
      items.push({
        id: item.id,
        position: item.position,
        questionId: version.questionId,
        versionId: version.id,
        version: version.version,
        topicId: version.primaryTopicId,
        topic,
        prompt: version.prompt,
        passage: version.passage,
        media: version.media as { src: string; alt: string } | null,
        choices: item.choiceOrder
          .map((id) => choices.find((c) => c.id === id))
          .filter((c): c is { id: string; text: string } => !!c),
        selectedChoiceId: answer?.selectedChoiceId ?? null,
        revision: answer?.revision ?? 0,
        confidence: answer?.confidence ?? null,
        savedAt: answer?.savedAt ?? null,
        committed: !!item.committedAt,
        flagged: item.flagged,
        firstExposure: item.firstExposure,
        warning:
          blocked || version.status === "quarantined"
            ? "This item is under editorial review. Its original version and scoring are preserved."
            : version.erratum
              ? "A correction notice is available with feedback."
              : null,
        feedback: canReveal
          ? {
              answerChoiceId: version.answerChoiceId,
              explanation: version.explanation,
              distractorExplanations: version.distractorExplanations ?? {},
              correct: answer?.selectedChoiceId === version.answerChoiceId,
              erratum: version.erratum,
              status: version.status,
            }
          : null,
      });
    }
    return {
      id: a.id,
      mode: a.mode,
      status: a.status,
      startedAt: a.startedAt,
      expiresAt: a.expiresAt,
      serverNow: await serverClock(tx),
      setKind: a.setKind,
      timeMultiplier: a.timeMultiplier,
      profileVersionId: a.profileVersionId,
      blueprintVersionId: a.blueprintVersionId,
      items,
    };
  });
}
export async function results(db: Database, userId: string, id: string) {
  const detail = await getAttempt(db, userId, id);
  if (detail.status === "in_progress")
    throw new ORPCError("FORBIDDEN", { message: "Submit this set before viewing its result." });
  const [result] = await db.select().from(attemptResult).where(eq(attemptResult.attemptId, id));
  if (!result) return missing();
  await assertFeedbackAllowed(
    db,
    userId,
    detail.items.map((i) => i.questionId),
  );
  const topics = [...new Set(detail.items.map((i) => i.topicId))].map((topicId) => {
    const items = detail.items.filter((i) => i.topicId === topicId);
    const first = items.filter((i) => i.firstExposure && i.selectedChoiceId !== null);
    const correct = items.filter((i) => i.feedback?.correct).length;
    return {
      topicId,
      title: items[0]?.topic ?? topicId,
      count: items.length,
      correct,
      firstExposureCount: first.length,
      firstExposureCorrect: first.filter((i) => i.feedback?.correct).length,
      provisional: first.length < 10,
    };
  });
  const total = result.correct + result.incorrect + result.unanswered;
  return {
    ...result,
    total,
    accuracy: total ? result.correct / total : null,
    attemptedAccuracy:
      result.correct + result.incorrect
        ? result.correct / (result.correct + result.incorrect)
        : null,
    topics,
    uniqueQuestions: new Set(detail.items.map((i) => i.questionId)).size,
    firstExposure: {
      presented: detail.items.filter((i) => i.firstExposure).length,
      correct: detail.items.filter((i) => i.firstExposure && i.feedback?.correct).length,
    },
    repeated: {
      presented: detail.items.filter((i) => !i.firstExposure).length,
      correct: detail.items.filter((i) => !i.firstExposure && i.feedback?.correct).length,
    },
    secondsPerPresented: total ? result.elapsedSeconds / total : null,
    detail,
  };
}
export async function flagItem(
  db: Database,
  userId: string,
  attemptId: string,
  itemId: string,
  flagged: boolean,
) {
  return db.transaction(async (tx) => {
    const a = await ownerAttempt(tx, userId, attemptId);
    editable(a, await serverClock(tx));
    await itemRow(tx, a.id, itemId);
    await tx.update(attemptItem).set({ flagged }).where(eq(attemptItem.id, itemId));
    return { flagged };
  });
}
export async function listAttempts(db: Database, userId: string) {
  return db
    .select({
      id: attempt.id,
      mode: attempt.mode,
      status: attempt.status,
      startedAt: attempt.startedAt,
    })
    .from(attempt)
    .where(eq(attempt.userId, userId))
    .orderBy(desc(attempt.startedAt))
    .limit(30);
}
async function studyItem(tx: Tx, userId: string, attemptId: string, itemId: string) {
  const a = await ownerAttempt(tx, userId, attemptId);
  await assertStudyWindow(tx, userId);
  const item = await itemRow(tx, a.id, itemId);
  const [v] = await tx
    .select()
    .from(questionVersion)
    .where(eq(questionVersion.id, item.questionVersionId));
  if (!v) return missing();
  await assertFeedbackAllowed(tx, userId, [v.questionId]);
  return { a, item, v };
}
export async function personalTools(
  db: Database,
  userId: string,
  attemptId: string,
  itemId: string,
) {
  return db.transaction(async (tx) => {
    const { v } = await studyItem(tx, userId, attemptId, itemId);
    const [saved] = await tx
      .select({ id: bookmark.id })
      .from(bookmark)
      .where(and(eq(bookmark.userId, userId), eq(bookmark.questionId, v.questionId)));
    const note = await readNote(tx, userId, { kind: "question", id: v.questionId });
    return { bookmarked: !!saved, note: note.body, noteRevision: note.revision };
  });
}
export async function savePersonalTool(
  db: Database,
  userId: string,
  attemptId: string,
  itemId: string,
  kind: "note" | "bookmark",
  value: string | boolean,
  revision = 0,
  mutationId: string = crypto.randomUUID(),
) {
  return db.transaction(async (tx) => {
    const { v } = await studyItem(tx, userId, attemptId, itemId);
    const target = { kind: "question" as const, id: v.questionId };
    if (kind === "note") {
      if (typeof value !== "string") fail("Use plain text for a private note.");
      await writeNote(tx, userId, target, value.trim() || null, revision, mutationId);
    } else {
      if (typeof value !== "boolean") fail("Choose a bookmark state.");
      await writeBookmark(tx, userId, target, value);
    }
    return { saved: true };
  });
}

export async function reportIssue(
  db: Database,
  userId: string,
  attemptId: string,
  itemId: string,
  category: string,
  description: string,
) {
  return db.transaction(async (tx) => {
    const { item } = await studyItem(tx, userId, attemptId, itemId);
    const [report] = await tx
      .insert(questionIssue)
      .values({
        reporterId: userId,
        questionVersionId: item.questionVersionId,
        category,
        description,
      })
      .returning();
    return { id: report?.id };
  });
}

export async function reconcileExpired(db: Database, userId: string) {
  const rows = await db
    .select({ id: attempt.id })
    .from(attempt)
    .where(
      and(
        eq(attempt.userId, userId),
        eq(attempt.status, "in_progress"),
        sql`${attempt.expiresAt} <= clock_timestamp()`,
      ),
    )
    .limit(20);
  for (const row of rows)
    await db.transaction(async (tx) => {
      const a = await ownerAttempt(tx, userId, row.id);
      if (a.status === "in_progress") await finalize(tx, userId, a);
    });
}
export async function attemptClock(db: Database, userId: string, id: string) {
  return db.transaction(async (tx) => {
    const a = await ownerAttempt(tx, userId, id);
    const now = await serverClock(tx);
    if (a.status === "in_progress" && a.expiresAt && a.expiresAt <= now) {
      await finalize(tx, userId, a);
      return { status: "expired", serverNow: now, expiresAt: a.expiresAt };
    }
    return { status: a.status, serverNow: now, expiresAt: a.expiresAt };
  });
}
export async function deleteAttempt(db: Database, userId: string, id: string) {
  return db.transaction(async (tx) => {
    const a = await ownerAttempt(tx, userId, id);
    if (a.status === "in_progress") fail("Finish this attempt before deleting its record.");
    await tx.delete(attempt).where(and(eq(attempt.id, id), eq(attempt.userId, userId)));
    return { deleted: true };
  });
}
