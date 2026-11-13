import nodemailer from "nodemailer";

export type EmailConfig = { SMTP_URL: string; EMAIL_FROM: string };
export type Mail = { to: string; subject: string; text: string };
export function createMailer(config: EmailConfig) {
  const transport = nodemailer.createTransport(config.SMTP_URL);
  return async (message: Mail) => {
    await transport.sendMail({ from: config.EMAIL_FROM, ...message });
  };
}
