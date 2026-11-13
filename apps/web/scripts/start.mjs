import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const envPath = resolve(root, "../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
const standaloneWeb = resolve(root, ".next/standalone/apps/web");
await mkdir(resolve(standaloneWeb, ".next"), { recursive: true });
await cp(resolve(root, ".next/static"), resolve(standaloneWeb, ".next/static"), {
  recursive: true,
});
if (existsSync(resolve(root, "public")))
  await cp(resolve(root, "public"), resolve(standaloneWeb, "public"), { recursive: true });
process.env.PORT ??= "3001";
process.env.HOSTNAME = "0.0.0.0";
await import(resolve(standaloneWeb, "server.js"));
