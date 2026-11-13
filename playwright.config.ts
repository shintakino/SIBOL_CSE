import { defineConfig, devices } from "@playwright/test";

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL || !new URL(databaseURL).pathname.endsWith("_test"))
  throw new Error("Set TEST_DATABASE_URL to the migrated, dedicated test database.");
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 30000 },
  use: {
    baseURL: "http://localhost:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun --env-file=.env run apps/server/src/index.ts",
      url: "http://localhost:3100/health/ready",
      reuseExistingServer: false,
      env: {
        DATABASE_URL: databaseURL,
        PORT: "3100",
        NODE_ENV: "test",
        BETTER_AUTH_URL: "http://localhost:3101",
        CORS_ORIGIN: "http://localhost:3101",
        BETTER_AUTH_SECRET: "e2e-only-secret-at-least-32-characters",
        SMTP_URL: "smtp://localhost:1025",
        EMAIL_FROM: "Sibol <e2e@example.test>",
      },
    },
    {
      command: "pnpm build && node scripts/start.mjs",
      cwd: "apps/web",
      url: "http://localhost:3101",
      reuseExistingServer: false,
      timeout: 300000,
      env: {
        API_INTERNAL_URL: "http://localhost:3100",
        PORT: "3101",
        CORS_ORIGIN: "http://localhost:3101",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
