import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createDb } from "@sibol-cse/db";
import { account, studyPreferences, user, userProfile } from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resetBrowserRateLimits } from "../fixtures/browser-limits";
import { questionDraft, seedLearning } from "../fixtures/learning";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A dedicated test database is required.");
const db = createDb({ DATABASE_URL: url });
const stamp = crypto.randomUUID().slice(0, 8),
  password = "learning-browser-passphrase";
const adminEmail = `content-admin-${stamp}@example.test`,
  learnerEmail = `content-learner-${stamp}@example.test`,
  diagnosticEmail = `diagnostic-${stamp}@example.test`;
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  await resetBrowserRateLimits(db);
});

test.beforeAll(async () => {
  test.setTimeout(60000);
  await migrate(db, { migrationsFolder: "packages/db/src/migrations" });
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public'",
  );
  for (const { tablename } of tables.rows)
    await db.execute(sql.raw(`TRUNCATE TABLE "${tablename.replaceAll('"', '""')}" CASCADE`));
  let adminId = "";
  for (const [email, role] of [
    [adminEmail, "admin"],
    [learnerEmail, "learner"],
    [diagnosticEmail, "learner"],
  ] as const) {
    const id = crypto.randomUUID();
    await db.insert(user).values({
      id,
      email,
      name: role === "admin" ? "Content editor" : "Growing learner",
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
    await db.insert(userProfile).values({ userId: id, role, onboardedAt: new Date() });
    await db
      .insert(studyPreferences)
      .values({ userId: id, level: "professional", days: [1, 3, 5], dailyMinutes: 25 });
    if (role === "admin") adminId = id;
  }
  await seedLearning(db, adminId, 20);
});
test.afterAll(async () => {
  await db.$client.end();
});
async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}
async function scan(page: Page) {
  await expect(page).toHaveTitle(/Sibol/);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
async function reviewAndPublish(page: Page, externalId: string) {
  const card = page.locator('[data-slot="card"]').filter({ hasText: externalId });
  await card.getByRole("button", { name: "Review checklist", exact: true }).click();
  for (const checkbox of await page.getByRole("dialog").getByRole("checkbox").all())
    await checkbox.check();
  await page.getByRole("button", { name: "Confirm editorial decision" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await card.getByRole("button", { name: "Publish version", exact: true }).click();
  await page.getByRole("button", { name: "Confirm editorial decision" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(card.getByText("published", { exact: true })).toBeVisible();
}

test("administrator authors, reviews, publishes and imports without silently publishing", async ({
  page,
}) => {
  await signIn(page, adminEmail);
  await page.goto("/admin/content");
  const externalId = `browser-original-${stamp}`;
  await page.getByLabel("Stable external ID").fill(externalId);
  await page.getByLabel("Primary scoring topic").click();
  await page.getByRole("option", { name: "Arithmetic", exact: true }).click();
  await page
    .getByLabel("Question prompt", { exact: true })
    .fill("An original browser workflow question: what is 2 + 2?");
  await page.getByLabel("Choice a", { exact: true }).fill("3");
  await page.getByLabel("Choice b", { exact: true }).fill("4");
  await page.getByLabel("Correct answer", { exact: true }).click();
  await page.getByRole("option", { name: "Choice b: 4", exact: true }).click();
  await page.getByLabel("Reviewed answer explanation").fill("Adding two and two gives four.");
  await page.getByLabel("Source title", { exact: true }).fill("Original browser fixture");
  await page.getByLabel("Author / rights holder").fill("Sibol test author");
  await page
    .getByLabel("Authorship or permission statement")
    .fill("Original synthetic test content, not a released learning item.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  await reviewAndPublish(page, externalId);
  await scan(page);
  await page.goto("/admin/imports");
  const draft = questionDraft(`browser-import-${stamp}`);
  await page
    .getByLabel("Import contents")
    .fill(JSON.stringify([{ ...draft, answerChoiceId: "missing" }]));
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(page.getByText("Row 1:", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Commit validated drafts" })).toBeDisabled();
  await page.getByLabel("Import contents").fill(JSON.stringify([draft]));
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(page.getByRole("heading", { name: "Ready to create drafts" })).toBeVisible();
  await page.getByRole("button", { name: "Commit validated drafts" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Drafts created" })).toBeVisible();
  await scan(page);
  await page.goto("/admin/profiles");
  await page.getByRole("button", { name: "Check inventory", exact: true }).click();
  await expect(page.getByText("Launch blocked by inventory", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm content launch readiness" }),
  ).toBeDisabled();
});

test("mobile learner resumes a lesson, recovers a failed save, commits, takes notes and submits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, learnerEmail);
  await page.goto("/learn");
  await page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Arithmetic: a worked example" })
    .getByRole("link", { name: "Read lesson" })
    .click();
  await expect(page.getByRole("heading", { name: "Worked example", exact: true })).toBeVisible();
  await page.getByLabel("Remember my place").click();
  await page.getByRole("option", { name: "Worked example", exact: true }).click();
  await page.getByRole("button", { name: "Save reading place" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reading place saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Remember my place")).toContainText("Worked example");
  await scan(page);
  await page.getByRole("button", { name: "Mark reading complete" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reading completed" })).toBeVisible();
  await page.getByRole("link", { name: "Practice this topic" }).click();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page).toHaveURL(/\/attempts\//);
  await page.getByRole("radio", { name: "4", exact: true }).check();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Answer explanation" })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: "4", exact: true })).toBeChecked();
  await page.route("**/api/rpc/attempts/saveAnswer", (route) => route.abort());
  await page.getByRole("radio", { name: "3", exact: true }).check();
  await expect(page.getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Commit answer and see explanation" }),
  ).toBeDisabled();
  await page.unroute("**/api/rpc/attempts/saveAnswer");
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.getByRole("button", { name: "Commit answer and see explanation" }).click();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
  await expect(page.getByText("Two plus two equals four.", { exact: true })).toBeVisible();
  await page.getByLabel("Private note", { exact: true }).fill("My private browser note.");
  await page.getByRole("button", { name: "Save private note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Private note saved" })).toBeVisible();
  await page.getByRole("button", { name: "Bookmark question", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bookmarked", exact: true })).toBeVisible();
  await page.getByText("Report an issue", { exact: true }).click();
  await page.getByLabel("What needs a second look?").fill("Browser report for editorial review.");
  await page.getByRole("button", { name: "Send issue report" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Issue reported" })).toBeVisible();
  await scan(page);
  await page.screenshot({ path: "test-results/learning-mobile-player.png", fullPage: true });
  await page.getByRole("button", { name: /^Question 5, unanswered/ }).click();
  await page.getByRole("button", { name: "Finish set", exact: true }).click();
  await page.getByRole("button", { name: "Submit saved answers" }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByRole("heading", { name: "What this set shows" })).toBeVisible();
  await expect(page.getByText("5 presented · 1 attempted", { exact: false })).toBeVisible();
  await scan(page);
});

test("diagnostic can be skipped, then completed with feedback withheld until submission", async ({
  page,
}) => {
  await signIn(page, diagnosticEmail);
  await page.getByRole("link", { name: "Take or skip a diagnostic", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByText("Insufficient evidence: a diagnostic has not been completed.", { exact: false }),
  ).toBeVisible();
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: "Start diagnostic", exact: true }).click();
  await expect(page).toHaveURL(/\/attempts\//);
  await page.getByRole("radio", { name: "4", exact: true }).check();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Answer explanation" })).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Commit answer and see explanation" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: /^Question 30, unanswered/ }).click();
  await page.getByRole("button", { name: "Finish set", exact: true }).click();
  await page.getByRole("button", { name: "Submit saved answers" }).click();
  await expect(page.getByRole("heading", { name: "Your diagnostic starting point" })).toBeVisible();
  await expect(page.getByText("30 presented · 1 attempted", { exact: false })).toBeVisible();
  await expect(
    page
      .getByText("Needs more evidence: fewer than 10 first-exposure answers.", { exact: true })
      .first(),
  ).toBeVisible();
  await scan(page);
});

test("editor resolves an issue through quarantine without seeing learner notes or answers", async ({
  page,
}) => {
  await signIn(page, adminEmail);
  await page.goto("/admin/reports");
  await expect(
    page.getByText("Browser report for editorial review.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("My private browser note.", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Review issue", exact: true }).click();
  await page
    .getByLabel("Resolution or quarantine reason")
    .fill("Quarantined pending a second editorial check.");
  await page.getByRole("checkbox", { name: "Quarantine the question", exact: true }).check();
  await page.getByRole("button", { name: "Save issue decision" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("quarantined · Question version", { exact: false })).toBeVisible();
  await scan(page);
});
