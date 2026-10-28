/**
 * Sending email. With SMTP_URL configured it goes through SMTP (nodemailer); without it, in
 * development the message is printed to the server console (to test the links) and in
 * production an error is thrown: an email that is not sent must be noticed.
 */
import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string };

export class MailError extends Error {}

let transport: nodemailer.Transporter | null = null;

export function mailConfigured() {
  return !!process.env.SMTP_URL;
}

export async function sendMail(m: Mail) {
  const url = process.env.SMTP_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") throw new MailError("Email sending is not configured (SMTP_URL)");
    console.info(`\n[dev email] To: ${m.to}\nSubject: ${m.subject}\n\n${m.text}\n`);
    return;
  }
  transport ??= nodemailer.createTransport(url);
  try {
    await transport.sendMail({ from: process.env.MAIL_FROM ?? "FUNCA <no-responder@funca.edu.co>", to: m.to, subject: m.subject, text: m.text });
  } catch (e) {
    console.error("Could not send email", m.subject, e);
    throw new MailError("No se pudo enviar el correo");
  }
}

/** Accepted institutional email domains (MAIL_DOMAINS="funca.edu.co,other.edu.co"). */
export function institutionalDomains(): string[] {
  return (process.env.MAIL_DOMAINS ?? "funca.edu.co")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isInstitutionalEmail(email: string, domains = institutionalDomains()): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return !!domain && domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Public URL of the platform, used to build links in emails. */
export function baseUrl(req: Request): string {
  return (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
}
