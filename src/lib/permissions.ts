// Daftar izin dan peran bawaan. Dipakai oleh seed, pemeriksaan server, dan
// penyembunyian menu di UI (UI bukan sumber kebenaran; server selalu memeriksa ulang).

export const PERMISSIONS = {
  REQUEST_CREATE: "request.create",
  REQUEST_VIEW_SUMMARY_ALL: "request.view_summary_all",
  REQUEST_VIEW_ALL: "request.view_all",
  REQUEST_SET_PRIORITY: "request.set_priority",
  REQUEST_CANCEL_ANY: "request.cancel_any",

  PURCHASING_MANAGE: "purchasing.manage",
  PO_CANCEL_AFTER_ORDER: "po.cancel_after_order",
  VENDOR_MANAGE: "vendor.manage",
  CATALOG_MANAGE: "catalog.manage",

  DOCUMENT_VIEW_ALL: "document.view_all",

  REPORT_VIEW_DEPARTMENT: "report.view_department",
  REPORT_VIEW_ALL: "report.view_all",
  BUDGET_MANAGE: "budget.manage",

  USER_MANAGE: "user.manage",
  ORG_MANAGE: "org.manage",
  ROLE_MANAGE: "role.manage",
  APPROVAL_RULE_MANAGE: "approval_rule.manage",
  APPROVAL_REASSIGN: "approval.reassign",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_VIEW: "audit.view",
  SUPPORT_MANAGE: "support.manage",
  FAQ_MANAGE: "faq.manage",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_INFO: Record<PermissionCode, { name: string; module: string }> = {
  "request.create": { name: "Membuat pengajuan", module: "Pengajuan" },
  "request.view_summary_all": { name: "Melihat ringkasan pengajuan lintas bagian", module: "Pengajuan" },
  "request.view_all": { name: "Melihat detail semua pengajuan", module: "Pengajuan" },
  "request.set_priority": { name: "Menetapkan prioritas final", module: "Pengajuan" },
  "request.cancel_any": { name: "Memproses pembatalan pengajuan", module: "Pengajuan" },
  "purchasing.manage": { name: "Mengelola antrean, PO, penerimaan, serah terima", module: "Purchasing" },
  "po.cancel_after_order": { name: "Membatalkan PO yang sudah dipesan", module: "Purchasing" },
  "vendor.manage": { name: "Mengelola vendor", module: "Purchasing" },
  "catalog.manage": { name: "Mengelola kategori & katalog barang", module: "Katalog" },
  "document.view_all": { name: "Mengakses arsip dokumen pusat", module: "Dokumen" },
  "report.view_department": { name: "Melihat laporan bagian sendiri", module: "Laporan" },
  "report.view_all": { name: "Melihat laporan lintas bagian", module: "Laporan" },
  "budget.manage": { name: "Mengelola anggaran bagian", module: "Laporan" },
  "user.manage": { name: "Mengelola akun pengguna", module: "Administrasi" },
  "org.manage": { name: "Mengelola bagian & pegawai", module: "Administrasi" },
  "role.manage": { name: "Mengelola peran & izin", module: "Administrasi" },
  "approval_rule.manage": { name: "Mengonfigurasi matriks persetujuan", module: "Administrasi" },
  "approval.reassign": { name: "Mengalihkan penugasan persetujuan", module: "Administrasi" },
  "settings.manage": { name: "Mengubah pengaturan sistem", module: "Administrasi" },
  "audit.view": { name: "Melihat audit log", module: "Administrasi" },
  "support.manage": { name: "Menangani tiket bantuan", module: "Bantuan" },
  "faq.manage": { name: "Mengelola FAQ & panduan", module: "Bantuan" },
};

const P = PERMISSIONS;

export const ROLE_DEFINITIONS: Array<{
  code: string;
  name: string;
  description: string;
  permissions: PermissionCode[];
}> = [
  {
    code: "EMPLOYEE",
    name: "Pegawai / Pemohon",
    description: "Membuat pengajuan dan memantau status pengajuan sendiri.",
    permissions: [P.REQUEST_CREATE, P.REQUEST_VIEW_SUMMARY_ALL],
  },
  {
    code: "SECTION_MANAGER",
    name: "Pengelola Bagian",
    description: "Melihat pengajuan bagian yang menjadi tanggung jawabnya (cakupan bagian diatur per pengguna).",
    permissions: [P.REQUEST_CREATE, P.REQUEST_VIEW_SUMMARY_ALL, P.REPORT_VIEW_DEPARTMENT],
  },
  {
    code: "SUPERVISOR",
    name: "Supervisor / Atasan",
    description: "Memberi persetujuan sesuai penugasan dan menetapkan prioritas final.",
    permissions: [P.REQUEST_CREATE, P.REQUEST_VIEW_SUMMARY_ALL, P.REQUEST_SET_PRIORITY, P.REPORT_VIEW_DEPARTMENT],
  },
  {
    code: "PURCHASING",
    name: "Purchasing",
    description: "Mengelola antrean pembelian, vendor, penawaran, PO, penerimaan, dan serah terima.",
    permissions: [
      P.REQUEST_CREATE,
      P.REQUEST_VIEW_SUMMARY_ALL,
      P.REQUEST_VIEW_ALL,
      P.REQUEST_CANCEL_ANY,
      P.PURCHASING_MANAGE,
      P.PO_CANCEL_AFTER_ORDER,
      P.VENDOR_MANAGE,
      P.CATALOG_MANAGE,
      P.DOCUMENT_VIEW_ALL,
      P.REPORT_VIEW_ALL,
    ],
  },
  {
    code: "FINANCE",
    name: "Keuangan",
    description: "Pemeriksaan/persetujuan anggaran sesuai matriks dan pengelolaan anggaran bagian.",
    permissions: [P.REQUEST_CREATE, P.REQUEST_VIEW_SUMMARY_ALL, P.REQUEST_VIEW_ALL, P.REPORT_VIEW_ALL, P.BUDGET_MANAGE],
  },
  {
    code: "LEADERSHIP",
    name: "Pimpinan",
    description: "Melihat ringkasan dan laporan lintas bagian.",
    permissions: [P.REQUEST_CREATE, P.REQUEST_VIEW_SUMMARY_ALL, P.REQUEST_VIEW_ALL, P.REPORT_VIEW_ALL],
  },
  {
    code: "ADMIN",
    name: "Administrator",
    description:
      "Mengelola akun, organisasi, konfigurasi, dan matriks persetujuan. Tidak otomatis berwenang menyetujui transaksi.",
    permissions: [
      P.REQUEST_VIEW_SUMMARY_ALL,
      P.USER_MANAGE,
      P.ORG_MANAGE,
      P.ROLE_MANAGE,
      P.APPROVAL_RULE_MANAGE,
      P.APPROVAL_REASSIGN,
      P.SETTINGS_MANAGE,
      P.CATALOG_MANAGE,
      P.AUDIT_VIEW,
      P.SUPPORT_MANAGE,
      P.FAQ_MANAGE,
      P.DOCUMENT_VIEW_ALL,
      P.REPORT_VIEW_ALL,
      P.BUDGET_MANAGE,
    ],
  },
  {
    code: "TECH",
    name: "Pemelihara Teknis",
    description: "Akses teknis minimum untuk pemantauan.",
    permissions: [P.AUDIT_VIEW],
  },
];

export function hasPermission(perms: readonly string[] | ReadonlySet<string>, code: PermissionCode): boolean {
  return perms instanceof Set ? perms.has(code) : (perms as readonly string[]).includes(code);
}
