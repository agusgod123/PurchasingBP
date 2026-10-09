import type { Tx } from "@/server/db";
import type { ActorContext } from "@/server/context";
import type { Priority, PurchaseOrderStatus, RequestStatus } from "@/generated/prisma/enums";
import { audit } from "@/server/audit";
import { withIdempotency, transaction } from "@/server/idempotency";
import { nextNumber, DOC_PREFIX } from "@/server/numbering";
import { dec, lineTotal, sum } from "@/server/money";
import { dateOnly, dateKeyInTz } from "@/server/time";
import { getSettings } from "@/server/settings";
import { notify } from "@/server/notifications/notify";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { REQUEST_STATUS } from "@/lib/status";
import { requestDraftInput, requestSubmitShape, type RequestDraftInput } from "@/lib/schemas/request";
import { ConflictError, ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { startApproval, cancelApproval, findActiveInstance } from "@/server/modules/approvals/engine";
import { checkDocumentRequirements, unmetMessages } from "@/server/modules/documents/requirements";
import { budgetStatus } from "@/server/modules/budget";
import { canViewRequestDetail } from "@/server/modules/requests/access";
import { removeDocumentsOfDraft } from "@/server/modules/documents/service";

// ---------------------------------------------------------------------------
// Transisi status
// ---------------------------------------------------------------------------

const ALLOWED: Record<RequestStatus, RequestStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "ON_HOLD", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REVISION_REQUIRED", "DRAFT", "ON_HOLD", "CANCELLED"],
  ON_HOLD: ["PENDING_APPROVAL", "APPROVED", "ON_HOLD", "DRAFT", "CANCELLED"],
  REVISION_REQUIRED: ["PENDING_APPROVAL", "ON_HOLD", "APPROVED", "CANCELLED"],
  APPROVED: ["IN_PROCUREMENT", "CANCELLATION_REQUESTED", "CANCELLED"],
  IN_PROCUREMENT: ["READY_FOR_HANDOVER", "APPROVED", "CANCELLATION_REQUESTED", "CANCELLED"],
  READY_FOR_HANDOVER: ["AWAITING_CONFIRMATION", "IN_PROCUREMENT"],
  AWAITING_CONFIRMATION: ["COMPLETED", "READY_FOR_HANDOVER"],
  CANCELLATION_REQUESTED: ["CANCELLED", "APPROVED", "IN_PROCUREMENT"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function setRequestStatus(
  tx: Tx,
  ctx: ActorContext | null,
  requestId: string,
  from: RequestStatus,
  to: RequestStatus,
  reason?: string | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!ALLOWED[from].includes(to)) {
    throw new RuleError(`Perubahan status dari "${REQUEST_STATUS[from].label}" ke "${REQUEST_STATUS[to].label}" tidak diizinkan.`);
  }
  const now = new Date();
  const res = await tx.request.updateMany({
    where: { id: requestId, status: from },
    data: { status: to, lastActivityAt: now, needsReviewAt: null, lockVersion: { increment: 1 }, ...extra },
  });
  if (res.count === 0) throw new ConflictError();
  await tx.requestStatusHistory.create({
    data: { requestId, fromStatus: from, toStatus: to, changedById: ctx?.user.id ?? null, reason: reason ?? null, changedAt: now },
  });
}

// ---------------------------------------------------------------------------
// Draf
// ---------------------------------------------------------------------------

function normalizeItems(items: ReturnType<typeof requestDraftInput.parse>["items"]) {
  return items.map((it, idx) => ({
    id: it.id,
    lineNo: idx + 1,
    catalogItemId: it.catalogItemId ?? null,
    categoryId: it.categoryId ?? null,
    itemName: it.itemName,
    specification: it.specification,
    quantity: dec(it.quantity),
    unitName: it.unitName,
    estimatedUnitPrice: dec(it.estimatedUnitPrice),
    reason: it.reason || null,
    neededDate: it.neededDate ? dateOnly(it.neededDate) : null,
  }));
}

async function writeItems(tx: Tx, requestId: string, items: ReturnType<typeof normalizeItems>) {
  const existing = await tx.requestItem.findMany({ where: { requestId }, select: { id: true } });
  const keep = new Set(items.filter((i) => i.id).map((i) => i.id!));
  const toDelete = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
  if (toDelete.length) await tx.requestItem.deleteMany({ where: { id: { in: toDelete } } });
  const itemIds: string[] = [];
  for (const it of items) {
    const { id, ...data } = it;
    if (id && existing.some((e) => e.id === id)) {
      await tx.requestItem.update({ where: { id }, data });
      itemIds.push(id);
    } else {
      const created = await tx.requestItem.create({ data: { ...data, requestId } });
      itemIds.push(created.id);
    }
  }
  const total = sum(items.map((i) => lineTotal(i.quantity, i.estimatedUnitPrice)));
  return { total, itemIds };
}

export async function createDraft(ctx: ActorContext, input: RequestDraftInput, idempotencyKey?: string) {
  if (!can(ctx.user, PERMISSIONS.REQUEST_CREATE)) throw new ForbiddenError();
  if (!ctx.user.departmentId) {
    throw new RuleError("Akun Anda belum terhubung ke data pegawai/bagian. Hubungi Admin.");
  }
  const data = requestDraftInput.parse(input);
  return withIdempotency(ctx.user.id, idempotencyKey, "request.create", async (tx) => {
    const request = await tx.request.create({
      data: {
        requesterId: ctx.user.id,
        departmentId: ctx.user.departmentId!,
        title: data.title || "Pengajuan baru",
        generalReason: data.generalReason,
        requestedPriority: data.requestedPriority,
        neededDate: data.neededDate ? dateOnly(data.neededDate) : dateOnly(dateKeyInTz()),
      },
    });
    const { total, itemIds } = await writeItems(tx, request.id, normalizeItems(data.items));
    await tx.request.update({ where: { id: request.id }, data: { estimatedTotal: total } });
    await tx.requestStatusHistory.create({
      data: { requestId: request.id, fromStatus: null, toStatus: "DRAFT", changedById: ctx.user.id },
    });
    await audit(tx, ctx, { action: "request.create", entityType: "request", entityId: request.id });
    return { id: request.id, lockVersion: 0, itemIds };
  });
}

async function loadOwnEditable(tx: Tx, ctx: ActorContext, requestId: string) {
  const req = await tx.request.findUnique({ where: { id: requestId } });
  if (!req) throw new NotFoundError("Pengajuan tidak ditemukan.");
  if (req.requesterId !== ctx.user.id) throw new ForbiddenError("Hanya pemohon yang dapat mengubah pengajuan ini.");
  if (req.status !== "DRAFT" && req.status !== "REVISION_REQUIRED") {
    throw new RuleError("Pengajuan hanya dapat diubah saat berstatus Draf atau Perlu Revisi. Tarik pengajuan terlebih dahulu.");
  }
  return req;
}

export async function updateDraft(ctx: ActorContext, requestId: string, input: RequestDraftInput, lockVersion: number) {
  const data = requestDraftInput.parse(input);
  return transaction(async (tx) => {
    const req = await loadOwnEditable(tx, ctx, requestId);
    if (req.lockVersion !== lockVersion) throw new ConflictError();
    const { total, itemIds } = await writeItems(tx, requestId, normalizeItems(data.items));
    const updated = await tx.request.update({
      where: { id: requestId },
      data: {
        title: data.title || req.title,
        generalReason: data.generalReason,
        requestedPriority: data.requestedPriority,
        neededDate: data.neededDate ? dateOnly(data.neededDate) : req.neededDate,
        estimatedTotal: total,
        lastActivityAt: new Date(),
        lockVersion: { increment: 1 },
      },
    });
    return { id: requestId, lockVersion: updated.lockVersion, itemIds };
  });
}

/** Draf yang belum pernah dikirim boleh dihapus permanen; selain itu gunakan pembatalan. */
export async function deleteDraft(ctx: ActorContext, requestId: string) {
  const docs = await transaction(async (tx) => {
    const req = await loadOwnEditable(tx, ctx, requestId);
    if (req.status !== "DRAFT" || req.requestNumber || req.currentVersionNumber > 0) {
      throw new RuleError("Pengajuan yang sudah pernah dikirim tidak dapat dihapus. Gunakan Batalkan.");
    }
    const keys = await removeDocumentsOfDraft(tx, requestId);
    await tx.request.delete({ where: { id: requestId } });
    await audit(tx, ctx, { action: "request.delete_draft", entityType: "request", entityId: requestId, oldValues: { title: req.title } });
    return keys;
  });
  return docs;
}

// ---------------------------------------------------------------------------
// Kirim / tarik / proses ulang
// ---------------------------------------------------------------------------

function itemsSignature(items: Array<{ itemName: string; specification: string; quantity: unknown; estimatedUnitPrice: unknown }>) {
  return items.map((i) => ({
    key: `${i.itemName.trim().toLowerCase()}|${i.specification.trim().toLowerCase()}`,
    qty: dec(i.quantity as string),
    price: dec(i.estimatedUnitPrice as string),
  }));
}

/**
 * Persetujuan versi sebelumnya boleh dibawa jika perubahan tidak menambah
 * risiko: total tidak naik, tidak ada item baru, dan tidak ada item yang
 * kuantitas/harganya naik atau nama/spesifikasinya berubah.
 */
function isNonIncreasingRevision(
  prevItems: Array<{ itemNameSnapshot: string; specificationSnapshot: string; quantitySnapshot: unknown; estimatedUnitPriceSnapshot: unknown }>,
  nextItems: Array<{ itemName: string; specification: string; quantity: unknown; estimatedUnitPrice: unknown }>,
  prevTotal: unknown,
  nextTotal: unknown,
): boolean {
  if (dec(nextTotal as string).gt(dec(prevTotal as string))) return false;
  const prev = itemsSignature(
    prevItems.map((p) => ({
      itemName: p.itemNameSnapshot,
      specification: p.specificationSnapshot,
      quantity: p.quantitySnapshot,
      estimatedUnitPrice: p.estimatedUnitPriceSnapshot,
    })),
  );
  for (const n of itemsSignature(nextItems)) {
    const match = prev.find((p) => p.key === n.key);
    if (!match) return false;
    if (n.qty.gt(match.qty) || n.price.gt(match.price)) return false;
  }
  return true;
}

export interface SubmitResult {
  id: string;
  requestNumber: string;
  status: RequestStatus;
  holdReason?: string;
  budgetWarning?: string;
}

export async function submitRequest(
  ctx: ActorContext,
  requestId: string,
  opts: { lockVersion: number; changeSummary?: string | null; idempotencyKey?: string },
): Promise<SubmitResult> {
  return withIdempotency(ctx.user.id, opts.idempotencyKey, `request.submit:${requestId}`, async (tx) => {
    const req = await loadOwnEditable(tx, ctx, requestId);
    if (req.lockVersion !== opts.lockVersion) throw new ConflictError();
    const items = await tx.requestItem.findMany({ where: { requestId }, orderBy: { lineNo: "asc" } });

    // Validasi lengkap.
    const parsed = requestSubmitShape.safeParse({
      title: req.title,
      generalReason: req.generalReason,
      requestedPriority: req.requestedPriority,
      neededDate: req.neededDate.toISOString().slice(0, 10),
      items: items.map((i) => ({
        itemName: i.itemName,
        specification: i.specification,
        quantity: i.quantity.toString(),
        unitName: i.unitName,
        estimatedUnitPrice: i.estimatedUnitPrice.toString(),
        reason: i.reason,
        neededDate: i.neededDate ? i.neededDate.toISOString().slice(0, 10) : null,
      })),
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      throw new ValidationError("Pengajuan belum lengkap. Periksa isian yang ditandai.", fieldErrors);
    }
    const today = dateKeyInTz();
    if (req.neededDate.toISOString().slice(0, 10) < today) {
      throw new ValidationError("Tanggal dibutuhkan tidak boleh di masa lalu.", { neededDate: "Tanggal sudah lewat" });
    }
    const docChecks = await checkDocumentRequirements(tx, "REQUEST_SUBMIT", { requestId, amount: req.estimatedTotal });
    const unmet = unmetMessages(docChecks);
    if (unmet.length) throw new RuleError(`Dokumen wajib belum lengkap: ${unmet.join("; ")}.`);

    const total = sum(items.map((i) => lineTotal(i.quantity, i.estimatedUnitPrice)));
    const requestNumber = req.requestNumber ?? (await nextNumber(tx, DOC_PREFIX.REQUEST));
    const versionNumber = req.currentVersionNumber + 1;

    // Versi sebelumnya + instance sebelumnya (untuk aturan "hanya approver terdampak").
    const settings = await getSettings();
    let carryOverFromInstanceId: string | null = null;
    if (settings["approval.reapproval_policy"] === "AFFECTED_ONLY" && req.currentVersionNumber > 0) {
      const prevVersion = await tx.requestVersion.findUnique({
        where: { requestId_versionNumber: { requestId, versionNumber: req.currentVersionNumber } },
        include: { items: true },
      });
      const prevInstance = await tx.approvalInstance.findFirst({
        where: { requestId, subjectType: "REQUEST" },
        orderBy: { startedAt: "desc" },
      });
      if (prevVersion && prevInstance && isNonIncreasingRevision(prevVersion.items, items, prevVersion.estimatedTotalSnapshot, total)) {
        carryOverFromInstanceId = prevInstance.id;
      }
    }

    const version = await tx.requestVersion.create({
      data: {
        requestId,
        versionNumber,
        titleSnapshot: req.title,
        generalReasonSnapshot: req.generalReason,
        neededDateSnapshot: req.neededDate,
        requestedPrioritySnapshot: req.requestedPriority,
        estimatedTotalSnapshot: total,
        submittedById: ctx.user.id,
        changeSummary: opts.changeSummary?.trim() || (versionNumber > 1 ? null : "Pengajuan awal"),
        items: {
          create: items.map((i) => ({
            sourceRequestItemId: i.id,
            catalogItemId: i.catalogItemId,
            categoryIdSnapshot: i.categoryId,
            lineNo: i.lineNo,
            itemNameSnapshot: i.itemName,
            specificationSnapshot: i.specification,
            quantitySnapshot: i.quantity,
            unitNameSnapshot: i.unitName,
            estimatedUnitPriceSnapshot: i.estimatedUnitPrice,
            reasonSnapshot: i.reason,
            neededDateSnapshot: i.neededDate,
          })),
        },
      },
    });

    const now = new Date();
    await tx.request.update({
      where: { id: requestId },
      data: {
        requestNumber,
        currentVersionNumber: versionNumber,
        estimatedTotal: total,
        submittedAt: req.submittedAt ?? now,
        holdReason: null,
      },
    });

    let budgetWarning: string | undefined;
    let overBudget = false;
    if (settings["budget.warning_enabled"]) {
      const b = await budgetStatus(tx, req.departmentId, total, { excludeRequestId: requestId });
      if (b.budget && b.exceeded) {
        overBudget = true;
        budgetWarning = "Nilai pengajuan melampaui sisa anggaran bagian. Persetujuan tambahan dapat diperlukan.";
      }
    }

    const started = await startApproval(tx, ctx, {
      subjectType: "REQUEST",
      requestId,
      requestVersionId: version.id,
      amount: total,
      overBudget,
      initiatorId: ctx.user.id,
      carryOverFromInstanceId,
    });

    const target: RequestStatus =
      started.status === "ON_HOLD" ? "ON_HOLD" : started.status === "APPROVED" ? "APPROVED" : "PENDING_APPROVAL";
    await setRequestStatus(
      tx,
      ctx,
      requestId,
      req.status,
      target,
      versionNumber > 1 ? `Dikirim ulang (versi ${versionNumber})` : "Pengajuan dikirim",
      target === "ON_HOLD" ? { holdReason: started.holdReason } : target === "APPROVED" ? { approvedAt: now } : {},
    );
    await audit(tx, ctx, {
      action: "request.submit",
      entityType: "request",
      entityId: requestId,
      newValues: { requestNumber, version: versionNumber, total: total.toString(), rule: started.ruleName, status: target },
    });

    if (target === "ON_HOLD") await notifyHold(tx, requestId, requestNumber, req.title, started.holdReason);
    if (target === "APPROVED") await onRequestApproved(tx, ctx, requestId);

    return { id: requestId, requestNumber, status: target, holdReason: started.holdReason, budgetWarning };
  });
}

async function notifyHold(tx: Tx, requestId: string, number: string | null, title: string, reason?: string) {
  const admins = await tx.user.findMany({
    where: {
      accountStatus: "ACTIVE",
      roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.APPROVAL_RULE_MANAGE } } } } } },
    },
    select: { id: true },
  });
  const req = await tx.request.findUniqueOrThrow({ where: { id: requestId }, select: { requesterId: true } });
  await notify(tx, {
    recipientIds: [...admins.map((a) => a.id), req.requesterId],
    type: "REQUEST_ON_HOLD",
    title: `Pengajuan ditahan: ${number ?? ""} ${title}`.trim(),
    body: `Jalur persetujuan tidak dapat ditentukan. ${reason ?? ""}`.trim(),
    link: `/pengajuan/${requestId}`,
    requestId,
    mandatory: true,
  });
}

