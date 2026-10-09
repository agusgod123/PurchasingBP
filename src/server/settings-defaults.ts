import type { DocumentType, RequestStatus } from "@/generated/prisma/enums";

/**
 * Pengaturan sistem yang dapat diubah Admin. Nilai default di bawah adalah
 * CONTOH yang aman untuk uji coba, bukan kebijakan kantor yang sudah disahkan.
 */
export interface Settings {
  "app.organization_name": string;
  "approval.reapproval_policy": "AFFECTED_ONLY" | "FULL";
  "approval.default_due_hours": number;
  "approval.reminder_interval_hours": number;
  "approval.escalation_after_hours": number;
  "purchasing.stale_after_days": number;
  "purchasing.price_tolerance_percent": number;
  "documents.max_file_mb": number;
  "documents.allowed_mime_types": string[];
  "documents.requester_visible_types": DocumentType[];
  "budget.warning_enabled": boolean;
  "work_calendar.start_hour": number;
  "work_calendar.end_hour": number;
  "work_calendar.work_days": number[];
  "notifications.email_types": string[];
  "request.requester_cancel_statuses": RequestStatus[];
}

export const DEFAULT_SETTINGS: Settings = {
  "app.organization_name": "Kantor",
  "approval.reapproval_policy": "AFFECTED_ONLY",
  "approval.default_due_hours": 48,
  "approval.reminder_interval_hours": 24,
  "approval.escalation_after_hours": 72,
  "purchasing.stale_after_days": 14,
  "purchasing.price_tolerance_percent": 0,
  "documents.max_file_mb": 10,
  "documents.allowed_mime_types": [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  "documents.requester_visible_types": ["REQUEST_ATTACHMENT", "HANDOVER_PROOF", "DELIVERY_NOTE"],
  "budget.warning_enabled": true,
  "work_calendar.start_hour": 8,
  "work_calendar.end_hour": 17,
  "work_calendar.work_days": [1, 2, 3, 4, 5],
  "notifications.email_types": [
    "APPROVAL_REQUIRED",
    "APPROVAL_REMINDER",
    "APPROVAL_ESCALATION",
    "REQUEST_APPROVED",
    "REQUEST_REVISION",
    "REQUEST_ON_HOLD",
    "CHANGE_APPROVAL_REQUIRED",
    "PO_DELAYED",
    "DISCREPANCY_REPORTED",
    "HANDOVER_READY",
    "REQUEST_CANCELLED",
    "ACCOUNT_ACTIVATED",
    "ACCOUNT_PENDING",
  ],
  "request.requester_cancel_statuses": ["DRAFT", "PENDING_APPROVAL", "REVISION_REQUIRED", "ON_HOLD"],
};

export const SETTING_DESCRIPTIONS: Record<keyof Settings, string> = {
  "app.organization_name": "Nama organisasi yang tampil di aplikasi dan email.",
  "approval.reapproval_policy":
    "AFFECTED_ONLY: saat kirim ulang, tahap yang sudah setuju dibawa jika aturan sama dan nilai tidak naik. FULL: semua tahap mengulang.",
  "approval.default_due_hours": "Tenggat default persetujuan (jam) jika tahap aturan tidak menentukan. (SLA: TBD)",
  "approval.reminder_interval_hours": "Jarak pengingat persetujuan yang belum direspons (jam).",
  "approval.escalation_after_hours": "Eskalasi ke atasan approver setelah sekian jam melewati tenggat.",
  "purchasing.stale_after_days": "Transaksi tanpa aktivitas selama sekian hari ditandai untuk ditinjau.",
  "purchasing.price_tolerance_percent":
    "Selisih harga aktual vs estimasi yang tidak memerlukan persetujuan ulang (%). PRD: 0 = setiap perubahan butuh persetujuan.",
  "documents.max_file_mb": "Ukuran maksimum file unggahan (MB).",
  "documents.allowed_mime_types": "Jenis file yang diizinkan (MIME).",
  "documents.requester_visible_types": "Jenis dokumen yang dapat dilihat pemohon pada transaksinya.",
  "budget.warning_enabled": "Tampilkan peringatan jika nilai melampaui anggaran bagian.",
  "work_calendar.start_hour": "Jam mulai kerja (untuk durasi kerja aktif).",
  "work_calendar.end_hour": "Jam selesai kerja.",
  "work_calendar.work_days": "Hari kerja (1=Senin ... 7=Minggu).",
  "notifications.email_types": "Jenis notifikasi yang juga dikirim lewat email.",
  "request.requester_cancel_statuses": "Status di mana pemohon dapat membatalkan langsung tanpa persetujuan.",
};
