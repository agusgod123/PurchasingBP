# e-Pengadaan — Sistem Pengajuan Barang & Purchasing

Aplikasi web internal untuk alur **pengajuan barang → persetujuan berjenjang → pemesanan (PO) →
penerimaan → serah terima**, lengkap dengan dokumen, notifikasi email, laporan, dan audit.
Dibangun dari PRD, desain teknis, dan ERD di [`docs/referensi`](docs/referensi), dengan optimasi
berdasarkan praktik ERP (lihat [riset & analisis](docs/00-riset-analisis-optimasi.md)).

## Fitur utama

- **Pengajuan** dengan draf otomatis (tidak hilang saat jaringan putus), katalog barang, lampiran,
  revisi berversi beserta perbandingan perubahan, dan 6 tahap sederhana yang mudah dipahami pemohon.
- **Mesin persetujuan generik** yang dapat dikonfigurasi Admin: berjenjang/paralel, berdasarkan nilai,
  bagian, jenis; approver = atasan langsung, kepala bagian, peran, atau orang tertentu; tahap khusus
  "melebihi anggaran"; pemisahan tugas (pemohon tak bisa menyetujui miliknya sendiri). Tidak cocok/ambigu
  → **ditahan**, sistem tidak menebak.
- **Purchasing**: antrean, PO gabungan beberapa pengajuan, penawaran vendor, perubahan harga/qty/spesifikasi
  dengan persetujuan ulang, tindak lanjut keterlambatan dengan ETA baru.
- **Penerimaan parsial**, laporan barang kurang/rusak/salah, penggantian (PO pengganti), dan
  **serah terima** yang dikonfirmasi pemohon.
- **Pembatalan** dengan persetujuan sesuai tahap, **dokumen wajib** per tahap yang dapat diatur.
- **Pusat Tugas**, notifikasi aplikasi + email (outbox dengan *retry*), pengingat & eskalasi otomatis.
- **Dashboard per peran** dan **12 laporan** (status, tertunda, durasi kalender & jam kerja, anggaran,
  riwayat, persetujuan & revisi, urgensi, pembatalan, pesanan & vendor, keterlambatan, masalah
  penerimaan, aktivitas Purchasing) dengan **ekspor Excel & PDF** yang menghormati hak akses.
- **Administrasi**: pengguna & aktivasi, bagian & pegawai (impor CSV dari HRIS), peran & izin,
  matriks persetujuan, katalog, anggaran, hari libur, pengaturan, email keluar, **audit log**.
- **Bantuan**: FAQ yang dapat dicari dan tiket bantuan ke Admin.

## Teknologi

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 + shadcn/ui · Prisma 7 ·
PostgreSQL 16 (Supabase) · Supabase Storage · Nodemailer · ExcelJS · pdfmake · Vitest · Playwright.

## Menjalankan di komputer lokal

Prasyarat: **Node.js 22**, **pnpm 10** (`corepack enable`), **PostgreSQL 16** (lokal atau Docker).

```bash
pnpm install
cp .env.example .env
```

Ubah `.env` untuk pengembangan lokal:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/purchasing
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/purchasing
APP_URL=http://localhost:3000
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./storage
EMAIL_TRANSPORT=log
SESSION_SECRET=dev-secret-yang-cukup-panjang-123
CRON_SECRET=dev-cron-secret
```

Lalu:

```bash
createdb purchasing                 # atau: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
pnpm db:deploy                      # buat tabel
pnpm db:seed                        # data dasar (peran, pengaturan, kategori, aturan contoh, FAQ)
pnpm db:seed:demo                   # opsional: bagian, pengguna, vendor & transaksi contoh
pnpm dev                            # http://localhost:3000
```

### Akun demo (`pnpm db:seed:demo`, password `Demo12345`)

| Username | Peran | Coba |
|---|---|---|
| `budi`, `dewi` | Pegawai / pemohon | Buat & lacak pengajuan, konfirmasi serah terima |
| `sari` | Atasan & kepala bagian Operasional | Setujui pengajuan tim |
| `andi` | Kepala bagian TI | Setujui pengajuan TI |
| `lina` | Keuangan | Tahap persetujuan nilai besar / melebihi anggaran |
| `rina`, `yusuf` | Purchasing | Antrean, PO, penerimaan, serah terima |
| `hendra` | Pimpinan | Dashboard & laporan lintas bagian |
| `admin` | Administrator | Semua menu Administrasi |

## Perintah penting

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Server pengembangan |
| `pnpm build` / `pnpm start` | Build & jalankan produksi |
| `pnpm lint` · `pnpm typecheck` | Pemeriksaan kode |
| `pnpm test` | Uji unit & integrasi (butuh database `purchasing_test`, dibuat migrasinya otomatis) |
| `pnpm test:e2e` | Uji end-to-end Playwright (memakai data demo) |
| `pnpm db:migrate` | Buat migrasi baru setelah mengubah `prisma/schema.prisma` |
| `pnpm db:deploy` | Terapkan migrasi |
| `pnpm db:studio` | Lihat isi database |

## Struktur

```
prisma/              skema, migrasi (termasuk RLS & constraint), seed
src/app/             halaman (App Router) & route handler (/api/*)
src/components/      komponen UI (ui = shadcn, app = komponen aplikasi)
src/server/          lapisan server: auth, db, storage, notifikasi, laporan, job
src/server/modules/  logika bisnis per domain — satu-satunya tempat yang mengubah data
src/lib/             util bersama (format, status, izin, skema)
tests/               unit, integrasi (PostgreSQL asli), e2e (Playwright)
deploy/              Caddy, penjadwal & backup untuk Docker Compose
docs/                riset, deployment, operasional, panduan pengguna, ERD
```

## Dokumentasi

- 🚀 **[Panduan deployment](docs/deployment/README.md)** — Vercel + Supabase (langkah demi langkah), Netlify, Docker on-premise, backup & restore
- 🛠️ [Panduan operasional Admin](docs/operasional.md) — pengaturan awal, rutinitas, pemantauan, keamanan
- 👥 [Panduan pengguna](docs/panduan-pengguna.md) — per peran
- 🗃️ [Struktur data (ERD)](docs/database/erd.md)
- 🔎 [Riset ERP, analisis, & optimasi](docs/00-riset-analisis-optimasi.md)

## Catatan kebijakan

Nilai bawaan (aturan persetujuan contoh, tenggat 48 jam kerja, ketentuan dokumen, toleransi harga 0%)
adalah **contoh** untuk uji coba, ditandai jelas di aplikasi, dan harus disesuaikan dengan kebijakan
kantor oleh Admin sebelum dipakai resmi.
