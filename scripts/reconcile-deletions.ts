import { purgePersonalData } from "@sibol-cse/api/services/account-data";
import { createDb } from "@sibol-cse/db";
import { session, verification } from "@sibol-cse/db/schema";
import { z } from "zod";

const target = z
  .string()
  .regex(/^[a-zA-Z0-9_]+_restore$/)
  .parse(process.env.RESTORE_DATABASE);
const url = new URL(
  `postgresql://${process.env.PGHOST ?? "postgres"}:${process.env.PGPORT ?? "5432"}/${target}`,
);
url.username = process.env.PGUSER ?? "sibol";
url.password = z.string().min(1).parse(process.env.PGPASSWORD);
const receipts = z
  .array(
    z
      .object({
        userId: z.string().min(1).max(100),
        receiptId: z.uuid(),
        deletedAt: z.coerce.date(),
      })
      .strict(),
  )
  .parse(JSON.parse(await Bun.stdin.text()));
const db = createDb({ DATABASE_URL: url.toString() });
try {
  await db.transaction(async (tx) => {
    for (const r of receipts) await purgePersonalData(tx, r.userId, r.receiptId, r.deletedAt);
    await tx.delete(session);
    await tx.delete(verification);
  });
  console.log(
    JSON.stringify({
      event: "offline_deletions_reconciled",
      receipts: receipts.length,
      sessionsRevoked: true,
      resetTokensRevoked: true,
    }),
  );
} finally {
  await db.$client.end();
}
