import "server-only";
import ExcelJS from "exceljs";
import pdfmake from "pdfmake";
import vfsFonts from "pdfmake/build/vfs_fonts";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { dateKeyInTz } from "@/server/time";
import { formatCell, type ColumnType, type ReportMeta, type ReportResult } from "@/lib/reports";
import { formatDateTime } from "@/lib/format";

export interface ExportContext {
  meta: ReportMeta;
  result: ReportResult;
  /** Baris keterangan filter, mis. "Periode: 1 Jul 2026 – 9 Okt 2026". */
  filterLines: string[];
  organization: string;
  generatedBy: string;
}

/** Kolom teks panjang yang mengisi sisa lebar tabel PDF. */
const WIDE_KEYS = new Set(["title", "position", "reason", "comment", "description", "lastFollowup", "resolution", "stage", "requests"]);
const PDF_MAX_ROWS = 2000;

// --- Excel -----------------------------------------------------------------

const NUM_FMT: Partial<Record<ColumnType, string>> = {
  money: '"Rp" #,##0',
  number: "#,##0.###",
  percent: '0.0"%"',
  days: '0.0" hari"',
  hours: '0.0" jam"',
  date: "dd mmm yyyy",
};

function excelValue(value: string | number | null, type: ColumnType = "text"): ExcelJS.CellValue {
  if (value === null || value === "") return null;
  if (type === "date") {
    const s = String(value);
    const key = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : dateKeyInTz(new Date(s));
    return new Date(`${key}T00:00:00Z`);
  }
  if (type === "datetime") return formatDateTime(String(value));
  return value;
}

export async function toXlsx(ctx: ExportContext): Promise<Buffer> {
  const { meta, result } = ctx;
  const wb = new ExcelJS.Workbook();
  wb.creator = ctx.organization;
  wb.created = new Date();
  const ws = wb.addWorksheet(meta.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 0 }] });

  ws.addRow([`${meta.title} — ${ctx.organization}`]).font = { bold: true, size: 14 };
  for (const line of ctx.filterLines) ws.addRow([line]).font = { color: { argb: "FF555555" } };
  ws.addRow([`Dibuat ${formatDateTime(new Date())} oleh ${ctx.generatedBy}`]).font = { color: { argb: "FF555555" } };
  if (result.note) ws.addRow([result.note]).font = { italic: true, color: { argb: "FF555555" } };

  if (result.summary?.length) {
    ws.addRow([]);
    for (const s of result.summary) {
      const row = ws.addRow([s.label, excelValue(s.value, s.type)]);
      row.getCell(1).font = { color: { argb: "FF555555" } };
      row.getCell(2).font = { bold: true };
      if (s.type && NUM_FMT[s.type]) row.getCell(2).numFmt = NUM_FMT[s.type]!;
      row.getCell(2).alignment = { horizontal: "left" };
    }
  }

  ws.addRow([]);
  const header = ws.addRow(result.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F5FBF" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  const headerRowNumber = header.number;

  for (const r of result.rows) {
    const row = ws.addRow(result.columns.map((c) => excelValue(r[c.key] ?? null, c.type)));
    result.columns.forEach((c, i) => {
      const fmt = c.type ? NUM_FMT[c.type] : undefined;
      if (fmt) row.getCell(i + 1).numFmt = fmt;
    });
  }

  ws.views = [{ state: "frozen", ySplit: headerRowNumber }];
  ws.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: result.columns.length } };
  result.columns.forEach((c, i) => {
    const longest = Math.max(c.label.length, ...result.rows.slice(0, 500).map((r) => formatCell(r[c.key] ?? null, c.type).length));
    ws.getColumn(i + 1).width = Math.min(WIDE_KEYS.has(c.key) ? 60 : 28, Math.max(10, longest + 2));
    if (WIDE_KEYS.has(c.key)) ws.getColumn(i + 1).alignment = { wrapText: true, vertical: "top" };
  });
  // Kolom pertama juga dipakai judul laporan; jangan terlalu sempit.
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width ?? 10, 24);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// --- PDF -------------------------------------------------------------------

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  // Font Roboto dimuat dari paket (tanpa akses berkas lokal) agar berjalan di serverless.
  const pm = pdfmake as unknown as { virtualfs: { writeFileSync(name: string, content: Buffer): void } };
  for (const [name, data] of Object.entries(vfsFonts as unknown as Record<string, string>)) {
    pm.virtualfs.writeFileSync(name, Buffer.from(data, "base64"));
  }
  pdfmake.setFonts({
    Roboto: { normal: "Roboto-Regular.ttf", bold: "Roboto-Medium.ttf", italics: "Roboto-Italic.ttf", bolditalics: "Roboto-MediumItalic.ttf" },
  });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(() => false);
  fontsReady = true;
}

