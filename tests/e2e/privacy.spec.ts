import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createDb } from "@sibol-cse/db";
import {
  account,
  lesson,
  privateNote,
  studyPreferences,
  user,
  userProfile,
} from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resetBrowserRateLimits } from "../fixtures/browser-limits";
import { seedLearning } from "../fixtures/learning";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Dedicated test database required");
const db = createDb({ DATABASE_URL: url });
const email = `privacy-${crypto.randomUUID()}@example.test`,
  password = "privacy-browser-passphrase";
let learnerId = "",
  slug = "";
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  await resetBrowserRateLimits(db);
});

test.beforeAll(async () => {
  await migrate(db, { migrationsFolder: "packages/db/src/migrations" });
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public'",
  );
  for (const { tablename } of tables.rows)
    await db.execute(sql.raw(`TRUNCATE TABLE "${tablename.replaceAll('"', '""')}" CASCADE`));
  const admin = crypto.randomUUID();
  for (const [id, role] of [
    [admin, "admin"],
    [crypto.randomUUID(), "learner"],
  ] as const) {
    await db.insert(user).values({
      id,
      name: "Private learner",
      email: role === "learner" ? email : `${id}@example.test`,
      emailVerified: true,
    });
    await db
      .insert(userProfile)
      .values({ userId: id, role, onboardedAt: new Date(), diagnosticDecision: "skipped" });
    await db.insert(account).values({
      id: crypto.randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: await hashPassword(password),
    });
    await db
      .insert(studyPreferences)
      .values({ userId: id, level: "professional", days: [1, 3, 5], dailyMinutes: 25 });
    if (role === "learner") learnerId = id;
  }
  await seedLearning(db, admin);
  const [l] = await db.select().from(lesson).limit(1);
  if (!l) throw new Error("Missing fixture lesson");
  slug = l.slug;
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
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test("mobile lesson bookmarks, private note editing and permitted search survive reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);
  await page.goto(`/learn/${slug}`);
  await page.getByRole("button", { name: "Bookmark this item", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bookmarked", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Private note", exact: true }).click();
  await page.getByLabel("Note text").fill("Tandaan: one calm step at a time.");
  await page.getByRole("button", { name: "Save private note", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Private note saved." })).toBeVisible();
  await scan(page);
  await page.keyboard.press("Escape");
  await page.goto("/bookmarks");
  await expect(page.getByRole("link", { name: "Read lesson", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Private notes", exact: true }).click();
  await expect(page.getByText("Tandaan: one calm step at a time.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Search reviewed material", exact: true }).click();
  await page.getByLabel("Keyword", { exact: true }).fill("worked example");
  await page.getByRole("checkbox", { name: "Only bookmarked material", exact: true }).check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("link", { name: "Read lesson", exact: true })).toHaveCount(1);
  await scan(page);
  await page.screenshot({ path: "test-results/privacy-mobile-library.png", fullPage: true });
  await page.getByRole("button", { name: "Private note", exact: true }).click();
  await expect(page.getByLabel("Note text")).toHaveValue("Tandaan: one calm step at a time.");
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await page.getByRole("button", { name: "Confirm note deletion", exact: true }).click();
  await expect(page.getByLabel("Note text")).toHaveValue("");
  expect(
    (await db.select().from(privateNote).where(eq(privateNote.userId, learnerId)))[0]?.body,
  ).toBe("");
});
test("account settings persist, safe JSON downloads and confirmed deletion ends access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/settings");
  await page.getByLabel("Theme", { exact: true }).click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
  await page.getByLabel("Motion preference").click();
  await page.getByRole("option", { name: "Reduce motion", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Show in-app due-review reminders", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Save my interest in future email reminders", exact: true })
    .check();
  await page.getByRole("button", { name: "Save appearance & reminders" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Appearance and reminder preferences saved." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(
    page.getByRole("checkbox", { name: "Show in-app due-review reminders", exact: true }),
  ).not.toBeChecked();
  await scan(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my data", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Missing export");
  const text = await (await import("node:fs/promises")).readFile(path, "utf8");
  expect(JSON.parse(text).identity.email).toBe(email);
  for (const field of ["password", "token", "answerChoiceId", "explanation", "prompt"])
    expect(text).not.toContain(`"${field}":`);
  await page.getByRole("button", { name: "Delete my account", exact: true }).click();
  await scan(page);
  await page.getByLabel("Current password", { exact: true }).fill("incorrect-passphrase");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Permanently delete my account", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /password/i })).toBeVisible();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Permanently delete my account", exact: true }).click();
  await expect(page).toHaveURL(/account-deleted\?receipt=/);
  await expect(
    page.getByRole("heading", { name: "Your live study data has been removed." }),
  ).toBeVisible();
  await page.goto("/bookmarks");
  await expect(page).toHaveURL(/sign-in/);
  expect(await db.select().from(userProfile).where(eq(userProfile.userId, learnerId))).toHaveLength(
    0,
  );
});
