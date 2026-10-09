import { createHash, randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { db, type DbOrTx, type Tx } from "@/server/db";
import type { ActorContext } from "@/server/context";
import type { AuthUser } from "@/server/auth/user";
import type { DocumentType } from "@/generated/prisma/enums";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/server/settings";
import { audit } from "@/server/audit";
import { transaction } from "@/server/idempotency";
import { storage, type UploadTarget } from "@/server/storage";
import { ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { canViewRequestDetail } from "@/server/modules/requests/access";

export type DocumentParentType = "request" | "quote" | "po" | "receipt" | "handover" | "discrepancy";

const PARENT_FIELD: Record<DocumentParentType, "requestId" | "vendorQuoteId" | "purchaseOrderId" | "goodsReceiptId" | "handoverId" | "discrepancyId"> = {
  request: "requestId",
  quote: "vendorQuoteId",
  po: "purchaseOrderId",
  receipt: "goodsReceiptId",
  handover: "handoverId",
  discrepancy: "discrepancyId",
};

const ALLOWED_TYPES: Record<DocumentParentType, DocumentType[]> = {
  request: ["REQUEST_ATTACHMENT", "OTHER"],
  quote: ["VENDOR_QUOTE"],
  po: ["ORDER_PROOF", "OTHER"],
  receipt: ["DELIVERY_NOTE", "RECEIPT_EVIDENCE", "OTHER"],
  handover: ["HANDOVER_PROOF", "OTHER"],
  discrepancy: ["DISCREPANCY_EVIDENCE", "OTHER"],
};

const CLOSED_PO = ["CLOSED", "CANCELLED"];

/** Apakah pengguna boleh menambah dokumen pada induk tertentu. */
async function assertCanAttach(tx: DbOrTx, user: AuthUser, parentType: DocumentParentType, parentId: string) {
  const purchasing = can(user, PERMISSIONS.PURCHASING_MANAGE);
  switch (parentType) {
    case "request": {
      const r = await tx.request.findUnique({ where: { id: parentId } });
      if (!r) throw new NotFoundError();
      const own = r.requesterId === user.id && (r.status === "DRAFT" || r.status === "REVISION_REQUIRED");
      if (!own && !purchasing) throw new ForbiddenError("Lampiran hanya dapat ditambahkan saat pengajuan berstatus Draf/Perlu Revisi.");
      return;
    }
    case "quote": {
      const q = await tx.vendorQuote.findUnique({ where: { id: parentId }, include: { purchaseOrder: true } });
      if (!q) throw new NotFoundError();
      if (!purchasing || CLOSED_PO.includes(q.purchaseOrder.status)) throw new ForbiddenError();
      return;
    }
    case "po": {
      const po = await tx.purchaseOrder.findUnique({ where: { id: parentId } });
      if (!po) throw new NotFoundError();
      if (!purchasing || CLOSED_PO.includes(po.status)) throw new ForbiddenError();
      return;
    }
    case "receipt":
    case "discrepancy": {
      if (!purchasing) throw new ForbiddenError();
      const exists =
        parentType === "receipt"
          ? await tx.goodsReceipt.count({ where: { id: parentId } })
          : await tx.receiptDiscrepancy.count({ where: { id: parentId } });
      if (!exists) throw new NotFoundError();
      return;
    }
    case "handover": {
      const h = await tx.handover.findUnique({ where: { id: parentId }, include: { request: true } });
      if (!h) throw new NotFoundError();
      const requester = h.request.requesterId === user.id && h.status === "PREPARED";
      if (!purchasing && !requester) throw new ForbiddenError();
      return;
    }
  }
}

export interface UploadRequest {
  parentType: DocumentParentType;
  parentId: string;
  documentType: DocumentType;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  description?: string | null;
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return (cleaned || "dokumen").slice(0, 200);
}

function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? `.${m[1].toLowerCase()}` : "";
}

/** Langkah 1: daftarkan dokumen & dapatkan URL unggah langsung. */
export async function requestUpload(ctx: ActorContext, input: UploadRequest): Promise<{ documentId: string; upload: UploadTarget }> {
  const settings = await getSettings();
  const maxBytes = settings["documents.max_file_mb"] * 1024 * 1024;
  if (!ALLOWED_TYPES[input.parentType]?.includes(input.documentType)) throw new ValidationError("Jenis dokumen tidak sesuai.");
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) throw new ValidationError("Ukuran file tidak valid.");
  if (input.sizeBytes > maxBytes) throw new ValidationError(`Ukuran file maksimal ${settings["documents.max_file_mb"]} MB.`);
  if (!settings["documents.allowed_mime_types"].includes(input.mimeType)) {
    throw new ValidationError("Jenis file tidak diizinkan. Gunakan PDF, gambar (JPG/PNG/WEBP), Excel, atau Word.");
  }
  await assertCanAttach(db, ctx.user, input.parentType, input.parentId);

  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}${extensionOf(input.filename)}`;
  const doc = await db.document.create({
    data: {
      storageKey: key,
      originalFilename: safeFilename(input.filename),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      documentType: input.documentType,
      description: input.description?.slice(0, 500) || null,
      uploadedById: ctx.user.id,
      uploadStatus: "PENDING",
      [PARENT_FIELD[input.parentType]]: input.parentId,
    },
  });
  const upload = await storage().createUploadTarget(key, input.mimeType, doc.id);
  return { documentId: doc.id, upload };
}

/** Langkah 2: verifikasi isi file (bukan sekadar ekstensi) lalu tandai siap. */
export async function completeUpload(ctx: ActorContext, documentId: string) {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.uploadedById !== ctx.user.id) throw new NotFoundError("Dokumen tidak ditemukan.");
  if (doc.uploadStatus === "READY") return { id: doc.id };
  const settings = await getSettings();
  const data = await storage().read(doc.storageKey);
  const fail = async (message: string) => {
    await storage().remove(doc.storageKey).catch(() => undefined);
    await db.document.delete({ where: { id: doc.id } }).catch(() => undefined);
    throw new ValidationError(message);
  };
  if (!data) return fail("File belum terunggah. Coba unggah ulang.");
  if (data.length > settings["documents.max_file_mb"] * 1024 * 1024) return fail("Ukuran file melebihi batas.");
  const detected = await fileTypeFromBuffer(data);
  const mime = detected?.mime ?? "";
  if (!settings["documents.allowed_mime_types"].includes(mime)) {
    return fail("Isi file tidak sesuai jenis yang diizinkan (PDF, JPG, PNG, WEBP, XLSX, DOCX).");
  }
  const sha256 = createHash("sha256").update(data).digest("hex");
  await transaction(async (tx) => {
    await tx.document.update({
      where: { id: doc.id },
      data: { uploadStatus: "READY", sizeBytes: data.length, mimeType: mime, sha256 },
    });
    await audit(tx, ctx, {
      action: "document.upload",
      entityType: "document",
      entityId: doc.id,
      newValues: { filename: doc.originalFilename, type: doc.documentType, size: data.length },
    });
  });
  return { id: doc.id };
}

/** Driver lokal: menulis isi file yang dikirim browser (dipanggil route upload). */
export async function writeLocalUpload(ctx: ActorContext, documentId: string, body: Buffer) {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.uploadedById !== ctx.user.id || doc.uploadStatus !== "PENDING") throw new NotFoundError();
  if (body.length > doc.sizeBytes + 1024) throw new ValidationError("Ukuran file tidak sesuai.");
  await storage().write(doc.storageKey, body, doc.mimeType);
}

/** Hak melihat/mengunduh dokumen. */
export async function canViewDocument(tx: DbOrTx, user: AuthUser, documentId: string): Promise<boolean> {
  const doc = await tx.document.findUnique({
    where: { id: documentId },
    include: {
      request: true,
      vendorQuote: { select: { purchaseOrderId: true } },
      goodsReceipt: { select: { purchaseOrderId: true } },
      handover: { include: { request: true } },
      discrepancy: { select: { purchaseOrderId: true } },
    },
  });
  if (!doc || doc.deletedAt || doc.uploadStatus !== "READY") return false;
  if (can(user, PERMISSIONS.DOCUMENT_VIEW_ALL)) return true;
  if (doc.uploadedById === user.id) return true;
  const settings = await getSettings();
  const requesterVisible = settings["documents.requester_visible_types"];

  if (doc.request) {
    if (!(await canViewRequestDetail(tx, user, doc.request))) return false;
    if (doc.request.requesterId === user.id) return requesterVisible.includes(doc.documentType);
    return doc.documentType === "REQUEST_ATTACHMENT" || requesterVisible.includes(doc.documentType);
  }
  if (doc.handover) {
    return doc.handover.request.requesterId === user.id || (await canViewRequestDetail(tx, user, doc.handover.request));
  }
  const poId = doc.purchaseOrderId ?? doc.vendorQuote?.purchaseOrderId ?? doc.goodsReceipt?.purchaseOrderId ?? doc.discrepancy?.purchaseOrderId;
  if (!poId) return false;
  // Approver perubahan harga perlu melihat penawaran vendor sebagai dasar keputusan.
  if (doc.documentType === "VENDOR_QUOTE") {
    const isChangeApprover = await tx.approvalAssignment.count({
      where: { approverUserId: user.id, step: { instance: { subjectType: "CHANGE_REQUEST", changeRequest: { purchaseOrderId: poId } } } },
    });
    if (isChangeApprover) return true;
  }
  // Pemohon dapat melihat jenis dokumen tertentu pada PO yang memuat pengajuannya.
  if (requesterVisible.includes(doc.documentType)) {
    const linked = await tx.purchaseOrderRequest.count({ where: { purchaseOrderId: poId, request: { requesterId: user.id } } });
    if (linked) return true;
  }
  return false;
}

export async function getDownload(ctx: ActorContext, documentId: string) {
  if (!(await canViewDocument(db, ctx.user, documentId))) throw new ForbiddenError("Anda tidak berhak mengunduh dokumen ini.");
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });
  await audit(db, ctx, {
    action: "document.download",
    entityType: "document",
    entityId: doc.id,
    newValues: { filename: doc.originalFilename },
  });
  const url = await storage().createDownloadUrl(doc.storageKey, doc.originalFilename, 60);
  if (url) return { kind: "redirect" as const, url };
  const data = await storage().read(doc.storageKey);
  if (!data) throw new NotFoundError("Berkas tidak ditemukan di penyimpanan.");
  return { kind: "inline" as const, data, filename: doc.originalFilename, mimeType: doc.mimeType };
}

/** Soft delete: berkas tetap disimpan untuk jejak audit. */
export async function deleteDocument(ctx: ActorContext, documentId: string, reason?: string | null) {
  return transaction(async (tx) => {
    const doc = await tx.document.findUnique({ where: { id: documentId }, include: { request: true, purchaseOrder: true } });
    if (!doc || doc.deletedAt) throw new NotFoundError();
    const purchasing = can(ctx.user, PERMISSIONS.PURCHASING_MANAGE);
    const ownDraftAttachment =
      doc.uploadedById === ctx.user.id && doc.request && ["DRAFT", "REVISION_REQUIRED"].includes(doc.request.status);
    if (!ownDraftAttachment && !purchasing) throw new ForbiddenError();
    if (doc.purchaseOrder && CLOSED_PO.includes(doc.purchaseOrder.status)) {
      throw new RuleError("Dokumen PO yang sudah ditutup/dibatalkan tidak dapat dihapus.");
    }
    await tx.document.update({ where: { id: doc.id }, data: { deletedAt: new Date(), deletedById: ctx.user.id } });
    await audit(tx, ctx, {
      action: "document.delete",
      entityType: "document",
      entityId: doc.id,
      oldValues: { filename: doc.originalFilename, type: doc.documentType },
      reason,
    });
  });
}

/** Menghapus baris dokumen draf (draf yang belum pernah dikirim) dan mengembalikan kunci berkas. */
export async function removeDocumentsOfDraft(tx: Tx, requestId: string): Promise<string[]> {
  const docs = await tx.document.findMany({ where: { requestId }, select: { storageKey: true } });
  await tx.document.deleteMany({ where: { requestId } });
  return docs.map((d) => d.storageKey);
}

export async function removeStoredFiles(keys: string[]) {
  await Promise.all(keys.map((k) => storage().remove(k).catch(() => undefined)));
}

export interface DocumentView {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  documentType: DocumentType;
  description: string | null;
  uploadedByName: string;
  uploadedById: string;
  createdAt: Date;
}

/** Daftar dokumen siap untuk sebuah induk, sudah difilter sesuai hak akses. */
export async function listDocuments(user: AuthUser, parentType: DocumentParentType, parentId: string): Promise<DocumentView[]> {
  const docs = await db.document.findMany({
    where: { [PARENT_FIELD[parentType]]: parentId, uploadStatus: "READY", deletedAt: null },
    include: { uploadedBy: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  const visible: DocumentView[] = [];
  for (const d of docs) {
    if (await canViewDocument(db, user, d.id)) {
      visible.push({
        id: d.id,
        originalFilename: d.originalFilename,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        documentType: d.documentType,
        description: d.description,
        uploadedByName: d.uploadedBy.fullName,
        uploadedById: d.uploadedById,
        createdAt: d.createdAt,
      });
    }
  }
  return visible;
}
