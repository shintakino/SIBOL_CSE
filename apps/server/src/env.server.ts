import { z } from "zod";

export const ENV = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    SIBOL_RELEASE_SHA: z
      .union([z.literal("development"), z.string().regex(/^[a-f0-9]{40}$/)])
      .default("development"),
    DB_POOL_MAX: z.coerce.number().int().min(2).max(50).default(10),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol),
        "Use a PostgreSQL connection URL.",
      ),
    BETTER_AUTH_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    CORS_ORIGIN: z.string().url(),
    SMTP_URL: z.string().url(),
    EMAIL_FROM: z.string().min(3),
  })
  .parse(process.env);
if (
  ENV.NODE_ENV === "production" &&
  (!ENV.BETTER_AUTH_URL.startsWith("https://") || !ENV.CORS_ORIGIN.startsWith("https://"))
) {
  throw new Error("Production authentication requires HTTPS.");
}
