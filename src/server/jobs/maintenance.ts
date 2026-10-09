/**
 * Tugas terjadwal (dipanggil oleh cron melalui /api/cron/[job]).
 *
 * Semua tugas idempoten: aman dijalankan berulang atau bersamaan karena
 * notifikasi memakai dedupeKey dan pembaruan memakai kondisi status.
 * Tidak ada keputusan otomatis — keterlambatan hanya memicu pengingat/eskalasi.
 */
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { notify } from "@/server/notifications/notify";
import { flushOutbox } from "@/server/notifications/outbox";
import { addDays, addHours, dateKeyInTz, todayDateOnly } from "@/server/time";
import { PERMISSIONS } from "@/lib/permissions";
import { APPROVAL_SUBJECT } from "@/lib/status";

export interface JobReport {
  [key: string]: number;
}

/** Pengingat untuk persetujuan yang lewat tenggat, berulang sesuai interval pengingat. */
export async function approvalReminders(now = new Date()): Promise<JobReport> {
  const settings = await getSettings();
  const interval = settings["approval.reminder_interval_hours"];
  const due = await db.approvalAssignment.findMany({
    where: {
      status: "PENDING",
      dueAt: { lt: now },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: addHours(now, -interval) } }],
    },
    include: { step: { include: { instance: { include: { request: { select: { id: true, requestNumber: true, title: true } } } } } } },
    take: 500,
  });
  let sent = 0;
  for (const a of due) {
    const inst = a.step.instance;
    // Klaim baris secara atomik agar dua cron paralel tidak mengirim dua kali.
    const claimed = await db.approvalAssignment.updateMany({
      where: { id: a.id, status: "PENDING", lastReminderAt: a.lastReminderAt },
      data: { lastReminderAt: now, reminderCount: { increment: 1 } },
    });
    if (claimed.count === 0) continue;
    sent += await notify(db, {
      recipientIds: [a.approverUserId],
      type: "APPROVAL_REMINDER",
      title: `Pengingat: ${inst.request.requestNumber ?? ""} ${inst.request.title} menunggu keputusan Anda`.trim(),
      body: `${APPROVAL_SUBJECT[inst.subjectType]} pada tahap "${a.step.name}" sudah melewati tenggat. Mohon setujui atau kembalikan dengan catatan.`,
      link: `/persetujuan/${a.id}`,
      requestId: inst.request.id,
      dedupeKey: `reminder:${a.id}:${a.reminderCount + 1}`,
    });
  }
  return { reminders: sent };
}

/**
 * Eskalasi: persetujuan yang lewat tenggat lebih dari batas eskalasi diberitahukan
 * ke atasan approver dan pengelola persetujuan (yang dapat mengalihkan penugasan).
 */
export async function approvalEscalations(now = new Date()): Promise<JobReport> {
  const settings = await getSettings();
  const after = settings["approval.escalation_after_hours"];
  const rows = await db.approvalAssignment.findMany({
    where: { status: "PENDING", escalatedAt: null, dueAt: { lt: addHours(now, -after) } },
    include: {
      approver: { include: { employee: { include: { supervisor: { include: { user: { select: { id: true } } } } } } } },
      step: { include: { instance: { include: { request: { select: { id: true, requestNumber: true, title: true } } } } } },
    },
    take: 200,
  });
  if (rows.length === 0) return { escalations: 0 };
  const managers = await db.user.findMany({
    where: { accountStatus: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.APPROVAL_REASSIGN } } } } } } },
    select: { id: true },
  });
  let count = 0;
  for (const a of rows) {
    const claimed = await db.approvalAssignment.updateMany({ where: { id: a.id, escalatedAt: null }, data: { escalatedAt: now } });
    if (claimed.count === 0) continue;
    const req = a.step.instance.request;
    await notify(db, {
      recipientIds: [a.approver.employee?.supervisor?.user?.id, ...managers.map((m) => m.id)],
      excludeUserId: a.approverUserId,
      type: "APPROVAL_ESCALATION",
      title: `Eskalasi: ${req.requestNumber ?? ""} belum diputuskan oleh ${a.approver.fullName}`.trim(),
      body: `Tahap "${a.step.name}" untuk "${req.title}" melewati tenggat lebih dari ${after} jam. Hubungi approver atau alihkan penugasan bila perlu.`,
      link: `/pengajuan/${req.id}`,
      requestId: req.id,
      dedupeKey: `escalation:${a.id}`,
    });
    count++;
  }
  return { escalations: count };
}

/** PO yang melewati ETA tanpa catatan keterlambatan diingatkan ke petugas Purchasing (harian). */
export async function purchaseOrderDelays(): Promise<JobReport> {
  const today = todayDateOnly();
  const rows = await db.purchaseOrder.findMany({
    where: {
      status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] },
      OR: [{ currentEta: { lt: today } }, { currentEta: null, expectedDeliveryDate: { lt: today } }],
    },
    include: {
      vendor: { select: { name: true } },
      followups: { where: { followupType: "DELAY" }, orderBy: { createdAt: "desc" }, take: 1 },
      requestLinks: { select: { request: { select: { requesterId: true } } } },
    },
    take: 500,
  });
  const dayKey = dateKeyInTz();
  let count = 0;
  for (const po of rows) {
    const eta = po.currentEta ?? po.expectedDeliveryDate!;
    // Sudah ada catatan keterlambatan setelah ETA lewat → tidak perlu diingatkan lagi hari ini.
    const handled = po.followups[0] && po.followups[0].createdAt >= eta;
    const lateDays = Math.floor((today.getTime() - eta.getTime()) / 86_400_000);
    count += await notify(db, {
      recipientIds: [po.purchasingOwnerId],
      type: "PO_DELAYED",
      title: `${po.poNumber} terlambat ${lateDays} hari`,
      body: handled
        ? `Pesanan dari ${po.vendor?.name ?? "vendor"} masih belum diterima. Perbarui ETA atau catat tindak lanjut.`
        : `Pesanan dari ${po.vendor?.name ?? "vendor"} melewati perkiraan kedatangan. Catat keterlambatan (alasan, ETA baru, tindak lanjut).`,
      link: `/purchasing/po/${po.id}`,
      purchaseOrderId: po.id,
      dedupeKey: `po-delay:${po.id}:${dayKey}`,
    });
  }
  return { poDelays: count };
}