/** Menarik pengajuan yang sedang diproses agar dapat diedit (FR-REQ-09). */
export async function withdrawRequest(ctx: ActorContext, requestId: string, reason?: string | null) {
  return transaction(async (tx) => {
    const req = await tx.request.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundError();
    if (req.requesterId !== ctx.user.id) throw new ForbiddenError("Hanya pemohon yang dapat menarik pengajuan.");
    if (req.status !== "PENDING_APPROVAL" && req.status !== "ON_HOLD") {
      throw new RuleError("Hanya pengajuan yang menunggu persetujuan atau ditahan yang dapat ditarik.");
    }
    const active = await findActiveInstance(tx, { requestId, subjectType: "REQUEST" });
    if (active) await cancelApproval(tx, active.id, "Pengajuan ditarik pemohon.");
    await setRequestStatus(tx, ctx, requestId, req.status, "DRAFT", reason?.trim() || "Ditarik untuk diedit", { holdReason: null });
    await audit(tx, ctx, { action: "request.withdraw", entityType: "request", entityId: requestId, reason });
    return { id: requestId };
  });
}

/** Admin memproses ulang jalur persetujuan setelah konfigurasi diperbaiki. */
export async function rerouteRequest(ctx: ActorContext, requestId: string) {
  if (!can(ctx.user, PERMISSIONS.APPROVAL_RULE_MANAGE)) throw new ForbiddenError();
  return transaction(async (tx) => {
    const req = await tx.request.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundError();
    if (req.status !== "ON_HOLD") throw new RuleError("Hanya pengajuan berstatus Ditahan yang dapat diproses ulang.");
    const version = await tx.requestVersion.findUniqueOrThrow({
      where: { requestId_versionNumber: { requestId, versionNumber: req.currentVersionNumber } },
    });
    const active = await findActiveInstance(tx, { requestId, subjectType: "REQUEST" });
    if (active) await cancelApproval(tx, active.id, "Diproses ulang oleh admin.");
    const settings = await getSettings();
    let overBudget = false;
    if (settings["budget.warning_enabled"]) {
      const b = await budgetStatus(tx, req.departmentId, req.estimatedTotal, { excludeRequestId: requestId });
      overBudget = !!b.budget && b.exceeded;
    }
    const started = await startApproval(tx, ctx, {
      subjectType: "REQUEST",
      requestId,
      requestVersionId: version.id,
      amount: req.estimatedTotal,
      overBudget,
      initiatorId: req.requesterId,
    });
    const target: RequestStatus =
      started.status === "ON_HOLD" ? "ON_HOLD" : started.status === "APPROVED" ? "APPROVED" : "PENDING_APPROVAL";
    await setRequestStatus(tx, ctx, requestId, "ON_HOLD", target, "Jalur persetujuan diproses ulang", {
      holdReason: target === "ON_HOLD" ? started.holdReason : null,
      ...(target === "APPROVED" ? { approvedAt: new Date() } : {}),
    });
    await audit(tx, ctx, { action: "request.reroute", entityType: "request", entityId: requestId, newValues: { status: target } });
    if (target === "APPROVED") await onRequestApproved(tx, ctx, requestId);
    return { status: target, holdReason: started.holdReason };
  });
}

