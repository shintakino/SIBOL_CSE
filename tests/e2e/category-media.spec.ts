import AxeBuilder from "@axe-core/playwright";
import { createRouterClient } from "@orpc/server";
import { expect, type Page, test } from "@playwright/test";
import type { Context } from "@sibol-cse/api/context";
import { questionInput } from "@sibol-cse/api/learning-contracts";
import { appRouter } from "@sibol-cse/api/routers/index";
import { createDb } from "@sibol-cse/db";
import { account, studyPreferences, topic, user, userProfile } from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resetBrowserRateLimits } from "../fixtures/browser-limits";
import { checklist, questionDraft, seedLearning } from "../fixtures/learning";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A dedicated TEST_DATABASE_URL is required.");
const db = createDb({ DATABASE_URL: url });
const stamp = crypto.randomUUID().slice(0, 8),
  password = "category-media-fixture-passphrase";
const adminId = crypto.randomUUID(),
  learnerId = crypto.randomUUID();
const adminEmail = `media-admin-${stamp}@example.test`,
  learnerEmail = `media-learner-${stamp}@example.test`;
let assetUrl = "";
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
  for (const [id, email, role] of [
    [adminId, adminEmail, "admin"],
    [learnerId, learnerEmail, "learner"],
  ] as const) {
    await db.insert(user).values({ id, email, name: role, emailVerified: true });
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
  }
  await seedLearning(db, adminId, 6);
  await db.insert(topic).values([
    {
      id: "browser-image-topic",
      slug: "browser-image-topic",
      title: "Image-choice fixtures",
      area: "verbal",
      levels: ["professional"],
    },
    {
      id: "browser-order-topic",
      slug: "browser-order-topic",
      title: "Ordering fixtures",
      area: "verbal",
      levels: ["professional"],
    },
  ]);
  const now = new Date();
  const context: Context = {
    db,
    sendInvitation: async () => {},
    session: {
      user: {
        id: adminId,
        email: adminEmail,
        name: "admin",
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
      },
      session: {
        id: crypto.randomUUID(),
        token: "fixture-only",
        userId: adminId,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(Date.now() + 3600000),
        ipAddress: null,
        userAgent: null,
      },
    },
  };
  const admin = createRouterClient(appRouter, { context });
  const asset = await admin.content.putAsset({
    mime: "image/png",
    dataBase64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF8cAAAAASUVORK5CYII=",
  });
  assetUrl = asset.src;
  const media = {
    src: asset.src,
    alt: "Original software-test image swatch.",
    descriptionReviewed: true,
  };
  for (let i = 0; i < 5; i++)
    for (const kind of ["image", "order"] as const) {
      const input =
        kind === "image"
          ? questionInput.parse({
              ...questionDraft(`browser-image-${i}`, "browser-image-topic"),
              media,
              choices: [
                { id: "a", text: "First description", media },
                { id: "b", text: "Second description", media },
              ],
              answerChoiceId: "b",
            })
          : questionInput.parse({
              ...questionDraft(`browser-order-${i}`, "browser-order-topic"),
              kind: "order",
              instruction: "Arrange a coherent paragraph.",
              choices: [],
              answerChoiceId: null,
              orderItems: [
                { id: "a", text: "First, begin." },
                { id: "b", text: "Then, continue." },
                { id: "c", text: "Finally, finish." },
              ],
              answerOrder: ["a", "b", "c"],
            });
      const draft = await admin.content.createQuestion({ question: input });
      await admin.content.review({ kind: "question", versionId: draft.id, checklist });
      await admin.content.publish({ kind: "question", versionId: draft.id });
    }
});
test.afterAll(async () => {
  await db.$client.end();
});
async function signIn(page: Page, email = learnerEmail) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}
async function topicChoice(page: Page, label: string) {
  await page.getByRole("combobox", { name: "Topic", exact: true }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
async function scan(page: Page) {
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
test("mobile category cards expose track-scoped topics and published coverage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);
  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: "Study by category" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Numerical Ability", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clerical Ability", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Arithmetic/ }).click();
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toContainText(
    "Numerical Ability",
  );
  await expect(page.getByRole("combobox", { name: "Topic", exact: true })).toContainText(
    "Arithmetic",
  );
  await scan(page);
  await page.screenshot({
    path: ".cache/verification/category-browser-mobile.png",
    fullPage: true,
  });
});
test("private question and choice images render, zoom restores focus and saved choices survive refresh", async ({
  page,
  playwright,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  expect((await page.request.get(assetUrl)).status()).toBe(404);
  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3101" });
  expect((await anonymous.get(assetUrl)).status()).toBe(401);
  await anonymous.dispose();
  await page.goto("/practice");
  await topicChoice(page, "Image-choice fixtures");
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page).toHaveURL(/attempts/);
  const images = page.locator('img[src*="/api/content-media/"]');
  await expect(images.first()).toBeVisible();
  await expect
    .poll(() =>
      images.evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  const zoom = page.getByRole("button", { name: "Enlarge image", exact: true });
  await zoom.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(zoom).toBeFocused();
  await page.getByRole("radio", { name: /Second description/ }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: /Second description/ })).toBeChecked();
  await page
    .getByRole("button", { name: "Commit answer and see explanation", exact: true })
    .click();
  await expect(page.getByText("Correct reasoning", { exact: true })).toBeVisible();
  await scan(page);
  await page.screenshot({
    path: ".cache/verification/image-choice-player-mobile.png",
    fullPage: true,
  });
});
test("keyboard ordering saves the whole sequence and results show the original ordered key", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/practice");
  await topicChoice(page, "Ordering fixtures");
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page).toHaveURL(/attempts/);
  const region = page.getByRole("region", { name: "Arrange your answer" });
  await expect(region).toBeVisible();
  const desired = ["First, begin.", "Then, continue.", "Finally, finish."];
  for (let target = 0; target < desired.length; target++) {
    let positions = await region.locator("li p").allTextContents();
    let current = positions.indexOf(desired[target] ?? "");
    while (current > target) {
      const button = region.getByRole("button", {
        name: `Move item ${current + 1} up`,
        exact: true,
      });
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      positions = await region.locator("li p").allTextContents();
      current = positions.indexOf(desired[target] ?? "");
    }
  }
  const keep = page.getByRole("button", { name: "Save this order", exact: true });
  if (await keep.isVisible()) {
    await keep.click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(region.locator("li p")).toHaveText(desired);
  await page
    .getByRole("button", { name: "Commit answer and see explanation", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Correct order", exact: true })).toBeVisible();
  await scan(page);
  await page.getByRole("button", { name: "Question 5, unanswered", exact: true }).click();
  await page.getByRole("button", { name: "Finish set", exact: true }).click();
  await page.getByRole("button", { name: "Submit saved answers", exact: true }).click();
  await expect(page).toHaveURL(/results/);
  await expect(
    page.getByRole("heading", { name: "Review your reasoning", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Original key: First, begin. → Then, continue. → Finally, finish.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
});
