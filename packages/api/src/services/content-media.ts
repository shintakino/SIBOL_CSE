import { createHash } from "node:crypto";
import type { Database } from "@sibol-cse/db";
import {
  attempt,
  attemptItem,
  choice,
  contentAsset,
  questionVersion,
  reviewEvent,
  userProfile,
} from "@sibol-cse/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { QuestionMedia } from "../learning-contracts";
import { assertAdmin, fail, missing, type Tx } from "./learning-shared";
import { lockPersonalOwner } from "./note-store";

export const assetInput = z
  .object({
    mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    dataBase64: z
      .string()
      .min(4)
      .max(6990508)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export function assetExtension(bytes: Uint8Array, mime: string): "png" | "jpg" | "webp" | "gif" {
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  const text = (a: number, b: number) => new TextDecoder().decode(bytes.slice(a, b));
  if (mime === "image/png" && bytes.length >= 24 && starts(137, 80, 78, 71, 13, 10, 26, 10))
    return "png";
  if (mime === "image/jpeg" && bytes.length >= 4 && starts(255, 216, 255)) return "jpg";
  if (
    mime === "image/webp" &&
    bytes.length >= 16 &&
    text(0, 4) === "RIFF" &&
    text(8, 12) === "WEBP"
  )
    return "webp";
  if (mime === "image/gif" && bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(text(0, 6)))
    return "gif";
  return fail("Upload a supported raster with matching MIME and file signature.");
}
export async function putContentAsset(
  db: Database,
  actorId: string,
  raw: z.infer<typeof assetInput>,
) {
  const input = assetInput.parse(raw);
  const bytes = Buffer.from(input.dataBase64, "base64");
  if (bytes.length > 5 * 1024 * 1024 || bytes.toString("base64") !== input.dataBase64)
    fail("Image exceeds the size limit or has invalid encoding.");
  const ext = assetExtension(bytes, input.mime);
  const id = createHash("sha256").update(bytes).digest("hex");
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    await tx
      .insert(contentAsset)
      .values({ id, mime: input.mime, data: bytes, createdBy: actorId })
      .onConflictDoNothing();
    const width = ext === "png" ? bytes.readUInt32BE(16) : undefined;
    const height = ext === "png" ? bytes.readUInt32BE(20) : undefined;
    if (width !== undefined && (!width || !height || width > 10000 || height > 10000))
      fail("Image dimensions exceed the supported range.");
    return {
      id,
      src: `/api/content-media/${id}.${ext}`,
      width,
      height,
      archivalOnly: ext === "gif",
    };
  });
}
export async function validateMediaReferences(tx: Tx, media: (QuestionMedia | null | undefined)[]) {
  for (const image of media) {
    if (!image?.src.startsWith("/api/content-media/")) continue;
    const [id, ext] = image.src.slice("/api/content-media/".length).split(".");
    const [asset] = await tx
      .select({ mime: contentAsset.mime })
      .from(contentAsset)
      .where(eq(contentAsset.id, id ?? ""));
    if (
      !asset ||
      ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[
        asset.mime
      ] !== ext
    )
      fail("Register the referenced question image before creating its draft.");
  }
}
export function assertMediaReviewed(media: (QuestionMedia | null | undefined)[]) {
  if (
    media.some(
      (image) =>
        image &&
        (image.descriptionReviewed === false ||
          (image.src.startsWith("/api/content-media/") && image.descriptionReviewed !== true)),
    )
  )
    fail("Review and describe every question/choice image before approving accessibility.");
}
export async function readContentAsset(db: Database, userId: string, filename: string) {
  const parsed = /^([a-f0-9]{64})\.(png|jpg|webp|gif)$/.exec(filename);
  if (!parsed?.[1]) return missing();
  const id = parsed[1];
  const src = `/api/content-media/${filename}`;
  return db.transaction(async (tx) => {
    await lockPersonalOwner(tx, userId);
    const [profile] = await tx
      .select({ role: userProfile.role })
      .from(userProfile)
      .where(eq(userProfile.userId, userId));
    if (!profile) return missing();
    if (profile.role !== "admin") {
      const reference = or(
        sql`${questionVersion.media}->>'src' = ${src}`,
        sql`exists (select 1 from ${choice} where ${choice.questionVersionId} = ${questionVersion.id} and ${choice.media}->>'src' = ${src})`,
      );
      const [owned] = await tx
        .select({ id: attemptItem.id })
        .from(attemptItem)
        .innerJoin(attempt, eq(attempt.id, attemptItem.attemptId))
        .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
        .where(and(eq(attempt.userId, userId), reference))
        .limit(1);
      if (!owned) {
        const [reviewed] = await tx
          .select({ id: reviewEvent.id })
          .from(reviewEvent)
          .innerJoin(questionVersion, eq(questionVersion.id, reviewEvent.versionId))
          .where(and(eq(reviewEvent.userId, userId), reference))
          .limit(1);
        if (!reviewed) return missing();
      }
    }
    const [asset] = await tx.select().from(contentAsset).where(eq(contentAsset.id, id));
    if (!asset || assetExtension(asset.data, asset.mime) !== parsed[2]) return missing();
    return {
      mime: asset.mime,
      bytes: new Uint8Array(asset.data),
      archivalOnly: asset.mime === "image/gif",
    };
  });
}
