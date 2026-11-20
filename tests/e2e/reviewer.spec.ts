import AxeBuilder from "@axe-core/playwright";
import { createRouterClient } from "@orpc/server";
import { expect, type Page, test } from "@playwright/test";
import type { Context } from "@sibol-cse/api/context";
import { questionInput } from "@sibol-cse/api/learning-contracts";
import { appRouter } from "@sibol-cse/api/routers/index";
import { createDb } from "@sibol-cse/db";
import {
  account,
  attempt,
  attemptItem,
  attemptResult,
  examProfileVersion,
  questionVersion,
  studyPreferences,
  topic,
  user,
  userProfile,
} from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
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
test.use({ reducedMotion: "reduce" });
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
async function scan(page: Page) {
  await expect(page.getByRole("button", { name: "Toggle light and dark theme" })).toBeEnabled();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
async function finish(page: Page, count: number) {
  await page.getByRole("button", { name: new RegExp(`^Question ${count},`) }).click();
  await page.getByRole("button", { name: "Finish & Submit ➔", exact: true }).click();
  await page.getByRole("button", { name: "Submit quiz", exact: true }).click();
  await expect(page).toHaveURL(/results/);
}
async function openTopic(page: Page, label: string) {
  await page.goto("/practice");
  await page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Verbal Ability" }) })
    .locator("summary")
    .click();
  await page.getByRole("button", { name: `Practice ${label}`, exact: true }).click();
  await expect(page).toHaveURL(/attempts/);
}
test("replica dashboard, six reference tabs, flashcards and cheatsheet replace the retired tools", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Start Today's Quiz (25 Qs)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Launch Simulator (50 Qs)", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Weekly tasks completed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Study plan & preferences", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link"),
  ).toHaveText([
    "🏠Dashboard",
    "⏱️Mock Simulation",
    "📂Topic Drills",
    "🗂️Flashcards",
    "📖Study Cheatsheet",
    "📊Analytics & History",
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await scan(page);
  await page.screenshot({
    path: ".cache/verification/replica-dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await scan(page);
  await page.screenshot({
    path: ".cache/verification/replica-dashboard-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Flashcards", exact: false })
    .click();
  await expect(page.getByRole("heading", { name: "Key Terms & Concept Flashcards" })).toBeVisible();
  await page.getByRole("button", { name: "Flip to reveal definition", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Flip back to concept", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next ➡️", exact: true }).click();
  await expect(page.getByText(/^Card 2 of/)).toBeVisible();
  await scan(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Study Cheatsheet", exact: false })
    .click();
  await expect(page.getByRole("heading", { name: "Core CSE Concepts & Formulas" })).toBeVisible();
  await expect(page.getByText("Simple interest", { exact: true })).toBeVisible();
  await scan(page);
  for (const route of ["/plan", "/diagnostic", "/learn", "/design-system"]) {
    await page.goto(route);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  }
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Toggle light and dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedDuration = await page.locator(".cmms-app").evaluate((element) =>
    Math.max(
      ...getComputedStyle(element)
        .transitionDuration.split(",")
        .map((value) => Number.parseFloat(value)),
    ),
  );
  expect(reducedDuration).toBeLessThanOrEqual(0.001);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await scan(page);
  await page.screenshot({
    path: ".cache/verification/replica-dashboard-dark-large-text.png",
    fullPage: true,
  });
});
test("question and choice images zoom, immediate explanations, bookmark and flags persist", async ({
  page,
  playwright,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  expect((await page.request.get(assetUrl)).status()).toBe(404);
  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3101" });
  expect((await anonymous.get(assetUrl)).status()).toBe(401);
  await anonymous.dispose();
  await openTopic(page, "Image-choice fixtures");
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
  const imageChoice = await page.locator(".option-btn").first().boundingBox();
  if (!imageChoice) throw new Error("Missing image choice");
  expect(imageChoice.width).toBeGreaterThan(250);
  const zoom = page.getByRole("button", { name: "Enlarge image", exact: true });
  await zoom.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(zoom).toBeFocused();
  await page.getByRole("button", { name: "☆ Bookmark", exact: true }).click();
  await expect(page.getByRole("button", { name: "★ Bookmarked", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "🏳️ Flag", exact: true }).click();
  await expect(page.getByRole("button", { name: "🚩 Flagged", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Second description/ }).click();
  await expect(
    page.getByRole("heading", { name: "✅ Correct Answer!", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Second description/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "★ Bookmarked", exact: true })).toBeVisible();
  await scan(page);
  await page.screenshot({
    path: ".cache/verification/replica-image-player-mobile.png",
    fullPage: true,
  });
  await finish(page, 5);
  await page.getByText("Review Answers & Explanations", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Answer explanation" }).first()).toBeVisible();
});
test("ordering keeps keyboard controls, saves full sequences and explains the ordered key", async ({
  page,
}) => {
  await signIn(page);
  await openTopic(page, "Ordering fixtures");
  const region = page.getByRole("region", { name: "Arrange your answer" }),
    desired = ["First, begin.", "Then, continue.", "Finally, finish."];
  for (let target = 0; target < desired.length; target++) {
    let positions = await region.locator("li p").allTextContents(),
      current = positions.indexOf(desired[target] ?? "");
    while (current > target) {
      await region
        .getByRole("button", { name: `Move item ${current + 1} up`, exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText("Saved to your account", { exact: true })).toBeVisible();
      positions = await region.locator("li p").allTextContents();
      current = positions.indexOf(desired[target] ?? "");
    }
  }
  const keep = page.getByRole("button", { name: "Save this order", exact: true });
  if (await keep.isVisible()) {
    await keep.click();
    await expect(page.getByText("Saved to your account", { exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(region.locator("li p")).toHaveText(desired);
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "✅ Correct Answer!", exact: true }),
  ).toBeVisible();
  await scan(page);
  await finish(page, 5);
  await page.getByText("Review Answers & Explanations", { exact: true }).click();
  await expect(
    page
      .getByText("Correct answer: First, begin. → Then, continue. → Finally, finish.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
});
test("Quick 10 retries a lost creation response without duplicates and answer retries remain checked", async ({
  page,
}) => {
  await signIn(page);
  const before = await db
    .select({ id: attempt.id })
    .from(attempt)
    .where(eq(attempt.userId, learnerId));
  let lost = false;
  await page.route("**/api/rpc/reviewer/start", async (route) => {
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Start 10 Qs Sprint", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page.getByRole("button", { name: "Start 10 Qs Sprint", exact: true }).click();
  await expect(page).toHaveURL(/attempts/);
  const after = await db
    .select({ id: attempt.id })
    .from(attempt)
    .where(eq(attempt.userId, learnerId));
  expect(after.length - before.length).toBe(1);
  await expect(page.getByRole("heading", { name: "Question 1 of 10", exact: true })).toBeVisible();
  let failures = 0;
  await page.route("**/api/rpc/attempts/saveAnswer", async (route) => {
    if (failures++ < 3) await route.abort("failed");
    else await route.continue();
  });
  await page.locator(".option-btn").first().click();
  await expect(
    page.getByRole("button", { name: "Retry saving answer", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Next ➔", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry saving answer", exact: true }).click();
  await expect(page.getByText("Saved to your account", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
  await finish(page, 10);
  await page.getByRole("link", { name: "🏠 Back to Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Start 10 Qs Sprint", exact: true }).click();
  await expect(page).toHaveURL(/attempts/);
  expect(
    (await db.select({ id: attempt.id }).from(attempt).where(eq(attempt.userId, learnerId)))
      .length - before.length,
  ).toBe(2);
});
test("daily challenge contains 25 questions and counts a real completion once", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "Start Today's Quiz (25 Qs)", exact: true }).click();
  await expect(page).toHaveURL(/attempts/);
  await expect(page.getByRole("heading", { name: "Question 1 of 25", exact: true })).toBeVisible();
  await finish(page, 25);
  await page.getByRole("link", { name: "🏠 Back to Dashboard", exact: true }).click();
  await expect(page.getByText("Streak: 1d", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Analytics & History", exact: false })
    .click();
  await expect(page.getByRole("link", { name: "Daily challenge", exact: true })).toBeVisible();
  await scan(page);
});
test("mock presets withhold feedback, restore flags and saved answers, and preserve the deadline", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Mock Simulation", exact: false })
    .click();
  for (const count of [25, 50, 75])
    await expect(
      page.getByRole("button", { name: `Launch ${count} Qs`, exact: true }),
    ).toBeVisible();
  await page.getByRole("button", { name: "Launch 25 Qs", exact: true }).click();
  await expect(page).toHaveURL(/attempts/);
  const id = page.url().match(/attempts\/([^/]+)/)?.[1] ?? "";
  const [initial] = await db.select().from(attempt).where(eq(attempt.id, id));
  await page.locator(".option-btn").first().click();
  await expect(page.getByText("Saved to your account", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "🏳️ Flag", exact: true }).click();
  await expect(page.getByRole("button", { name: "🚩 Flagged", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.option-btn[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Answer explanation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check answer", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Date.now = () => 0;
  });
  const [restored] = await db.select().from(attempt).where(eq(attempt.id, id));
  expect(restored?.expiresAt?.getTime()).toBe(initial?.expiresAt?.getTime());
  await scan(page);
  await finish(page, 25);
  await expect(page.locator(".results-score-num")).toBeVisible();
});
test("practice certificate prints honestly and a shuffled retake keeps the same five questions", async ({
  page,
}) => {
  await signIn(page);
  await openTopic(page, "Image-choice fixtures");
  for (let n = 1; n <= 5; n++) {
    await page.getByRole("button", { name: /Second description/ }).click();
    await expect(
      page.getByRole("heading", { name: "✅ Correct Answer!", exact: true }),
    ).toBeVisible();
    if (n < 5) await page.getByRole("button", { name: "Next ➔", exact: true }).click();
  }
  await finish(page, 5);
  const originalId = new URL(page.url()).pathname.split("/")[2] ?? "";
  await expect(page.locator(".results-score-num")).toHaveText("100");
  const certificate = page.getByRole("button", {
    name: "🎓 View Practice Certificate",
    exact: true,
  });
  await certificate.click();
  await expect(page.getByRole("dialog")).toContainText("not an official CSC certificate");
  await page.emulateMedia({ media: "print" });
  const printBox = await page.locator(".cmms-certificate").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      transform: style.transform,
      translate: style.translate,
      animation: style.animationName,
    };
  });
  expect(printBox.x, JSON.stringify(printBox)).toBeGreaterThanOrEqual(0);
  expect(printBox.y, JSON.stringify(printBox)).toBeGreaterThanOrEqual(0);
  await page.pdf({ path: ".cache/verification/replica-practice-certificate.pdf", format: "A4" });
  await page.emulateMedia({ media: "screen" });
  await page.keyboard.press("Escape");
  await expect(certificate).toBeFocused();
  await page.getByRole("button", { name: "🔄 Retake Quiz (Shuffled)", exact: true }).click();
  await expect(page).toHaveURL(/attempts\/[^/]+$/);
  const retakeId = new URL(page.url()).pathname.split("/")[2] ?? "";
  expect(retakeId).not.toBe(originalId);
  await expect(page.getByRole("heading", { name: "Question 1 of 5", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toHaveCount(0);
  const original = await db
    .select({ id: attemptItem.questionVersionId })
    .from(attemptItem)
    .where(eq(attemptItem.attemptId, originalId));
  const retake = await db
    .select({ id: attemptItem.questionVersionId })
    .from(attemptItem)
    .where(eq(attemptItem.attemptId, retakeId));
  expect(retake.map((i) => i.id).sort()).toEqual(original.map((i) => i.id).sort());
  expect(
    (await db.select().from(attemptResult).where(eq(attemptResult.attemptId, originalId)))[0]
      ?.correct,
  ).toBe(5);
});
test("an expired mock automatically restores one server-scored result", async ({ page }) => {
  await signIn(page);
  const [profile] = await db
    .select()
    .from(examProfileVersion)
    .where(eq(examProfileVersion.active, true));
  const [q] = await db
    .select()
    .from(questionVersion)
    .where(eq(questionVersion.status, "published"))
    .limit(1);
  if (!profile || !q) throw new Error("Missing expiry fixture");
  const [a] = await db
    .insert(attempt)
    .values({
      userId: learnerId,
      mode: "strict_mock",
      setKind: "short",
      profileVersionId: profile.id,
      expiresAt: new Date(Date.now() + 14000),
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
  await page.locator(".option-btn").first().click();
  await expect(page.getByText("Saved to your account", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/results$/, { timeout: 25000 });
  expect(
    await db.select().from(attemptResult).where(eq(attemptResult.attemptId, a.id)),
  ).toHaveLength(1);
  await scan(page);
});
test("account export remains private and password-confirmed deletion ends access", async ({
  page,
}) => {
  await signIn(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export study progress", exact: true }).click();
  const file = await download;
  const path = await file.path();
  if (!path) throw new Error("Missing export");
  const content = await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8"));
  expect(content).not.toContain('"answerChoiceId"');
  expect(content).not.toContain('"password"');
  await page.getByRole("button", { name: "Account settings", exact: true }).click();
  await page.getByText("Delete account", { exact: true }).click();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByLabel("Type DELETE to confirm", { exact: true }).fill("DELETE");
  await page.getByRole("button", { name: "Permanently delete my account", exact: true }).click();
  await expect(page).toHaveURL(/account-deleted/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/sign-in/);
});
