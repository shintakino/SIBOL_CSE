import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { buildForms } from "@sibol-cse/api/services/catalog";
import { createDb } from "@sibol-cse/db";
import {
  account,
  attempt,
  attemptItem,
  attemptResult,
  mockBlueprintVersion,
  questionVersion,
  reviewState,
  studyPreferences,
  user,
  userProfile,
} from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { seedLearning } from "../fixtures/learning";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Dedicated *_test database required");
const db = createDb({ DATABASE_URL: url });
const stamp = crypto.randomUUID().slice(0, 8),
  email = `loop-${stamp}@example.test`,
  password = "loop-browser-passphrase";
let learnerId = "",
  adminId = "",
  profileId = "";
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  test.setTimeout(60000);
  await migrate(db, { migrationsFolder: "packages/db/src/migrations" });
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public'",
  );
  for (const { tablename } of tables.rows)
    await db.execute(sql.raw(`TRUNCATE TABLE "${tablename.replaceAll('"', '""')}" CASCADE`));
  for (const role of ["admin", "learner"] as const) {
    const id = crypto.randomUUID();
    await db.insert(user).values({
      id,
      name: "Growing learner",
      email: role === "learner" ? email : `admin-${stamp}@example.test`,
      emailVerified: true,
    });
    await db.insert(account).values({
      id: crypto.randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: await hashPassword(password),
      updatedAt: new Date(),
    });
    await db
      .insert(userProfile)
      .values({ userId: id, role, onboardedAt: new Date(), diagnosticDecision: "skipped" });
    await db
      .insert(studyPreferences)
      .values({ userId: id, level: "professional", days: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 25 });
    if (role === "learner") learnerId = id;
    else adminId = id;
  }
  const fixture = await seedLearning(db, adminId);
  profileId = fixture.profileId;
});
test.afterAll(async () => {
  await db.$client.end();
});
async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}
async function scan(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("mobile dashboard and weekly plan preserve completed work and personal dedication", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);
  await expect(
    page.getByText("Insufficient evidence to name a weak topic.", { exact: false }),
  ).toBeVisible();
  await page.getByText("Your optional personal dedication", { exact: true }).click();
  await page.getByLabel("A reminder you choose (optional)").fill("A calm step for my future self.");
  await page.getByRole("button", { name: "Save personal dedication" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Personal dedication saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("paragraph").filter({ hasText: /^A calm step for my future self\.$/ }),
  ).toBeVisible();
  await scan(page);
  await page.getByRole("link", { name: "Open weekly plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your weekly study plan" })).toBeVisible();
  const today = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /^Today ·/ }) });
  await today.getByRole("button", { name: "Mark task complete", exact: true }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Task marked complete" })).toBeVisible();
  await page.getByRole("button", { name: "Rebuild this week", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Plan rebuilt" })).toBeVisible();
  await expect(today.getByRole("button", { name: "Completed", exact: true })).toHaveCount(1);
  await scan(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/loop-mobile-plan.png", fullPage: false });
});

test("practice mistakes lead to a scheduled review without erasing history", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);
  await page.goto("/practice?topic=numerical-arithmetic");
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page).toHaveURL(/\/attempts\//);
  await page.getByRole("radio", { name: "3", exact: true }).check();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.getByRole("button", { name: "Commit answer and see explanation" }).click();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
  await page.getByRole("button", { name: /^Question 5, unanswered/ }).click();
  await page.getByRole("button", { name: "Finish set", exact: true }).click();
  await page.getByRole("button", { name: "Submit saved answers" }).click();
  await expect(page).toHaveURL(/\/results$/);
  await db
    .update(reviewState)
    .set({ dueAt: sql`now()-interval '1 day'`, lastReviewedOn: null })
    .where(eq(reviewState.userId, learnerId));
  await page.getByRole("link", { name: "Revisit mistakes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "5 reviews due", exact: true })).toBeVisible();
  await scan(page);
  await page.getByRole("button", { name: "Start due review", exact: true }).click();
  await expect(page.getByText("Scheduled review", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "4", exact: true }).check();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.getByRole("button", { name: "Commit answer and see explanation" }).click();
  await expect(page.getByText("Correct reasoning", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
  await page.getByRole("button", { name: /^Question 5, unanswered/ }).click();
  await page.getByRole("button", { name: "Finish set", exact: true }).click();
  await page.getByRole("button", { name: "Submit saved answers" }).click();
  await expect(page).toHaveURL(/\/results$/);
  await page.goto("/review");
  await expect(page.getByText("Your learning history, by concept", { exact: true })).toBeVisible();
  await expect(
    page
      .locator("summary")
      .filter({ hasText: /incorrect/i })
      .first(),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /incorrect/i })
    .first()
    .click();
  await page.getByRole("button", { name: "Review again tomorrow", exact: true }).first().click();
  await expect(
    page.getByRole("status").filter({ hasText: "Scheduled for tomorrow" }),
  ).toBeVisible();
  await scan(page);
});

test("strict timed set restores acknowledged answers and ignores device-clock changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);
  await page.goto("/mock-exams");
  await page.getByRole("button", { name: "Start strict timed set", exact: true }).click();
  await expect(page).toHaveURL(/\/attempts\//);
  const id = page.url().split("/").at(-1) ?? "";
  const [original] = await db.select().from(attempt).where(eq(attempt.id, id));
  expect(original?.expiresAt).not.toBeNull();
  await expect(page.getByRole("timer")).not.toContainText("Synchronizing");
  await page.getByRole("radio", { name: "4", exact: true }).check();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: "4", exact: true })).toBeChecked();
  await expect(page.getByRole("region", { name: "Answer explanation" })).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Commit answer and see explanation" }),
  ).not.toBeVisible();
  await expect(page.getByLabel("Private note", { exact: true })).not.toBeVisible();
  await page.clock.setFixedTime(new Date("2036-01-01T00:00:00Z"));
  await expect(page.getByRole("timer")).not.toContainText("0:00");
  await page.reload();
  await expect(page.getByRole("radio", { name: "4", exact: true })).toBeChecked();
  const [restored] = await db.select().from(attempt).where(eq(attempt.id, id));
  expect(restored?.expiresAt).toEqual(original?.expiresAt);
  await page.route("**/api/rpc/attempts/saveAnswer", (route) => route.abort());
  await page.getByRole("radio", { name: "3", exact: true }).check();
  await expect(page.getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
  await page.unroute("**/api/rpc/attempts/saveAnswer");
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.getByRole("button", { name: "Flag for review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Flagged", exact: true })).toBeVisible();
  await scan(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/loop-mobile-timer.png", fullPage: false });
  await page.getByRole("button", { name: /^Question 10, unanswered/ }).click();
  await page.getByRole("button", { name: "Finish set", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("9 questions have no saved answer");
  await page.getByRole("button", { name: "Submit saved answers" }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByText("10 presented · 1 attempted", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "View learning progress", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Strict short timed sets", exact: true }),
  ).toBeVisible();
  await scan(page);
});

test("expiry automatically restores one server-scored result", async ({ page }) => {
  await signIn(page);
  const [q] = await db
    .select()
    .from(questionVersion)
    .where(eq(questionVersion.status, "published"))
    .limit(1);
  if (!q) throw new Error("Missing version");
  const [a] = await db
    .insert(attempt)
    .values({
      userId: learnerId,
      mode: "strict_mock",
      setKind: "short",
      profileVersionId: profileId,
      expiresAt: new Date(Date.now() + 12000),
    })
    .returning();
  if (!a) throw new Error("Missing timed fixture");
  await db.insert(attemptItem).values({
    attemptId: a.id,
    position: 0,
    questionVersionId: q.id,
    choiceOrder: ["a", "b", "c"],
  });
  await page.goto(`/attempts/${a.id}`);
  await page.getByRole("radio", { name: "4", exact: true }).check();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page).toHaveURL(/\/results$/, { timeout: 25000 });
  await expect(
    page.getByText("Time expired; only acknowledged pre-deadline answers were scored.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await db.select().from(attemptResult).where(eq(attemptResult.attemptId, a.id)),
  ).toHaveLength(1);
  await scan(page);
});

test("full mock covers 150 pinned questions and deletion recalculates its separate trend", async ({
  page,
}) => {
  const topics = (
    await db
      .select()
      .from(questionVersion)
      .where(
        and(eq(questionVersion.status, "published"), eq(questionVersion.level, "professional")),
      )
  ).map((q) => q.primaryTopicId);
  const unique = [...new Set(topics)];
  const [b] = await db
    .insert(mockBlueprintVersion)
    .values({
      profileVersionId: profileId,
      version: 1,
      quotas: Object.fromEntries(
        unique.map((id, i) => [
          id,
          Math.floor(150 / unique.length) + (i < 150 % unique.length ? 1 : 0),
        ]),
      ),
      durationMinutes: 190,
      published: true,
    })
    .returning();
  if (!b) throw new Error("Missing blueprint");
  await buildForms(db, adminId, b.id);
  await signIn(page);
  await page.goto("/mock-exams");
  await page.getByLabel("Timed set type").click();
  await page.getByRole("option", { name: "Full strict mock", exact: true }).click();
  await page.getByRole("button", { name: "Start full strict mock", exact: true }).click();
  await expect(page).toHaveURL(/\/attempts\//);
  await expect(page.getByRole("paragraph").filter({ hasText: /^Full strict mock$/ })).toBeVisible();
  await page.getByRole("button", { name: /^Question 150, unanswered/ }).click();
  await page.getByRole("button", { name: "Finish set", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("150 questions have no saved answer");
  await page.getByRole("button", { name: "Submit saved answers" }).click();
  await expect(page.getByText("150 presented · 0 attempted", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Delete this attempt", exact: true }).click();
  await page.getByRole("button", { name: "Confirm attempt deletion", exact: true }).click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(page.getByRole("heading", { name: "Full mock trend", exact: true })).toBeVisible();
  await scan(page);
});