// ---------------------------------------------------------------------------
// Hasil persetujuan (dipanggil oleh orkestrator keputusan)
// ---------------------------------------------------------------------------

export async function onRequestApproved(tx: Tx, ctx: ActorContext, requestId: string) {
  const req = await tx.request.findUniqueOrThrow({ where: { id: requestId } });
  if (req.status !== "APPROVED") {
    await setRequestStatus(tx, ctx, requestId, req.status, "APPROVED", "Semua persetujuan terpenuhi", { approvedAt: new Date() });
  }
  await notify(tx, {
    recipientIds: [req.requesterId],
    type: "REQUEST_APPROVED",
    title: `Pengajuan disetujui: ${req.requestNumber}`,
    body: `"${req.title}" telah disetujui dan masuk antrean Purchasing.`,
    link: `/pengajuan/${requestId}`,
    requestId,
  });
  const purchasing = await tx.user.findMany({
    where: {
      accountStatus: "ACTIVE",
      roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.PURCHASING_MANAGE } } } } } },
    },
    select: { id: true },
  });
  await notify(tx, {
    recipientIds: purchasing.map((p) => p.id),
    type: "REQUEST_QUEUED",
    title: `Antrean baru: ${req.requestNumber}`,
    body: `"${req.title}" siap diproses pembelian.`,
    link: `/purchasing/antrean`,
    requestId,
    excludeUserId: req.requesterId,
  });
}

