import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
    ),
  );
  return nested.flat();
}
const source = await files("apps/web/src");
for (const file of source.filter((file) => /\.[jt]sx?$/.test(file))) {
  const text = await readFile(file, "utf8");
  if (/from\s+["']@sibol-cse\/(db|auth)([/"'])/.test(text))
    throw new Error(`Forbidden server package import: ${file}`);
  for (const match of text.matchAll(
    /^import\s+(type\s+)?[^;]+?from\s+["'](@sibol-cse\/api[^"']*)["']/gm,
  )) {
    if (
      !match[1] &&
      ![
        "@sibol-cse/api/contracts",
        "@sibol-cse/api/learning-contracts",
        "@sibol-cse/api/study-catalog",
      ].includes(match[2] ?? "")
    )
      throw new Error(`Import contracts or types instead of API implementations: ${file}`);
  }
}
const chunks = await files("apps/web/.next/static");
for (const file of chunks.filter((file) => file.endsWith(".js"))) {
  // Better Auth's client includes environment-key names; actual secret values must never appear.
  const content = await readFile(file, "utf8");
  for (const key of ["BETTER_AUTH_SECRET", "DATABASE_URL", "SMTP_URL"]) {
    const value = process.env[key];
    if (value && content.includes(value))
      throw new Error(`Sensitive configuration value in browser chunk: ${file}`);
  }
  if (/answer_choice_id|question_version|nodemailer|drizzle-orm/.test(content))
    throw new Error(`Server material found in browser chunk: ${file}`);
}
console.log("Web import boundaries and production browser chunks are clean.");