const RIGHT: ColumnType[] = ["money", "number", "percent", "days", "hours"];

export async function toPdf(ctx: ExportContext): Promise<Buffer> {
  ensureFonts();
  const { meta, result } = ctx;
  const rows = result.rows.slice(0, PDF_MAX_ROWS);
  const content: Content[] = [
    { text: meta.title, style: "title" },
    { text: ctx.organization, style: "muted", margin: [0, 0, 0, 6] },
    ...ctx.filterLines.map((l): Content => ({ text: l, style: "muted" })),
  ];
  if (result.summary?.length) {
    content.push({
      margin: [0, 10, 0, 4],
      table: {
        widths: result.summary.map(() => "*"),
        body: [
          result.summary.map((s) => ({
            stack: [
              { text: s.label, style: "muted" },
              { text: formatCell(s.value, s.type), bold: true, fontSize: 12, margin: [0, 2, 0, 0] },
              ...(s.hint ? [{ text: s.hint, style: "muted" }] : []),
            ],
          })),
        ],
      },
      layout: { hLineColor: () => "#d9dde3", vLineColor: () => "#d9dde3", paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 8, paddingRight: () => 8 },
    });
  }
  if (result.note) content.push({ text: result.note, style: "muted", italics: true, margin: [0, 4, 0, 0] });
  content.push({
    margin: [0, 10, 0, 0],
    table: {
      headerRows: 1,
      widths: result.columns.map((c) => (WIDE_KEYS.has(c.key) ? "*" : "auto")),
      body: [
        result.columns.map((c) => ({ text: c.label, style: "th", alignment: c.type && RIGHT.includes(c.type) ? "right" : "left" })),
        ...rows.map((r) =>
          result.columns.map((c) => ({
            text: formatCell(r[c.key] ?? null, c.type),
            alignment: c.type && RIGHT.includes(c.type) ? ("right" as const) : ("left" as const),
          })),
        ),
      ],
    },
    layout: {
      fillColor: (i: number) => (i === 0 ? "#1f5fbf" : i % 2 === 0 ? "#f5f7fa" : null),
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
  });
  if (result.rows.length > PDF_MAX_ROWS) {
    content.push({ text: `Hanya ${PDF_MAX_ROWS} baris pertama dari ${result.rows.length}. Gunakan ekspor Excel untuk data lengkap.`, style: "muted", margin: [0, 6, 0, 0] });
  }
  if (result.rows.length === 0) content.push({ text: "Tidak ada data untuk filter ini.", style: "muted", margin: [0, 8, 0, 0] });

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [28, 28, 28, 36],
    info: { title: meta.title, author: ctx.organization },
    defaultStyle: { font: "Roboto", fontSize: 8, lineHeight: 1.15 },
    styles: {
      title: { fontSize: 15, bold: true },
      muted: { color: "#5b6472", fontSize: 8 },
      th: { bold: true, color: "#ffffff" },
    },
    footer: (page, pages) => ({
      columns: [
        { text: `Dibuat ${formatDateTime(new Date())} oleh ${ctx.generatedBy}`, style: "muted" },
        { text: `Halaman ${page} dari ${pages}`, alignment: "right", style: "muted" },
      ],
      margin: [28, 8, 28, 0],
    }),
    content,
  };
  return pdfmake.createPdf(doc).getBuffer();
}
