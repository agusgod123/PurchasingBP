import "server-only";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/user";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { todayDateOnly } from "@/server/time";
import { APPROVAL_SUBJECT } from "@/lib/status";

/** Jumlah pengajuan yang masih memiliki sisa kebutuhan untuk dibelikan. */
export async function queueRequestCount(): Promise<number> {
  const rows = await db.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(DISTINCT ri.request_id) AS n
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(poi.quantity_ordered - poi.closed_quantity), 0) AS alloc
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.purchase_order_id
      WHERE poi.request_item_id = ri.id AND po.status <> 'CANCELLED'
    ) a ON true
    WHERE r.status IN ('APPROVED', 'IN_PROCUREMENT')
      AND (ri.quantity - ri.cancelled_quantity) > a.alloc`;
  return Number(rows[0]?.n ?? 0);
}

export async function shellData(user: AuthUser) {
  const purchasing = can(user, PERMISSIONS.PURCHASING_MANAGE);
  const [approvals, revisions, handovers, unread, notifications, queue, adminTasks] = await Promise.all([
    db.approvalAssignment.count({ where: { approverUserId: user.id, status: "PENDING" } }),
    db.request.count({ where: { requesterId: user.id, status: "REVISION_REQUIRED" } }),
    db.handover.count({ where: { status: "PREPARED", request: { requesterId: user.id } } }),
    db.notification.count({ where: { recipientId: user.id, readAt: null } }),
    db.notification.findMany({
      where: { recipientId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    purchasing ? queueRequestCount() : Promise.resolve(0),
    can(user, PERMISSIONS.USER_MANAGE) || can(user, PERMISSIONS.APPROVAL_RULE_MANAGE)
      ? Promise.all([
          can(user, PERMISSIONS.USER_MANAGE) ? db.user.count({ where: { accountStatus: "PENDING_ACTIVATION" } }) : 0,
          can(user, PERMISSIONS.APPROVAL_RULE_MANAGE) ? db.request.count({ where: { status: "ON_HOLD" } }) : 0,
        ]).then(([a, b]) => a + b)
      : Promise.resolve(0),
  ]);
  return {
    counts: { approvals, tasks: approvals + revisions + handovers + adminTasks, queue, unreadNotifications: unread },
    notifications: notifications.map((n) => ({
      ...n,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  href: string;
  due?: Date | null;
  overdue?: boolean;
  tone?: "warning" | "danger" | "info" | "violet" | "neutral";
}

export interface TaskGroup {
  key: string;
  title: string;
  description: string;
  items: TaskItem[];
  moreHref?: string;
  total?: number;
}

/** Pusat Tugas: diturunkan langsung dari kondisi data, tidak pernah basi. */
export async function taskCenter(user: AuthUser): Promise<TaskGroup[]> {
  const now = new Date();
  const groups: TaskGroup[] = [];

  const assignments = await db.approvalAssignment.findMany({
    where: { approverUserId: user.id, status: "PENDING" },
    include: {
      step: {
        include: {
          instance: {
            include: { request: { select: { id: true, requestNumber: true, title: true, requester: { select: { fullName: true } } } } },
          },
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { activatedAt: "asc" }],
    take: 50,
  });
  groups.push({
    key: "approvals",
    title: "Menunggu persetujuan Anda",
    description: "Pengajuan atau perubahan yang memerlukan keputusan Anda.",
    items: assignments.map((a) => ({
      id: a.id,
      title: `${a.step.instance.request.requestNumber ?? ""} ${a.step.instance.request.title}`.trim(),
      description: `${APPROVAL_SUBJECT[a.step.instance.subjectType]} · ${a.step.name} · dari ${a.step.instance.request.requester.fullName}`,
      href: `/persetujuan/${a.id}`,
      due: a.dueAt,
      overdue: !!a.dueAt && a.dueAt < now,
      tone: a.dueAt && a.dueAt < now ? "danger" : "warning",
    })),
  });

  const [revisions, handovers, drafts] = await Promise.all([
    db.request.findMany({
      where: { requesterId: user.id, status: "REVISION_REQUIRED" },
      select: { id: true, requestNumber: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.handover.findMany({
      where: { status: "PREPARED", request: { requesterId: user.id } },
      include: { request: { select: { id: true, requestNumber: true, title: true } } },
    }),
    db.request.findMany({
      where: { requesterId: user.id, status: "DRAFT" },
      select: { id: true, requestNumber: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);
  groups.push({
    key: "mine",
    title: "Pengajuan saya",
    description: "Revisi yang diminta, barang yang perlu dikonfirmasi, dan draf yang belum dikirim.",
    items: [
      ...handovers.map((h) => ({
        id: h.id,
        title: `Konfirmasi penerimaan: ${h.request.requestNumber} ${h.request.title}`,
        description: `Serah terima ${h.handoverNumber}${h.location ? ` · ${h.location}` : ""}`,
        href: `/pengajuan/${h.request.id}#serah-terima`,
        tone: "violet" as const,
      })),
      ...revisions.map((r) => ({
        id: r.id,
        title: `Perlu revisi: ${r.requestNumber} ${r.title}`,
        description: "Perbaiki sesuai catatan approver lalu kirim ulang.",
        href: `/pengajuan/${r.id}`,
        tone: "danger" as const,
      })),
      ...drafts.map((d) => ({
        id: d.id,
        title: `Draf: ${d.title}`,
        description: "Belum dikirim.",
        href: `/pengajuan/${d.id}/edit`,
        tone: "neutral" as const,
      })),
    ],
  });

  if (can(user, PERMISSIONS.PURCHASING_MANAGE)) {
    const today = todayDateOnly();
    const [queue, readyHandover, latePos, onHoldPos, draftPos, readyToOrder, openDisc, cancellations, stale, receivedPos] = await Promise.all([
      queueRequestCount(),
      db.request.findMany({ where: { status: "READY_FOR_HANDOVER" }, select: { id: true, requestNumber: true, title: true }, take: 20 }),
      db.purchaseOrder.findMany({
        where: { status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] }, currentEta: { lt: today } },
        select: { id: true, poNumber: true, currentEta: true, vendor: { select: { name: true } } },
        take: 20,
      }),
      db.purchaseOrder.findMany({ where: { status: "ON_HOLD" }, select: { id: true, poNumber: true, holdReason: true }, take: 20 }),
      db.purchaseOrder.findMany({
        where: { status: "DRAFT", purchasingOwnerId: user.id },
        select: { id: true, poNumber: true, title: true, holdReason: true },
        take: 20,
      }),
      db.purchaseOrder.findMany({ where: { status: "READY_TO_ORDER" }, select: { id: true, poNumber: true, title: true }, take: 20 }),
      db.receiptDiscrepancy.count({ where: { status: "OPEN" } }),
      db.cancellationRequest.findMany({
        where: { status: "PENDING", approvalInstances: { none: { status: "IN_PROGRESS" } } },
        include: { request: { select: { id: true, requestNumber: true, title: true } } },
        take: 20,
      }),
      db.purchaseOrder.count({ where: { needsReviewAt: { not: null }, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
      db.purchaseOrder.findMany({
        where: { status: "RECEIVED", requestLinks: { every: { request: { status: { in: ["COMPLETED", "CANCELLED"] } } } } },
        select: { id: true, poNumber: true },
        take: 20,
      }),
    ]);
    const items: TaskItem[] = [];
    if (queue > 0) {
      items.push({ id: "queue", title: `${queue} pengajuan di antrean`, description: "Buat PO dari antrean purchasing.", href: "/purchasing/antrean", tone: "info" });
    }
    items.push(
      ...latePos.map((p) => ({
        id: p.id,
        title: `Terlambat: ${p.poNumber}`,
        description: `${p.vendor?.name ?? "-"} · ETA terlewati. Catat tindak lanjut.`,
        href: `/purchasing/po/${p.id}#tindak-lanjut`,
        tone: "danger" as const,
      })),
      ...onHoldPos.map((p) => ({
        id: p.id,
        title: `Ditahan: ${p.poNumber}`,
        description: p.holdReason ?? "Ada masalah barang.",
        href: `/purchasing/po/${p.id}#penerimaan`,
        tone: "danger" as const,
      })),
      ...readyHandover.map((r) => ({
        id: r.id,
        title: `Siapkan serah terima: ${r.requestNumber}`,
        description: r.title,
        href: `/pengajuan/${r.id}#serah-terima`,
        tone: "violet" as const,
      })),
      ...readyToOrder.map((p) => ({
        id: p.id,
        title: `Siap dipesan: ${p.poNumber}`,
        description: p.title ?? "Lengkapi bukti pemesanan lalu tandai dipesan.",
        href: `/purchasing/po/${p.id}`,
        tone: "info" as const,
      })),
      ...draftPos.map((p) => ({
        id: p.id,
        title: `Draf PO: ${p.poNumber}`,
        description: p.holdReason ?? p.title ?? "Lengkapi vendor, harga, dan penawaran.",
        href: `/purchasing/po/${p.id}`,
        tone: p.holdReason ? ("danger" as const) : ("neutral" as const),
      })),
      ...cancellations.map((c) => ({
        id: c.id,
        title: `Usulan pembatalan: ${c.request.requestNumber}`,
        description: c.reason,
        href: `/pengajuan/${c.request.id}`,
        tone: "warning" as const,
      })),
      ...receivedPos.map((p) => ({
        id: p.id,
        title: `Siap ditutup: ${p.poNumber}`,
        description: "Semua serah terima selesai.",
        href: `/purchasing/po/${p.id}`,
        tone: "info" as const,
      })),
    );
    if (openDisc > 0) {
      items.push({ id: "disc", title: `${openDisc} masalah barang terbuka`, description: "Ajukan penyelesaian.", href: "/purchasing/po?status=ON_HOLD", tone: "danger" });
    }
    if (stale > 0) {
      items.push({ id: "stale", title: `${stale} PO perlu ditinjau`, description: "Tidak ada aktivitas dalam waktu lama.", href: "/purchasing/po?review=1", tone: "warning" });
    }
    groups.push({ key: "purchasing", title: "Purchasing", description: "Pekerjaan pembelian yang perlu ditindaklanjuti.", items });
  }

  if (can(user, PERMISSIONS.USER_MANAGE) || can(user, PERMISSIONS.APPROVAL_RULE_MANAGE)) {
    const [pendingUsers, onHold, failedEmails] = await Promise.all([
      can(user, PERMISSIONS.USER_MANAGE)
        ? db.user.findMany({ where: { accountStatus: "PENDING_ACTIVATION" }, select: { id: true, fullName: true, username: true, createdAt: true }, take: 20 })
        : Promise.resolve([]),
      can(user, PERMISSIONS.APPROVAL_RULE_MANAGE)
        ? db.request.findMany({ where: { status: "ON_HOLD" }, select: { id: true, requestNumber: true, title: true, holdReason: true }, take: 20 })
        : Promise.resolve([]),
      can(user, PERMISSIONS.SETTINGS_MANAGE) ? db.emailOutbox.count({ where: { status: "FAILED" } }) : Promise.resolve(0),
    ]);
    groups.push({
      key: "admin",
      title: "Administrasi",
      description: "Akun yang menunggu aktivasi dan pengajuan yang tertahan konfigurasi.",
      items: [
        ...pendingUsers.map((u) => ({
          id: u.id,
          title: `Aktivasi akun: ${u.fullName}`,
          description: `@${u.username} mendaftar dan menunggu verifikasi.`,
          href: `/admin/pengguna/${u.id}`,
          tone: "warning" as const,
        })),
        ...onHold.map((r) => ({
          id: r.id,
          title: `Pengajuan ditahan: ${r.requestNumber}`,
          description: r.holdReason ?? r.title,
          href: `/pengajuan/${r.id}`,
          tone: "danger" as const,
        })),
        ...(failedEmails > 0
          ? [{ id: "emails", title: `${failedEmails} email gagal terkirim`, description: "Periksa konfigurasi SMTP.", href: "/admin/email", tone: "danger" as const }]
          : []),
      ],
    });
  }
  return groups;
}
