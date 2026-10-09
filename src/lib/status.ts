// Label, warna, dan tahap tampilan untuk status. Aman dipakai di client.
import type {
  ApprovalInstanceStatus,
  ApprovalStepStatus,
  AssignmentStatus,
  ChangeRequestStatus,
  DiscrepancyStatus,
  DiscrepancyType,
  DocumentStage,
  DocumentType,
  FollowupType,
  HandoverStatus,
  ItemCondition,
  Priority,
  PurchaseOrderStatus,
  RequestStatus,
  ResolutionType,
  TicketCategory,
  TicketStatus,
  ApproverType,
  RoutingMode,
  StepApprovalMode,
  ApprovalSubjectType,
  AccountStatus,
} from "@/generated/prisma/enums";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "violet";

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draf", tone: "neutral" },
  PENDING_APPROVAL: { label: "Menunggu Persetujuan", tone: "warning" },
  REVISION_REQUIRED: { label: "Perlu Revisi", tone: "danger" },
  ON_HOLD: { label: "Ditahan", tone: "danger" },
  APPROVED: { label: "Antrean Purchasing", tone: "info" },
  IN_PROCUREMENT: { label: "Dalam Pengadaan", tone: "info" },
  READY_FOR_HANDOVER: { label: "Siap Serah Terima", tone: "violet" },
  AWAITING_CONFIRMATION: { label: "Menunggu Konfirmasi", tone: "violet" },
  COMPLETED: { label: "Selesai", tone: "success" },
  CANCELLATION_REQUESTED: { label: "Pembatalan Diajukan", tone: "warning" },
  CANCELLED: { label: "Dibatalkan", tone: "neutral" },
};

export const PO_STATUS: Record<PurchaseOrderStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draf", tone: "neutral" },
  PENDING_CHANGE_APPROVAL: { label: "Menunggu Persetujuan Perubahan", tone: "warning" },
  READY_TO_ORDER: { label: "Siap Dipesan", tone: "info" },
  ORDERED: { label: "Dipesan ke Vendor", tone: "info" },
  PARTIALLY_RECEIVED: { label: "Diterima Sebagian", tone: "warning" },
  ON_HOLD: { label: "Ditahan (Masalah Barang)", tone: "danger" },
  RECEIVED: { label: "Diterima Lengkap", tone: "violet" },
  CLOSED: { label: "Ditutup", tone: "success" },
  CANCELLED: { label: "Dibatalkan", tone: "neutral" },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone; rank: number }> = {
  LOW: { label: "Rendah", tone: "neutral", rank: 1 },
  NORMAL: { label: "Normal", tone: "neutral", rank: 2 },
  HIGH: { label: "Tinggi", tone: "warning", rank: 3 },
  URGENT: { label: "Mendesak", tone: "danger", rank: 4 },
};

export const APPROVAL_INSTANCE_STATUS: Record<ApprovalInstanceStatus, { label: string; tone: Tone }> = {
  IN_PROGRESS: { label: "Berjalan", tone: "warning" },
  APPROVED: { label: "Disetujui", tone: "success" },
  REJECTED: { label: "Ditolak", tone: "danger" },
  CANCELLED: { label: "Dibatalkan", tone: "neutral" },
  ON_HOLD: { label: "Ditahan", tone: "danger" },
};

export const APPROVAL_STEP_STATUS: Record<ApprovalStepStatus, { label: string; tone: Tone }> = {
  WAITING: { label: "Belum aktif", tone: "neutral" },
  PENDING: { label: "Menunggu", tone: "warning" },
  APPROVED: { label: "Disetujui", tone: "success" },
  REJECTED: { label: "Ditolak", tone: "danger" },
  SKIPPED: { label: "Dilewati", tone: "neutral" },
  CANCELLED: { label: "Dibatalkan", tone: "neutral" },
};