export async function onRequestRejected(tx: Tx, ctx: ActorContext, requestId: string, comment: string | null) {
  const req = await tx.request.findUniqueOrThrow({ where: { id: requestId } });
  await setRequestStatus(tx, ctx, requestId, req.status, "REVISION_REQUIRED", comment);
  await notify(tx, {
    recipientIds: [req.requesterId],
    type: "REQUEST_REVISION",
    title: `Pengajuan perlu revisi: ${req.requestNumber}`,
    body: `${ctx.user.fullName} menolak / meminta revisi: ${comment ?? "-"}`,
    link: `/pengajuan/${requestId}`,
    requestId,
    mandatory: true,
  });
}

// ---------------------------------------------------------------------------
// Prioritas & komentar
// ---------------------------------------------------------------------------

export async function setFinalPriority(tx: Tx, ctx: ActorContext, requestId: string, priority: Priority) {
  if (!can(ctx.user, PERMISSIONS.REQUEST_SET_PRIORITY)) throw new ForbiddenError("Anda tidak berwenang menetapkan prioritas final.");
  const req = await tx.request.findUniqueOrThrow({ where: { id: requestId } });
  if (!(await canViewRequestDetail(tx, ctx.user, req))) throw new ForbiddenError();
  if (["COMPLETED", "CANCELLED", "DRAFT"].includes(req.status)) throw new RuleError("Prioritas tidak dapat diubah pada status ini.");
  if (req.finalPriority === priority) return;
  await tx.request.update({
    where: { id: requestId },
    data: { finalPriority: priority, finalPrioritySetById: ctx.user.id, lastActivityAt: new Date() },
  });
  await audit(tx, ctx, {
    action: "request.set_priority",
    entityType: "request",
    entityId: requestId,
    oldValues: { finalPriority: req.finalPriority },
    newValues: { finalPriority: priority },
  });
}

