/**
 * Data dasar yang aman untuk production: peran, izin, pengaturan default,
 * kategori, aturan dokumen wajib, contoh matriks (nonaktif), dan FAQ.
 * Idempoten: hanya membuat yang belum ada, tidak menimpa perubahan Admin.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { Prisma } from "../../src/generated/prisma/client";
import { PERMISSION_INFO, ROLE_DEFINITIONS } from "../../src/lib/permissions";
import { DEFAULT_SETTINGS, SETTING_DESCRIPTIONS } from "../../src/server/settings-defaults";
import { hashPassword } from "../../src/server/auth/password";

export async function seedBase(db: PrismaClient, opts: { log?: (msg: string) => void } = {}) {
  const log = opts.log ?? (() => undefined);

  // Izin
  for (const [code, info] of Object.entries(PERMISSION_INFO)) {
    await db.permission.upsert({
      where: { code },
      update: { name: info.name, module: info.module },
      create: { code, name: info.name, module: info.module },
    });
  }
  const permissions = await db.permission.findMany();
  log(`Izin: ${permissions.length}`);

  // Peran bawaan (izin default hanya diberikan saat peran pertama kali dibuat)
  for (const def of ROLE_DEFINITIONS) {
    const existing = await db.role.findUnique({ where: { code: def.code } });
    if (existing) continue;
    await db.role.create({
      data: {
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
        permissions: {
          create: def.permissions.map((p) => ({ permission: { connect: { code: p } } })),
        },
      },
    });
  }
  log(`Peran: ${ROLE_DEFINITIONS.length}`);

  // Pengaturan default
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.systemSetting.upsert({
      where: { key },
      update: {},
      create: {
        key,
        value: value as Prisma.InputJsonValue,
        description: SETTING_DESCRIPTIONS[key as keyof typeof SETTING_DESCRIPTIONS],
      },
    });
  }

  // Kategori barang (FR-REQ-03)
  const categories = [
    { code: "IT", name: "IT", sortOrder: 1, description: "Perangkat keras, perangkat lunak, aksesori komputer" },
    { code: "OPS", name: "Operasional", sortOrder: 2, description: "Kebutuhan operasional harian" },
    { code: "EQP", name: "Perlengkapan / Peralatan", sortOrder: 3, description: "Peralatan kerja, furnitur, APD" },
    { code: "PRJ", name: "Proyek", sortOrder: 4, description: "Kebutuhan khusus proyek" },
    { code: "OTH", name: "Lainnya", sortOrder: 9, description: "Kebutuhan lain" },
  ];
  for (const c of categories) {
    await db.itemCategory.upsert({ where: { code: c.code }, update: {}, create: c });
  }

  // Dokumen wajib (dapat diubah Admin). Ditandai sebagai contoh bila kebijakan masih TBD.
  if ((await db.documentRequirement.count()) === 0) {
    await db.documentRequirement.createMany({
      data: [
        {
          stage: "REQUEST_SUBMIT",
          documentType: "REQUEST_ATTACHMENT",
          minCount: 1,
          description: "Lampiran pemohon wajib (FR-REQ-07). Jenis lampiran menyesuaikan kebutuhan.",
        },
        {
          stage: "PO_ORDER",
          documentType: "ORDER_PROOF",
          minCount: 1,
          description: "Bukti pemesanan ke vendor wajib (FR-DOC-03).",
        },
        {
          stage: "PO_ORDER",
          documentType: "VENDOR_QUOTE",
          minCount: 1,
          description: "CONTOH: minimal 1 penawaran. Jumlah resmi masih TBD (FR-PUR-07).",
        },
        {
          stage: "PO_ORDER",
          documentType: "VENDOR_QUOTE",
          minCount: 3,
          minAmount: 50_000_000,
          isActive: false,
          description: "CONTOH (nonaktif): 3 penawaran pembanding untuk nilai ≥ Rp50 juta.",
        },
      ],
    });
  }

  // Contoh matriks persetujuan — NONAKTIF sampai disahkan & diaktifkan Admin.
  const supervisorStep = {
    stepNumber: 1,
    name: "Atasan langsung pemohon",
    approverType: "REQUESTER_SUPERVISOR" as const,
    approvalMode: "ALL" as const,
  };
  const sampleRules: Array<Prisma.ApprovalRuleCreateInput> = [
    {
      code: "CONTOH-PENGAJUAN-STANDAR",
      name: "Contoh: pengajuan standar",
      description: "CONTOH. Atasan langsung → kepala bagian (berjenjang). Sesuaikan dengan matriks kewenangan resmi.",
      subjectType: "REQUEST",
      routingMode: "SEQUENTIAL",
      isSample: true,
      isActive: false,
      steps: {
        create: [
          supervisorStep,
          { stepNumber: 2, name: "Kepala bagian pemohon", approverType: "DEPARTMENT_HEAD", approvalMode: "ALL", isRequired: false },
        ],
      },
    },
    {
      code: "CONTOH-PEMBATALAN",
      name: "Contoh: pembatalan setelah dipesan",
      description: "CONTOH. Pembatalan pengajuan yang sudah dipesan ke vendor.",
      subjectType: "CANCELLATION",
      routingMode: "SEQUENTIAL",
      isSample: true,
      isActive: false,
      steps: { create: [supervisorStep] },
    },
    {
      code: "CONTOH-MASALAH-BARANG",
      name: "Contoh: penyelesaian masalah barang",
      description: "CONTOH. Penyelesaian kekurangan/kerusakan disetujui atasan pemohon.",
      subjectType: "DISCREPANCY_RESOLUTION",
      routingMode: "SEQUENTIAL",
      isSample: true,
      isActive: false,
      steps: { create: [supervisorStep] },
    },
  ];
  for (const rule of sampleRules) {
    const exists = await db.approvalRule.findUnique({ where: { code: rule.code } });
    if (!exists) await db.approvalRule.create({ data: rule });
  }

  // FAQ / panduan singkat (FR-HLP-04)
  if ((await db.faqArticle.count()) === 0) {
    const faqs = [
      ["Pengajuan", "Bagaimana cara membuat pengajuan barang?", "Buka menu Pengajuan Saya → Buat Pengajuan. Isi judul, alasan, tanggal dibutuhkan, lalu tambahkan item (nama, spesifikasi, jumlah, satuan, estimasi harga). Unggah lampiran pendukung, lalu klik Kirim Pengajuan. Isian tersimpan otomatis sebagai draf."],
      ["Pengajuan", "Bisakah saya mengubah pengajuan yang sudah dikirim?", "Selama belum disetujui, tarik pengajuan (tombol Tarik untuk Diedit), ubah, lalu kirim ulang. Setiap pengiriman membentuk versi baru; versi dan keputusan lama tetap tersimpan."],
      ["Pengajuan", "Apa arti setiap tahap?", "Draf → Persetujuan → Pengadaan (purchasing memproses pembelian) → Pengiriman (barang dipesan ke vendor) → Serah Terima → Selesai. Tahap aktif selalu ditampilkan di halaman detail pengajuan."],
      ["Persetujuan", "Kenapa pengajuan saya berstatus Ditahan?", "Sistem tidak dapat menentukan approver, misalnya atasan belum diatur atau approver tidak aktif. Admin akan memperbaiki konfigurasi lalu memproses ulang. Sistem tidak pernah menyetujui otomatis."],
      ["Persetujuan", "Mengapa saya diminta menyetujui perubahan harga?", "Jika harga aktual, jumlah, atau spesifikasi berbeda dari pengajuan yang disetujui, pemohon dan atasan pemohon wajib menyetujui perubahan sebelum pembelian dilanjutkan."],
      ["Serah terima", "Apa yang harus saya lakukan saat barang diserahkan?", "Periksa barang, lalu buka pengajuan dan klik Konfirmasi Penerimaan. Jika jumlah tidak sesuai, isi jumlah yang benar-benar diterima dan jelaskan selisihnya."],
      ["Akun", "Saya lupa password.", "Klik Lupa password di halaman masuk dan masukkan email terdaftar. Jika email tidak diterima, hubungi Admin melalui menu Bantuan."],
    ];
    await db.faqArticle.createMany({
      data: faqs.map(([category, question, answer], i) => ({ category, question, answer, sortOrder: i })),
    });
  }
}

/** Membuat akun Admin awal jika belum ada (wajib ganti password saat login pertama). */
export async function seedAdmin(
  db: PrismaClient,
  input: { username: string; email: string; password: string; fullName?: string },
  opts: { mustChangePassword?: boolean } = {},
) {
  const username = input.username.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) return existing;
  const role = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  return db.user.create({
    data: {
      username,
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName ?? "Administrator",
      passwordHash: await hashPassword(input.password),
      accountStatus: "ACTIVE",
      activatedAt: new Date(),
      mustChangePassword: opts.mustChangePassword ?? true,
      roles: { create: [{ roleId: role.id }] },
    },
  });
}
