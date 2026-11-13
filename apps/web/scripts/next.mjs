import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Loading in-process avoids passing --env-file into Next's worker NODE_OPTIONS.
const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
await import("next/dist/bin/next");