export async function addRequestComment(ctx: ActorContext, requestId: string, body: string) {
  const text = body.trim();
  if (text.length < 1) throw new ValidationError("Komentar tidak boleh kosong.");
  if (text.length > 4000) throw new ValidationError("Komentar terlalu panjang.");
  return transaction(async (tx) => {
    const req = await tx.request.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundError();
    if (!(await canViewRequestDetail(tx, ctx.user, req))) throw new ForbiddenError();
    const comment = await tx.comment.create({ data: { requestId, authorId: ctx.user.id, body: text } });
    await tx.request.update({ where: { id: requestId }, data: { lastActivityAt: new Date() } });
    const poOwners = await tx.purchaseOrder.findMany({
      where: { requestLinks: { some: { requestId } }, status: { not: "CANCELLED" } },
      select: { purchasingOwnerId: true },
    });
    const pendingApprovers = await tx.approvalAssignment.findMany({
      where: { status: "PENDING", step: { instance: { requestId } } },
      select: { approverUserId: true },
    });
    await notify(tx, {
      recipientIds: [req.requesterId, ...poOwners.map((p) => p.purchasingOwnerId), ...pendingApprovers.map((a) => a.approverUserId)],
      type: "COMMENT",
      title: `Komentar baru: ${req.requestNumber ?? req.title}`,
      body: `${ctx.user.fullName}: ${text.slice(0, 300)}`,
      link: `/pengajuan/${requestId}`,
      requestId,
      excludeUserId: ctx.user.id,
    });
    return { id: comment.id };
  });
}

