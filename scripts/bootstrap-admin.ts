import { createDb } from "@sibol-cse/db";
import { account, auditEvent, user, userProfile } from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const email = z.email().parse(process.argv[2]?.trim().toLowerCase());
const name = z.string().min(1).max(100).parse(process.argv[3]);
const password = z
  .string()
  .min(12)
  .max(128)
  .parse((await Bun.stdin.text()).replace(/\r?\n$/, ""));
const db = createDb({ DATABASE_URL: z.url().parse(process.env.DATABASE_URL) });
try {
  const hashed = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(741920)`);
    const admins = await tx.select().from(userProfile).where(eq(userProfile.role, "admin"));
    if (admins.length)
      throw new Error("An administrator already exists. Use the audited role-management flow.");
    const userId = crypto.randomUUID();
    await tx.insert(user).values({ id: userId, email, name, emailVerified: true });
    await tx.insert(account).values({
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: hashed,
      updatedAt: new Date(),
    });
    await tx.insert(userProfile).values({ userId, role: "admin" });
    await tx
      .insert(auditEvent)
      .values({ actorId: userId, action: "admin.bootstrapped", targetId: userId });
  });
  console.log("Administrator created. Sign in to choose your study preferences.");
} finally {
  await db.$client.end();
}
