import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createInvitation } from "@sibol-cse/api/services/accounts";
import { createDb } from "@sibol-cse/db";
import { account, user, userProfile } from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { resetBrowserRateLimits } from "../fixtures/browser-limits";

const db = createDb({ DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" });
const password = "an-e2e-test-passphrase-only";
const stamp = crypto.randomUUID().slice(0, 8);
const adminEmail = `e2e-admin-${stamp}@example.test`;
const recoveryEmail = `e2e-recovery-${stamp}@example.test`;
const learnerEmail = `e2e-learner-${stamp}@example.test`;
let invitationToken = "";

test.beforeEach(async () => {
  await resetBrowserRateLimits(db);
});

test.beforeAll(async () => {
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .insert(user)
      .values({ id, name: "E2E administrator", email: adminEmail, emailVerified: true });
    await tx.insert(account).values({
      id: crypto.randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: await hashPassword(password),
      updatedAt: new Date(),
    });
    await tx.insert(userProfile).values({ userId: id, role: "admin", onboardedAt: new Date() });
  });
  invitationToken = (await createInvitation(db, id, learnerEmail)).token;
  const recoveryId = crypto.randomUUID();
  await db.insert(user).values({
    id: recoveryId,
    name: "Recovery learner",
    email: recoveryEmail,
    emailVerified: true,
  });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    userId: recoveryId,
    accountId: recoveryId,
    providerId: "credential",
    password: await hashPassword(password),
    updatedAt: new Date(),
  });
  await db.insert(userProfile).values({ userId: recoveryId, onboardedAt: new Date() });
});
test.afterAll(async () => {
  await db.$client.end();
});

async function noOverflow(page: Page) {
  await expect(async () => {
    const metrics = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      outside: [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 10)
        .map((el) => ({
          tag: el.tagName,
          className: String(el.className),
          width: el.getBoundingClientRect().width,
        })),
    }));
    expect(metrics.width, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewport);
  }).toPass({ timeout: 5000 });
}
async function noAccessibilityViolations(page: Page) {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      description: v.description,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}

test("invitation, onboarding, private shell and accessible study controls on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
  await noOverflow(page);
  expect(await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
    "Geist",
  );
  await noAccessibilityViolations(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/sign-in/);
  await page.goto(`/accept-invitation?token=${invitationToken}`);
  await page.getByLabel("Your name").fill("Maya Learner");
  await page.getByLabel("Create a password").fill(password);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByText("Your account is ready.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await page.getByLabel("Email address").fill(learnerEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/onboarding/);
  await expect(page.getByLabel("Minutes per study day")).toHaveValue("");
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await page.getByRole("radio", { name: /^Professional/ }).check();
  await page.getByRole("checkbox", { name: "Monday" }).check();
  await page.getByRole("checkbox", { name: "Wednesday" }).check();
  await page.getByLabel("Minutes per study day").fill("25");
  await page.getByLabel("Preferred explanation language").click();
  await page.getByRole("option", { name: "Filipino" }).click();
  await noOverflow(page);
  await noAccessibilityViolations(page);
  await page.getByRole("button", { name: "Create my study space" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText("25 minutes per study day")).toBeVisible();
  await expect(page.getByText("Insufficient evidence:", { exact: false })).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-dashboard.png", fullPage: true });
  await noOverflow(page);
  await noAccessibilityViolations(page);
  await page.getByRole("button", { name: "Toggle light and dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await noAccessibilityViolations(page);
  await page.getByRole("link", { name: "Settings", exact: true }).last().click();
  await page.getByRole("link", { name: "UI preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Designed for a calmer focus." })).toBeVisible();
  await page.getByRole("radio", { name: "4 seedlings", exact: true }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: "6 seedlings", exact: true })).toBeChecked();
  const review = page.getByRole("button", { name: "Review selection" });
  await review.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Selected: 6 seedlings");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(review).toBeFocused();
  await noOverflow(page);
  await noAccessibilityViolations(page);
  await page.screenshot({ path: "test-results/mobile-preview-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Toggle light and dark theme" }).click();
  await noAccessibilityViolations(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await noOverflow(page);
  await noAccessibilityViolations(page);
  await page.screenshot({ path: "test-results/desktop-preview.png", fullPage: true });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await noOverflow(page);
  await page.goto("/admin/users");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/sign-in/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/sign-in/);
});

test("administrator sends invitation through the configured email transport", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(adminEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Invitations & access" })).toBeVisible();
  const recipient = `invited-${stamp}@example.test`;
  await page.getByLabel("Email address").fill(recipient);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent.", { exact: false })).toBeVisible();
  const messages = (await (await fetch("http://localhost:8025/api/v1/messages")).json()) as {
    messages: { To: { Address: string }[] }[];
  };
  expect(
    messages.messages.some((message) => message.To.some((to) => to.Address === recipient)),
  ).toBe(true);
  await noAccessibilityViolations(page);
  // A stale account list must show a failed role change inside the focused dialog.
  const transientId = crypto.randomUUID();
  const transientEmail = `removed-${stamp}@example.test`;
  await db.insert(user).values({ id: transientId, name: "Removed account", email: transientEmail });
  await db.insert(userProfile).values({ userId: transientId });
  await page.getByRole("button", { name: "Reload accounts" }).click();
  const row = page.getByRole("listitem").filter({ hasText: transientEmail });
  await row.getByRole("button", { name: "Change role" }).click();
  await db.delete(user).where(eq(user.id, transientId));
  await page.getByRole("button", { name: "Confirm role change" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await noAccessibilityViolations(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("password recovery via emailed link, with expired-link feedback", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(recoveryEmail);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If this email has an account", { exact: false })).toBeVisible();
  const listing = (await (await fetch("http://localhost:8025/api/v1/messages")).json()) as {
    messages: { ID: string; To: { Address: string }[] }[];
  };
  const mail = listing.messages.find((message) =>
    message.To.some((to) => to.Address === recoveryEmail),
  );
  if (!mail) throw new Error("Recovery email missing");
  const detail = (await (
    await fetch(`http://localhost:8025/api/v1/message/${mail.ID}`)
  ).json()) as { Text: string };
  const link = detail.Text.match(/https?:\/\/[^\s]+/)?.[0];
  if (!link) throw new Error("Recovery link missing");
  await page.goto(link);
  await page.getByLabel("Create a password").fill(`${password}-reset`);
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText("Your password has been reset.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await page.getByLabel("Email address").fill(recoveryEmail);
  await page.getByLabel("Password", { exact: true }).fill(`${password}-reset`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto(link);
  await expect(page.getByText("This link is invalid or expired.", { exact: false })).toBeVisible();
});