// ---------------------------------------------------------------------------
// Sinkronisasi status pengadaan berdasarkan PO & penerimaan
// ---------------------------------------------------------------------------

const ACTIVE_PO: PurchaseOrderStatus[] = [
  "DRAFT",
  "PENDING_CHANGE_APPROVAL",
  "READY_TO_ORDER",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "ON_HOLD",
  "RECEIVED",
  "CLOSED",
];

export interface ItemFulfilment {
  requestItemId: string;
  required: ReturnType<typeof dec>;
  allocated: ReturnType<typeof dec>;
  received: ReturnType<typeof dec>;
  handedOver: ReturnType<typeof dec>;
  remainingToAllocate: ReturnType<typeof dec>;
}

/** Buku besar kuantitas per item: diminta → dialokasikan → diterima → diserahkan. */
export async function itemFulfilment(tx: Tx, requestId: string): Promise<ItemFulfilment[]> {
  const items = await tx.requestItem.findMany({
    where: { requestId },
    include: {
      purchaseOrderItems: {
        where: { purchaseOrder: { status: { in: ACTIVE_PO } } },
        include: { receiptItems: true },
      },
      handoverItems: { where: { handover: { status: { in: ["PREPARED", "CONFIRMED"] } } } },
    },
    orderBy: { lineNo: "asc" },
  });
  return items.map((it) => {
    const required = dec(it.quantity).minus(it.cancelledQuantity);
    const allocated = sum(it.purchaseOrderItems.map((p) => dec(p.quantityOrdered).minus(p.closedQuantity)));
    const received = sum(it.purchaseOrderItems.flatMap((p) => p.receiptItems.map((r) => r.quantityAccepted)));
    const handedOver = sum(it.handoverItems.map((h) => h.confirmedQuantity ?? h.quantity));
    const remaining = required.minus(allocated);
    return {
      requestItemId: it.id,
      required,
      allocated,
      received,
      handedOver,
      remainingToAllocate: remaining.gt(0) ? remaining : dec(0),
    };
  });
}