export const ASSIGNMENT_STATUS: Record<AssignmentStatus, { label: string; tone: Tone }> = {
  WAITING: { label: "Belum aktif", tone: "neutral" },
  PENDING: { label: "Menunggu keputusan", tone: "warning" },
  APPROVED: { label: "Menyetujui", tone: "success" },
  REJECTED: { label: "Menolak", tone: "danger" },
  SKIPPED: { label: "Dilewati", tone: "neutral" },
  CANCELLED: { label: "Tidak diperlukan", tone: "neutral" },
  REASSIGNED: { label: "Dialihkan", tone: "neutral" },
  CARRIED_OVER: { label: "Disetujui (versi sebelumnya)", tone: "success" },
};

export const APPROVAL_SUBJECT: Record<ApprovalSubjectType, string> = {
  REQUEST: "Pengajuan",
  CHANGE_REQUEST: "Perubahan harga/kuantitas/spesifikasi",
  CANCELLATION: "Pembatalan",
  DISCREPANCY_RESOLUTION: "Penyelesaian masalah barang",
};

export const APPROVER_TYPE: Record<ApproverType, string> = {
  USER: "Pengguna tertentu",
  ROLE: "Peran",
  REQUESTER_SUPERVISOR: "Atasan langsung pemohon",
  DEPARTMENT_HEAD: "Kepala bagian pemohon",
  REQUESTER: "Pemohon",
};

export const ROUTING_MODE: Record<RoutingMode, { label: string; description: string }> = {
  SEQUENTIAL: { label: "Berjenjang", description: "Tahap berikutnya aktif setelah tahap sebelumnya disetujui." },
  PARALLEL: { label: "Paralel", description: "Semua tahap aktif bersamaan; semua harus menyetujui." },
};

export const STEP_MODE: Record<StepApprovalMode, { label: string; description: string }> = {
  ALL: { label: "Semua", description: "Semua approver pada tahap ini harus menyetujui." },
  ANY: { label: "Salah satu", description: "Cukup satu approver pada tahap ini yang menyetujui." },
};

export const CHANGE_REQUEST_STATUS: Record<ChangeRequestStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Menunggu persetujuan", tone: "warning" },
  APPROVED: { label: "Disetujui", tone: "success" },
  REJECTED: { label: "Ditolak", tone: "danger" },
  CANCELLED: { label: "Dibatalkan", tone: "neutral" },
};

export const FOLLOWUP_TYPE: Record<FollowupType, string> = {
  DELAY: "Keterlambatan",
  VENDOR_CONTACT: "Kontak vendor",
  ESCALATION: "Eskalasi",
  NOTE: "Catatan",
};

export const ITEM_CONDITION: Record<ItemCondition, string> = {
  GOOD: "Baik",
  DAMAGED: "Rusak",
  WRONG_ITEM: "Tidak sesuai",
};

export const DISCREPANCY_TYPE: Record<DiscrepancyType, string> = {
  SHORTAGE: "Kekurangan / vendor tidak sanggup",
  DAMAGED: "Barang rusak",
  WRONG_ITEM: "Barang tidak sesuai",
  OTHER: "Lainnya",
};

export const DISCREPANCY_STATUS: Record<DiscrepancyStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Terbuka", tone: "danger" },
  PENDING_APPROVAL: { label: "Menunggu persetujuan", tone: "warning" },
  RESOLVED: { label: "Selesai", tone: "success" },
};

export const RESOLUTION_TYPE: Record<ResolutionType, { label: string; description: string }> = {
  REPLACEMENT: { label: "Penggantian", description: "Dibuat pesanan pengganti yang terhubung ke pesanan asal." },
  ACCEPT_SHORTAGE: { label: "Terima kekurangan", description: "Sisa kuantitas ditutup; kebutuhan pemohon dikurangi." },
  RETURN_REFUND: { label: "Retur / refund", description: "Barang dikembalikan ke vendor tanpa pengganti." },
  OTHER: { label: "Lainnya", description: "Penyelesaian lain sesuai catatan." },
};

