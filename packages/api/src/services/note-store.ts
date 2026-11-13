import { ORPCError } from "@orpc/server";
import { privateNote, userProfile } from "@sibol-cse/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { Target } from "../library-contracts";
import { fail, missing, type Store, type Tx } from "./learning-shared";
export const noteScope = (userId: string, target: Target) =>
  and(
    eq(privateNote.userId, userId),
    target.kind === "lesson"
      ? eq(privateNote.lessonId, target.id)
      : eq(privateNote.questionId, target.id),
  );
export async function lockPersonalOwner(db: Store, userId: string) {
  const [owner] = await db
    .select({ id: userProfile.userId })
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .for("share");
  if (!owner) return missing();
}
export async function readNote(db: Store, userId: string, target: Target) {
  const [note] = await db.select().from(privateNote).where(noteScope(userId, target));
  return {
    id: note?.id ?? null,
    body: note?.deletedAt ? "" : (note?.body ?? ""),
    revision: note?.revision ?? 0,
  };
}
export async function writeNote(
  tx: Tx,
  userId: string,
  target: Target,
  body: string | null,
  revision: number,
  mutationId: string,
) {
  await lockPersonalOwner(tx, userId);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`notes:${userId}`}))`);
  const [old] = await tx.select().from(privateNote).where(noteScope(userId, target)).for("update");
  const nextBody = body?.trim() ?? "";
  if (nextBody.length > 10000 || /<\/?[a-z!][^>]*>/i.test(nextBody))
    fail("Use plain text, up to 10,000 characters.");
  if (old?.mutationId === mutationId) {
    if (old.body !== nextBody) fail("A note action ID cannot be reused with different content.");
    return { revision: old.revision, deleted: !!old.deletedAt };
  }
  if ((old?.revision ?? 0) !== revision)
    throw new ORPCError("CONFLICT", {
      message: "This note changed in another tab. Reload before saving.",
    });
  if (!old && !nextBody) return { revision: 0, deleted: true };
  if ((!old || old.deletedAt) && nextBody) {
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(privateNote)
      .where(and(eq(privateNote.userId, userId), sql`${privateNote.deletedAt} is null`));
    if ((count?.count ?? 0) >= 1000)
      fail("Keep up to 1,000 active notes. Remove an older note before adding one.");
  }
  const values = {
    body: nextBody,
    revision: revision + 1,
    mutationId,
    deletedAt: nextBody ? null : new Date(),
    updatedAt: new Date(),
  };
  if (old) await tx.update(privateNote).set(values).where(eq(privateNote.id, old.id));
  else
    await tx.insert(privateNote).values({
      userId,
      lessonId: target.kind === "lesson" ? target.id : null,
      questionId: target.kind === "question" ? target.id : null,
      ...values,
    });
  return { revision: values.revision, deleted: !nextBody };
}
export async function writeBookmark(tx: Tx, userId: string, target: Target, saved: boolean) {
  const { bookmark } = await import("@sibol-cse/db/schema");
  await lockPersonalOwner(tx, userId);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bookmarks:${userId}`}))`);
  const scope = and(
    eq(bookmark.userId, userId),
    target.kind === "lesson"
      ? eq(bookmark.lessonId, target.id)
      : eq(bookmark.questionId, target.id),
  );
  if (!saved) {
    await tx.delete(bookmark).where(scope);
    return { saved: false };
  }
  const [old] = await tx.select({ id: bookmark.id }).from(bookmark).where(scope);
  if (!old) {
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(bookmark)
      .where(eq(bookmark.userId, userId));
    if ((count?.n ?? 0) >= 1000)
      fail("Keep up to 1,000 bookmarks. Remove an older item before adding one.");
  }
  await tx
    .insert(bookmark)
    .values({
      userId,
      lessonId: target.kind === "lesson" ? target.id : null,
      questionId: target.kind === "question" ? target.id : null,
    })
    .onConflictDoNothing();
  return { saved: true };
}
