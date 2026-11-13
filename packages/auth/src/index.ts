import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@sibol-cse/db";
import * as schema from "@sibol-cse/db/schema/auth";
import { betterAuth } from "better-auth";
import { createMailer, type EmailConfig } from "./email";

export type AuthConfig = EmailConfig & {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
  NODE_ENV: string;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  return betterAuth({
    logger: {
      level: "error",
      // Adapter exceptions may carry SQL parameters. Keep authentication logs structural.
      log: (level) => console.error(JSON.stringify({ event: "authentication_failure", level })),
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 1800,
      sendResetPassword: async ({ user, url }) => {
        await createMailer(env)({
          to: user.email,
          subject: "Reset your Sibol password",
          text: `Reset your password using this link within 30 minutes: ${url}\nIf you did not request this, you can ignore this email.`,
        });
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    plugins: [],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
