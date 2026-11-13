import { createAuth } from "@sibol-cse/auth";
import { createMailer } from "@sibol-cse/auth/email";
import { createDb } from "@sibol-cse/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
const sendMail = createMailer(ENV);
export const sendInvitation = async (email: string, token: string) => {
  const url = new URL("/accept-invitation", ENV.CORS_ORIGIN);
  url.searchParams.set("token", token);
  await sendMail({
    to: email,
    subject: "Your invitation to Sibol",
    text: `You have been invited to Sibol, your private civil service review companion.\nCreate your account within 48 hours: ${url}\nThis invitation is for your email address only.`,
  });
};