export const HANDOVER_STATUS: Record<HandoverStatus, { label: string; tone: Tone }> = {
  PREPARED: { label: "Menunggu konfirmasi pemohon", tone: "violet" },
  CONFIRMED: { label: "Dikonfirmasi", tone: "success" },
  DISPUTED: { label: "Ada selisih", tone: "danger" },
  CANCELLED: { label: "Dibatalkan", tone: "neutral" },
};

export const DOCUMENT_TYPE: Record<DocumentType, string> = {
  REQUEST_ATTACHMENT: "Lampiran pengajuan",
  VENDOR_QUOTE: "Penawaran vendor",
  ORDER_PROOF: "Bukti pemesanan",
  DELIVERY_NOTE: "Surat jalan / bukti penerimaan",
  RECEIPT_EVIDENCE: "Foto / bukti barang diterima",
  DISCREPANCY_EVIDENCE: "Bukti masalah barang",
  HANDOVER_PROOF: "Bukti serah terima",
  OTHER: "Lainnya",
};

export const DOCUMENT_STAGE: Record<DocumentStage, string> = {
  REQUEST_SUBMIT: "Saat pengajuan dikirim",
  PO_ORDER: "Saat PO ditandai dipesan",
  RECEIPT: "Setiap penerimaan barang (diperiksa sebelum serah terima)",
  HANDOVER_CONFIRM: "Sebelum serah terima dikonfirmasi",
  PO_CLOSE: "Sebelum PO ditutup",
};

export const ACCOUNT_STATUS: Record<AccountStatus, { label: string; tone: Tone }> = {
  PENDING_ACTIVATION: { label: "Menunggu aktivasi", tone: "warning" },
  ACTIVE: { label: "Aktif", tone: "success" },
  SUSPENDED: { label: "Ditangguhkan", tone: "danger" },
  DISABLED: { label: "Nonaktif", tone: "neutral" },
};

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Baru", tone: "warning" },
  IN_PROGRESS: { label: "Diproses", tone: "info" },
  FORWARDED: { label: "Diteruskan", tone: "violet" },
  RESOLVED: { label: "Selesai", tone: "success" },
  CLOSED: { label: "Ditutup", tone: "neutral" },
};

export const TICKET_CATEGORY: Record<TicketCategory, string> = {
  TECHNICAL: "Gangguan teknis aplikasi",
  PROCESS: "Pertanyaan proses bisnis",
  ACCOUNT: "Akun & akses",
  OTHER: "Lainnya",
};

/** Enam tahap sederhana yang dilihat pemohon. */
export const STAGES = [
  { key: "draft", label: "Draf" },
  { key: "approval", label: "Persetujuan" },
  { key: "procurement", label: "Pengadaan" },
  { key: "delivery", label: "Pengiriman" },
  { key: "handover", label: "Serah Terima" },
  { key: "done", label: "Selesai" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

/**
 * Menurunkan tahap tampilan dari status pengajuan dan status PO terkait.
 * `poStatuses` = status semua PO aktif yang memuat item pengajuan ini.
 */
export function deriveStage(status: RequestStatus, poStatuses: PurchaseOrderStatus[] = []): StageKey {
  switch (status) {
    case "DRAFT":
      return "draft";
    case "PENDING_APPROVAL":
    case "REVISION_REQUIRED":
    case "ON_HOLD":
      return "approval";
    case "APPROVED":
      return "procurement";
    case "IN_PROCUREMENT": {
      const shipped = poStatuses.some((s) => ["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD", "RECEIVED"].includes(s));
      return shipped ? "delivery" : "procurement";
    }
    case "READY_FOR_HANDOVER":
    case "AWAITING_CONFIRMATION":
      return "handover";
    case "COMPLETED":
      return "done";
    default:
      return "approval";
  }
}

export function toneClass(tone: Tone): string {
  switch (tone) {
    case "info":
      return "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/30";
    case "warning":
      return "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30";
    case "success":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30";
    case "danger":
      return "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30";
    case "violet":
      return "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-400/30";
  }
}
