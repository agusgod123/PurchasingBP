import { db } from "@/server/db";
import { sendMail } from "@/server/notifications/email";

const MAX_ATTEMPTS = 8;

interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  text_body: string;
  html_body: string | null;
  attempts: number;
}

/**
 * Mengirim email yang tertunda. Aman dijalankan paralel (FOR UPDATE SKIP LOCKED)
 * dan berulang; kegagalan dijadwalkan ulang dengan backoff eksponensial.
 */
export async function flushOutbox(limit = 20): Promise<{ sent: number; failed: number }> {
  const rows = await db.$queryRaw<OutboxRow[]>`
    UPDATE "email_outbox" SET "locked_until" = now() + interval '2 minutes'
    WHERE "id" IN (
      SELECT "id" FROM "email_outbox"
      WHERE "status" = 'PENDING' AND "next_attempt_at" <= now()
        AND ("locked_until" IS NULL OR "locked_until" < now())
      ORDER BY "created_at"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "to_email", "subject", "text_body", "html_body", "attempts"`;

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await sendMail({ to: row.to_email, subject: row.subject, text: row.text_body, html: row.html_body });
      await db.emailOutbox.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), attempts: row.attempts + 1, lockedUntil: null, lastError: null },
      });
      sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const backoffMinutes = Math.min(2 ** attempts, 360);
      await db.emailOutbox.update({
        where: { id: row.id },
        data: {
          attempts,
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000),
          lockedUntil: null,
          lastError: err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000),
        },
      });
      failed++;
    }
  }
  return { sent, failed };
}
