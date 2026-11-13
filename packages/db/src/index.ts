import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

export function createDb(env: DatabaseConfig) {
  return drizzle({
    connection: { connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX ?? 10 },
    relations,
  });
}

export type Database = ReturnType<typeof createDb>;
