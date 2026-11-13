import type { Database } from "@sibol-cse/db";
import { rateLimit, requestLimit } from "@sibol-cse/db/schema";

// Browser scenarios are independent users of one test origin. Faster CI runners
// must not inherit the previous scenario's anonymous authentication quota.
export async function resetBrowserRateLimits(db: Database) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Rate-limit fixture cleanup requires a dedicated test database");
  await db.delete(rateLimit);
  await db.delete(requestLimit);
}
