import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/server/env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const e = env();
  transporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

/** Mengirim email. Melempar error jika gagal agar outbox dapat mencoba ulang. */
export async function sendMail(message: MailMessage): Promise<void> {
  const e = env();
  if (e.EMAIL_TRANSPORT === "disabled") return;
  if (e.EMAIL_TRANSPORT === "log") {
    console.info(`[email] ke=${message.to} subjek="${message.subject}"`);
    return;
  }
  if (!e.SMTP_HOST) throw new Error("SMTP_HOST belum dikonfigurasi");
  await getTransporter().sendMail({
    from: e.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html ?? undefined,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function renderEmail(input: { appName: string; title: string; body: string; link?: string | null }) {
  const url = input.link ? new URL(input.link, env().APP_URL).toString() : null;
  const text = [input.title, "", input.body, url ? `\nBuka: ${url}` : "", "", `— ${input.appName}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Segoe UI,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #eeeeee;font-weight:600;font-size:14px;color:#525252">${escapeHtml(input.appName)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:18px;line-height:1.4">${escapeHtml(input.title)}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;white-space:pre-line">${escapeHtml(input.body)}</p>
${url ? `<a href="${escapeHtml(url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Buka di aplikasi</a>` : ""}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eeeeee;font-size:12px;color:#737373">Email ini dikirim otomatis. Jangan membalas email ini.</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}
