import type { DbOrTx } from "@/server/db";
import { getSettings } from "@/server/settings";
import { env } from "@/server/env";
import { renderEmail } from "@/server/notifications/email";

export const NOTIFICATION_TYPES = {
  APPROVAL_REQUIRED: "Persetujuan diperlukan",
  APPROVAL_REMINDER: "Pengingat persetujuan",
  APPROVAL_ESCALATION: "Eskalasi persetujuan",
  REQUEST_SUBMITTED: "Pengajuan dikirim",
  REQUEST_APPROVED: "Pengajuan disetujui",
  REQUEST_REVISION: "Pengajuan perlu revisi",
  REQUEST_ON_HOLD: "Pengajuan ditahan",
  REQUEST_QUEUED: "Masuk antrean purchasing",
  CHANGE_APPROVAL_REQUIRED: "Persetujuan perubahan",
  CHANGE_DECIDED: "Keputusan perubahan",
  PO_ORDERED: "Barang dipesan",
  PO_DELAYED: "Pesanan terlambat",
  PO_ETA_CHANGED: "Perkiraan kedatangan berubah",
  GOODS_RECEIVED: "Barang diterima",
  DISCREPANCY_REPORTED: "Masalah barang",
  DISCREPANCY_RESOLVED: "Masalah barang selesai",
  HANDOVER_READY: "Siap serah terima",
  HANDOVER_CONFIRMED: "Serah terima dikonfirmasi",
  HANDOVER_DISPUTED: "Serah terima dipermasalahkan",
  REQUEST_COMPLETED: "Pengajuan selesai",
  CANCELLATION_REQUESTED: "Usulan pembatalan",
  REQUEST_CANCELLED: "Pengajuan dibatalkan",
  NEEDS_REVIEW: "Perlu ditinjau",
  ACCOUNT_PENDING: "Akun menunggu aktivasi",
  ACCOUNT_ACTIVATED: "Akun diaktifkan",
  TICKET_UPDATE: "Tiket bantuan",
  COMMENT: "Komentar baru",
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export interface NotifyInput {
  recipientIds: Array<string | null | undefined>;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  requestId?: string | null;
  purchaseOrderId?: string | null;
  mandatory?: boolean;
  /** Kunci unik agar tugas terjadwal tidak membuat notifikasi ganda. */
  dedupeKey?: string;
  /** Pengguna yang tidak perlu diberi notifikasi (biasanya pelaku). */
  excludeUserId?: string | null;
}

/**
 * Membuat notifikasi di aplikasi + antrean email (outbox) dalam transaksi yang sama.
 * Email dikirim setelah commit oleh `flushOutbox` / cron, sehingga kegagalan email
 * tidak membatalkan transaksi bisnis.
 */
export async function notify(db: DbOrTx, input: NotifyInput): Promise<number> {
  const ids = [...new Set(input.recipientIds.filter((x): x is string => !!x && x !== input.excludeUserId))];
  if (ids.length === 0) return 0;
  // Berurutan: klien transaksi tidak boleh menjalankan query paralel.
  const settings = await getSettings();
  const users = await db.user.findMany({ where: { id: { in: ids }, accountStatus: "ACTIVE" }, select: { id: true, email: true } });
  const sendEmail = settings["notifications.email_types"].includes(input.type);
  const appName = env().APP_NAME;
  let created = 0;
  for (const user of users) {
    const dedupeKey = input.dedupeKey ? `${input.dedupeKey}:${user.id}`.slice(0, 255) : null;
    if (dedupeKey) {
      const exists = await db.notification.findUnique({ where: { dedupeKey }, select: { id: true } });
      if (exists) continue;
    }
    const notification = await db.notification.create({
      data: {
        recipientId: user.id,
        type: input.type,
        title: input.title.slice(0, 255),
        body: input.body,
        link: input.link ?? null,
        requestId: input.requestId ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        isMandatory: input.mandatory ?? false,
        dedupeKey,
      },
    });
    created++;
    if (sendEmail && user.email) {
      const { text, html } = renderEmail({ appName, title: input.title, body: input.body, link: input.link });
      await db.emailOutbox.create({
        data: {
          notificationId: notification.id,
          toEmail: user.email,
          subject: `[${appName}] ${input.title}`.slice(0, 255),
          textBody: text,
          htmlBody: html,
        },
      });
    }
  }
  return created;
}

/** Email langsung (mis. reset password) tanpa notifikasi aplikasi. */
export async function queueEmail(
  db: DbOrTx,
  input: { to: string; title: string; body: string; link?: string },
): Promise<void> {
  const appName = env().APP_NAME;
  const { text, html } = renderEmail({ appName, title: input.title, body: input.body, link: input.link });
  await db.emailOutbox.create({
    data: { toEmail: input.to, subject: `[${appName}] ${input.title}`.slice(0, 255), textBody: text, htmlBody: html },
  });
}