/**
 * Menyesuaikan status pengajuan (Antrean ↔ Dalam Pengadaan → Siap Serah Terima)
 * berdasarkan PO aktif dan penerimaan barang.
 */
export async function syncRequestProcurement(tx: Tx, ctx: ActorContext | null, requestId: string): Promise<RequestStatus> {
  const req = await tx.request.findUniqueOrThrow({ where: { id: requestId } });
  if (!["APPROVED", "IN_PROCUREMENT", "READY_FOR_HANDOVER"].includes(req.status)) return req.status;

  const poLines = await tx.purchaseOrderItem.findMany({
    where: { requestItem: { requestId }, purchaseOrder: { status: { in: ACTIVE_PO } } },
    select: { purchaseOrder: { select: { id: true, status: true } } },
  });
  const poStatuses = [...new Map(poLines.map((l) => [l.purchaseOrder.id, l.purchaseOrder.status])).values()];
  const openDiscrepancies = await tx.receiptDiscrepancy.count({
    where: { purchaseOrderItem: { requestItem: { requestId } }, status: { not: "RESOLVED" } },
  });
  const fulfil = await itemFulfilment(tx, requestId);
  const anyRequired = fulfil.some((f) => f.required.gt(0));
  const allReceived = anyRequired && fulfil.every((f) => f.received.gte(f.required));
  const allPosDone = poStatuses.length > 0 && poStatuses.every((s) => s === "RECEIVED" || s === "CLOSED");

  let target: RequestStatus;
  if (allReceived && allPosDone && openDiscrepancies === 0) target = "READY_FOR_HANDOVER";
  else if (poStatuses.length > 0) target = "IN_PROCUREMENT";
  else target = "APPROVED";

  if (target !== req.status) {
    // APPROVED → READY_FOR_HANDOVER tidak mungkin langsung; lewati IN_PROCUREMENT bila perlu.
    if (req.status === "APPROVED" && target === "READY_FOR_HANDOVER") {
      await setRequestStatus(tx, ctx, requestId, "APPROVED", "IN_PROCUREMENT", "Pembelian diproses");
      await setRequestStatus(tx, ctx, requestId, "IN_PROCUREMENT", target, "Seluruh barang diterima");
    } else {
      const reason =
        target === "IN_PROCUREMENT"
          ? req.status === "READY_FOR_HANDOVER"
            ? "Ada pesanan/masalah baru"
            : "Pembelian diproses"
          : target === "READY_FOR_HANDOVER"
            ? "Seluruh barang diterima"
            : "Kembali ke antrean purchasing";
      await setRequestStatus(tx, ctx, requestId, req.status, target, reason);
    }
  }
  return target;
}
