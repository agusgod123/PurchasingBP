// Definisi laporan yang dipakai bersama oleh halaman, ekspor Excel, dan ekspor PDF.
import { formatCurrency, formatDate, formatDateOnly, formatDateTime, formatNumber } from "@/lib/format";

export type ColumnType = "text" | "number" | "money" | "date" | "datetime" | "days" | "hours" | "percent";

export interface ReportColumn {
  key: string;
  label: string;
  type?: ColumnType;
}

export type ReportCell = string | number | null;
/** `_href` (opsional) membuat baris dapat diklik di halaman laporan. */
export type ReportRow = Record<string, ReportCell>;

export interface ReportResult {
  columns: ReportColumn[];
  rows: ReportRow[];
  summary?: Array<{ label: string; value: ReportCell; type?: ColumnType; hint?: string }>;
  chart?: { title: string; kind: "bar" | "column"; type?: ColumnType; data: Array<{ label: string; value: number; hint?: string }> };
  note?: string;
  /** Jumlah baris sebenarnya bila tabel dipotong. */
  totalRows?: number;
}

export type ReportFilterKey = "period" | "groupBy" | "department" | "category" | "status" | "priority" | "purchaser";

export interface ReportMeta {
  key: string;
  title: string;
  description: string;
  filters: ReportFilterKey[];
}

const ALL: ReportFilterKey[] = ["period", "department", "category", "status", "priority", "purchaser"];

export const REPORTS: ReportMeta[] = [
  { key: "status", title: "Ringkasan status", description: "Jumlah dan nilai pengajuan per status, serta tren pengajuan masuk per periode.", filters: [...ALL, "groupBy"] },
  { key: "tertunda", title: "Pengajuan tertunda", description: "Pengajuan yang belum selesai beserta umurnya, posisinya sekarang, dan yang melewati tanggal dibutuhkan.", filters: ["department", "category", "status", "priority", "purchaser"] },
  { key: "durasi", title: "Lama proses per tahap", description: "Durasi kalender dan jam kerja aktif untuk persetujuan, pengadaan, pengiriman, serah terima, dan total.", filters: ALL },
  { key: "anggaran", title: "Anggaran bagian", description: "Pagu, komitmen pengajuan, dan sisa anggaran per bagian pada tahun anggaran tanggal akhir filter.", filters: ["period", "department"] },
  { key: "riwayat", title: "Riwayat pengajuan", description: "Daftar lengkap pengajuan pada periode terpilih — dasar untuk analisis per bagian, pemohon, kategori, dan urgensi.", filters: ALL },
  { key: "persetujuan", title: "Riwayat persetujuan & revisi", description: "Keputusan persetujuan beserta catatan, termasuk permintaan revisi dan persetujuan perubahan.", filters: ["period", "department", "priority"] },
  { key: "urgensi", title: "Urgensi", description: "Sebaran prioritas akhir, penyelesaian, dan ketepatan terhadap tanggal dibutuhkan.", filters: ALL },
  { key: "pembatalan", title: "Pembatalan", description: "Pengajuan yang dibatalkan beserta alasan, tahap saat dibatalkan, dan pihak yang membatalkan.", filters: ["period", "department", "category", "priority"] },
  { key: "pesanan", title: "Pesanan & vendor", description: "PO yang dipesan per vendor: jumlah, nilai, lama pengiriman, dan ketepatan waktu.", filters: ["period", "department", "purchaser"] },
  { key: "keterlambatan", title: "Keterlambatan & tindak lanjut", description: "PO yang melewati estimasi kedatangan beserta tindak lanjut ke vendor.", filters: ["period", "department", "purchaser"] },
  { key: "penerimaan", title: "Masalah penerimaan", description: "Penerimaan parsial, barang rusak/tidak sesuai, dan penyelesaiannya.", filters: ["period", "department", "purchaser"] },
  { key: "aktivitas", title: "Aktivitas Purchasing", description: "Beban dan hasil kerja per petugas Purchasing pada periode terpilih.", filters: ["period", "purchaser"] },
];

export function reportMeta(key: string): ReportMeta | undefined {
  return REPORTS.find((r) => r.key === key);
}

export function formatCell(value: ReportCell, type: ColumnType = "text"): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (type) {
    case "money":
      return formatCurrency(value);
    case "number":
      return formatNumber(value);
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDateOnly(value) : formatDate(String(value));
    case "datetime":
      return formatDateTime(String(value));
    case "days":
      return `${formatNumber(Math.round(Number(value) * 10) / 10)} hari`;
    case "hours":
      return `${formatNumber(Math.round(Number(value) * 10) / 10)} jam`;
    case "percent":
      return `${formatNumber(Math.round(Number(value)))}%`;
    default:
      return String(value);
  }
}
