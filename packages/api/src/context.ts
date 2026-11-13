import type { Session } from "@sibol-cse/auth";
import type { Database } from "@sibol-cse/db";

export type Context = {
  session: Session | null;
  db: Database;
  sendInvitation: (email: string, token: string) => Promise<void>;
};