/** Menandai transaksi tanpa aktivitas untuk ditinjau (tidak mengubah status). */
export async function staleFlags(now = new Date()): Promise<JobReport> {
  const settings = await getSettings();
  const cutoff = addDays(now, -settings["purchasing.stale_after_days"]);
  const requests = await db.request.findMany({
    where: { needsReviewAt: null, lastActivityAt: { lt: cutoff }, status: { in: ["APPROVED", "IN_PROCUREMENT", "READY_FOR_HANDOVER", "AWAITING_CONFIRMATION", "ON_HOLD"] } },
    select: { id: true, requestNumber: true, title: true, requesterId: true, status: true },
    take: 500,
  });
  const pos = await db.purchaseOrder.findMany({
    where: { needsReviewAt: null, lastActivityAt: { lt: cutoff }, status: { in: ["DRAFT", "READY_TO_ORDER", "ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD"] } },
    select: { id: true, poNumber: true, purchasingOwnerId: true },
    take: 500,
  });
  const purchasers = await db.user.findMany({
    where: { accountStatus: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.PURCHASING_MANAGE } } } } } } },
    select: { id: true },
  });
  for (const r of requests) {
    const claimed = await db.request.updateMany({ where: { id: r.id, needsReviewAt: null }, data: { needsReviewAt: now } });
    if (!claimed.count) continue;
    await notify(db, {
      recipientIds: r.status === "AWAITING_CONFIRMATION" ? [r.requesterId] : purchasers.map((p) => p.id),
      type: "NEEDS_REVIEW",
      title: `${r.requestNumber ?? r.title} tidak ada aktivitas ${settings["purchasing.stale_after_days"]} hari`,
      body: "Mohon tinjau dan perbarui status atau catat tindak lanjut.",
      link: `/pengajuan/${r.id}`,
      requestId: r.id,
      dedupeKey: `stale-request:${r.id}:${dateKeyInTz(now)}`,
    });
  }
  for (const p of pos) {
    const claimed = await db.purchaseOrder.updateMany({ where: { id: p.id, needsReviewAt: null }, data: { needsReviewAt: now } });
    if (!claimed.count) continue;
    await notify(db, {
      recipientIds: [p.purchasingOwnerId],
      type: "NEEDS_REVIEW",
      title: `${p.poNumber} tidak ada aktivitas ${settings["purchasing.stale_after_days"]} hari`,
      body: "Mohon perbarui status PO atau catat tindak lanjut ke vendor.",
      link: `/purchasing/po/${p.id}`,
      purchaseOrderId: p.id,
      dedupeKey: `stale-po:${p.id}:${dateKeyInTz(now)}`,
    });
  }
  return { staleRequests: requests.length, stalePurchaseOrders: pos.length };
}

/** Pembersihan data sementara. Audit log dan transaksi TIDAK pernah dihapus. */
export async function cleanup(now = new Date()): Promise<JobReport> {
  const [sessions, idempotency, resetTokens, attempts, notifications] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.idempotencyKey.deleteMany({ where: { createdAt: { lt: addDays(now, -2) } } }),
    db.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: addDays(now, -7) } }, { usedAt: { lt: addDays(now, -7) } }] } }),
    db.loginAttempt.deleteMany({ where: { createdAt: { lt: addDays(now, -90) } } }),
    // Notifikasi yang sudah dibaca > 1 tahun; riwayat transaksi tetap ada di timeline.
    db.notification.deleteMany({ where: { readAt: { lt: addDays(now, -365) } } }),
  ]);
  return {
    sessions: sessions.count,
    idempotencyKeys: idempotency.count,
    resetTokens: resetTokens.count,
    loginAttempts: attempts.count,
    notifications: notifications.count,
  };
}

export const JOBS = {
  /** Kirim antrean email (sering: tiap 5–15 menit). */
  outbox: async () => flushOutbox(100),
  /** Pengingat & eskalasi persetujuan (tiap jam pada jam kerja, atau minimal harian). */
  approvals: async () => ({ ...(await approvalReminders()), ...(await approvalEscalations()) }),
  /** Keterlambatan PO, penanda tanpa aktivitas, pembersihan (harian). */
  daily: async () => ({ ...(await purchaseOrderDelays()), ...(await staleFlags()), ...(await cleanup()) }),
  /** Semua tugas sekaligus — untuk paket hosting yang hanya mengizinkan satu cron. */
  all: async () => ({
    ...(await approvalReminders()),
    ...(await approvalEscalations()),
    ...(await purchaseOrderDelays()),
    ...(await staleFlags()),
    ...(await cleanup()),
    ...(await flushOutbox(100)),
  }),
} satisfies Record<string, () => Promise<Record<string, number>>>;

export type JobName = keyof typeof JOBS;
