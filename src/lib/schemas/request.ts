import { z } from "zod";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid");

const decimalString = (label: string, opts: { min?: number; allowZero?: boolean } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().replace(",", "."))
    .refine((v) => v !== "" && !Number.isNaN(Number(v)), `${label} harus berupa angka`)
    .refine(
      (v) => (opts.allowZero ? Number(v) >= (opts.min ?? 0) : Number(v) > (opts.min ?? 0)),
      opts.allowZero ? `${label} tidak boleh negatif` : `${label} harus lebih dari 0`,
    )
    .refine((v) => Number(v) < 1e15, `${label} terlalu besar`);

export const requestItemInput = z.object({
  id: z.string().uuid().optional(),
  catalogItemId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
  itemName: z.string().trim().min(2, "Nama barang wajib diisi").max(255),
  specification: z.string().trim().min(2, "Spesifikasi wajib diisi").max(5000),
  quantity: decimalString("Jumlah"),
  unitName: z.string().trim().min(1, "Satuan wajib diisi").max(50),
  estimatedUnitPrice: decimalString("Estimasi harga", { allowZero: true }),
  reason: z.string().trim().max(2000).nullish(),
  neededDate: dateString.nullish().or(z.literal("")),
});

export type RequestItemInput = z.input<typeof requestItemInput>;

export const PRIORITY_VALUES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

/** Draf boleh belum lengkap; validasi lengkap terjadi saat dikirim. */
export const requestDraftInput = z.object({
  title: z.string().trim().max(255).default(""),
  generalReason: z.string().trim().max(5000).default(""),
  requestedPriority: z.enum(PRIORITY_VALUES).default("NORMAL"),
  neededDate: dateString.nullish().or(z.literal("")),
  items: z.array(requestItemInput).max(100, "Maksimal 100 item per pengajuan").default([]),
});

export type RequestDraftInput = z.input<typeof requestDraftInput>;

export const requestSubmitShape = z.object({
  title: z.string().trim().min(5, "Judul minimal 5 karakter").max(255),
  generalReason: z.string().trim().min(10, "Alasan kebutuhan minimal 10 karakter").max(5000),
  requestedPriority: z.enum(PRIORITY_VALUES),
  neededDate: dateString,
  items: z.array(requestItemInput).min(1, "Minimal satu item"),
});
