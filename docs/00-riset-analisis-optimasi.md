# Riset ERP, Analisis Dokumen, dan Rekomendasi Optimasi

**Proyek:** Sistem Pengajuan Barang dan Pelacakan Purchasing
**Tanggal:** 9 Oktober 2026
**Dokumen sumber:** `docs/referensi/PRD.md`, `docs/referensi/desain-teknis.md`, `docs/referensi/erd-v1.md`
**Status:** Usulan, menunggu konfirmasi tech stack dan beberapa keputusan

---

## 1. Ringkasan

Ketiga dokumen sudah matang: ruang lingkup jelas, arsitektur *modular monolith* tepat untuk volume < 50 pengajuan/bulan, dan prinsip integritas (versi, snapshot, audit, transisi status di backend, nilai uang desimal) sudah sesuai praktik ERP.

Riset terhadap cara ERP besar (SAP MM, Odoo Purchase, ERPNext Buying) menangani *procure-to-pay* menghasilkan **15 optimasi**. Sebagian besar menutup celah antar-dokumen dan membuat butir TBD bisa **dikonfigurasi admin**, bukan dikodekan, sehingga aplikasi bisa dibangun sekarang tanpa menunggu semua kebijakan disahkan.

Temuan terpenting:

1. **File ERD terpotong** di bagian 7.4 (`vendor_quotes`). Tabel item pesanan, alokasi, penerimaan, selisih, serah terima, dokumen, notifikasi, dan audit belum ada rinciannya. Bagian 6 dokumen ini melengkapinya.
2. **Status pengajuan berbeda di tiap dokumen** (PRD 17 status, ERD 12 status pengajuan + 12 status PO yang saling tumpang tindih). Usulan: satu *state machine* per jenis dokumen, dan pemohon cukup melihat 6 tahap sederhana.
3. **Persetujuan perubahan harga/kuantitas belum punya tempat di ERD.** Usulan: mesin persetujuan generik yang dipakai ulang untuk pengajuan, perubahan, pembatalan, dan penyelesaian selisih.
4. **"Supervisor pemohon" belum ada relasinya.** PRD mewajibkan Supervisor pemohon menyetujui perubahan harga, tetapi ERD belum punya kolom atasan langsung.

---

## 2. Riset: Cara ERP Menangani Procure-to-Pay

### 2.1 Rantai dokumen standar

| Tahap | SAP MM | Odoo | ERPNext | Sistem ini |
|---|---|---|---|---|
| Kebutuhan | Purchase Requisition | (Purchase Request) | Material Request | **Pengajuan** |
| Persetujuan | Release Strategy | PO Approval (ambang nilai) | Workflow | **Persetujuan** (matriks) |
| Penawaran | RFQ / Quotation | RFQ | RFQ → Supplier Quotation | **Penawaran vendor** |
| Pemesanan | Purchase Order | Purchase Order | Purchase Order | **Pesanan (PO)** |
| Penerimaan | Goods Receipt | Receipt | Purchase Receipt | **Penerimaan barang** |
| Tagihan | Invoice Verification | Vendor Bill | Purchase Invoice | *Di luar lingkup awal* |
| Pembayaran | Payment Run | Payment | Payment Entry | *Di luar lingkup awal* |
| Distribusi internal | (Goods Issue) | (Internal Transfer) | (Material Issue) | **Serah terima** |

ERPNext menyusun siklus pembelian sebagai rantai dokumen yang saling terhubung. Setiap dokumen dapat dibuat dari dokumen sebelumnya ("Create from"), sehingga jejaknya utuh dari permintaan sampai pembayaran.

### 2.2 Pola yang dipakai ERP dan relevan untuk sistem ini

| # | Pola ERP | Keterangan | Penerapan |
|---|---|---|---|
| P1 | **Document chaining** | Dokumen berikutnya dibuat *dari* dokumen sebelumnya dan menyimpan tautan | PO dibuat dari pengajuan di antrean; penerimaan dari PO; serah terima dari penerimaan |
| P2 | **Release strategy / approval matrix** | SAP mengarahkan PR/PO ke approver berdasarkan nilai, grup material, dan unit. Dokumen terblokir sampai semua kode rilis diberikan dan tidak bisa menjadi dokumen turunan | Pengajuan tidak bisa masuk antrean, dan PO tidak bisa dipesan, sebelum persetujuan lengkap |
| P3 | **Ambang nilai bertingkat** | Odoo: PO di atas nominal tertentu perlu persetujuan manajer | `approval_rules.min_amount/max_amount` |
| P4 | **Segregation of Duties (SoD)** | Pemohon tidak boleh menyetujui pengajuannya sendiri. Satu orang sebaiknya tidak sekaligus menjadi approver, pembuat PO, dan penerima barang | Aturan *guard* di backend + peringatan konfigurasi |
| P5 | **Penerimaan parsial / backorder** | PO tetap terbuka untuk sisa kuantitas | Penerimaan berulang per PO, sisa dihitung otomatis |
| P6 | **Rejected quantity** | Penerimaan mencatat kuantitas diterima dan ditolak secara terpisah | `goods_receipt_items.qty_accepted / qty_rejected` |
| P7 | **2/3-way matching** | Kuantitas PO, diterima, dan ditagih harus cocok | *2-way* (PO dan penerimaan) di rilis awal; *3-way* saat modul tagihan ditambahkan |
| P8 | **Chatter / timeline** | Odoo menampilkan pesan, catatan, aktivitas, dan perubahan field dalam satu umpan di setiap dokumen | Panel **Riwayat** terpadu di setiap transaksi |
| P9 | **Activities / to-do** | Tugas terjadwal yang melekat ke dokumen | **Pusat Tugas** |
| P10 | **Number series** | Penomoran per jenis dokumen dan per tahun | `PB-2026-00001`, `PO-2026-00001`, dst. |
| P11 | **Status bar** | Tahap dokumen ditampilkan sebagai progres horizontal | *Stepper* di halaman detail |
| P12 | **Separate inbox vs tracking** | Antrean "perlu tindakan saya" dipisahkan dari tampilan "pantau milik saya" | Menu *Persetujuan* dan *Pengajuan Saya* terpisah |
| P13 | **Outbox / antrean pekerjaan** | Email dan notifikasi tidak boleh menggagalkan transaksi bisnis | Tabel outbox di PostgreSQL + worker |

### 2.3 Pola UX aplikasi persetujuan dan ERP modern

- **Pisahkan "tindakan saya" dari "pantauan saya".** Approver butuh *inbox* tindakan; pemohon butuh *timeline* posisi pengajuan.
- **Tata letak daftar + detail.** Kartu atau tabel di kiri, detail di kanan (desktop); di HP menjadi daftar lalu halaman detail.
- **Default ke subset yang perlu ditindaklanjuti**, dengan jumlah yang terlihat dan penjelasan saat daftar kosong.
- **Tampilkan rute lengkap, bukan hanya tahap saat ini**, termasuk approver paralel yang sudah dan belum memutuskan.
- **Kontrol keputusan diletakkan setelah konteks.** Approver membaca ringkasan dulu, lalu menekan Setujui/Tolak. Penolakan wajib disertai alasan.
- **Prioritas dan tenggat sebagai kolom utama**, dengan penanda *Terlambat*.
- **Dashboard per persona**: pemohon (pengajuan saya), approver (menunggu saya), purchasing (antrean dan keterlambatan), pimpinan (keterlambatan kritis dan anggaran).

---

## 3. Analisis Dokumen yang Dikirim

### 3.1 Kekuatan (dipertahankan)

- Modular monolith, satu database, Docker Compose. Tepat untuk skala dan tim kecil.
- Snapshot nama/spesifikasi/harga di item dan versi pengajuan.
- Keputusan persetujuan terhubung ke versi dan tidak pernah ditimpa.
- `NUMERIC` untuk uang, `TIMESTAMPTZ` UTC, UUID sebagai PK.
- Pemisahan `users` dan `employees`.
- `purchase_order_requests` dan alokasi item untuk penggabungan pembelian.
- Prinsip "backend adalah sumber kebenaran status" dan "aturan TBD tidak dikodekan sebagai kebijakan".

### 3.2 Celah dan inkonsistensi

| # | Temuan | Dampak | Usulan |
|---|---|---|---|
| G1 | ERD berhenti di 7.4 `vendor_quotes` | Modul penerimaan s.d. audit belum terdefinisi | Dilengkapi di bagian 6 |
| G2 | Status berbeda: PRD (17), ERD pengajuan (12), ERD PO (12); `READY_FOR_HANDOVER` ada di dua tempat | Logika ganda, laporan membingungkan | Satu state machine per dokumen (O1) |
| G3 | PRD FR-AUTH-01 login dengan **username**, ERD `users` tidak punya `username` | Tidak sesuai kebutuhan | Tambah `users.username` unik; login dengan username **atau** email |
| G4 | PRD FR-REQ-02: tiap item punya "tanggal dibutuhkan"; ERD hanya di header | Data hilang | `requests.needed_date` (default) + `request_items.needed_date` (opsional) |
| G5 | Desain teknis: `requester_employee_id`; ERD: `requester_id → users` | Ambigu | `requester_id → users` + snapshot `department_id` saat diajukan |
| G6 | "Supervisor pemohon" wajib menyetujui perubahan harga (FR-CHG-02), tetapi tidak ada relasi atasan | Tidak bisa diotomatisasi | `employees.supervisor_employee_id` + `departments.head_user_id` |
| G7 | Perubahan harga/qty/spesifikasi setelah disetujui tidak punya entitas | Re-approval tidak terlacak | Tabel `change_requests` + mesin persetujuan generik (O2) |
| G8 | PRD punya entitas *Discrepancy*, ERD tidak | Barang rusak/kurang tidak terkelola | Tabel `receipt_discrepancies` dengan alur penyelesaian |
| G9 | PRD punya *Task*, *SupportIssue*, *SystemConfig*; ERD tidak | Fitur tidak lengkap | Pusat Tugas diturunkan dari data (O8); `support_tickets`, `system_settings` |
| G10 | Semantik paralel vs berjenjang belum diputuskan (FR-APR-05) | Pengembangan tertahan | Dibuat **konfigurasi** per aturan (O3) |
| G11 | Tidak ada pencegahan approve diri sendiri | Melanggar SoD | Guard backend (O5) |
| G12 | Idempotensi diminta PRD 9.3, tidak ada di ERD | Risiko transaksi ganda | `idempotency_keys` (O10) |
| G13 | Tidak ada penanganan edit bersamaan | Dua petugas saling menimpa | *Optimistic locking* `lock_version` (O10) |
| G14 | Relasi dokumen ke banyak entitas belum dirancang | Lampiran bisa salah tautan | FK eksplisit nullable + `CHECK` tepat satu induk (O12) |
| G15 | Anggaran (FR-PUR-11) tidak punya sumber data | Peringatan anggaran tidak bisa jalan | `department_budgets` per tahun, **hanya peringatan** |
| G16 | Durasi kerja aktif (FR-RPT-11) butuh kalender kerja | Laporan durasi tidak akurat | `holidays` + jam kerja di `system_settings` |
| G17 | Penggantian barang harus terhubung ke pesanan asal | Jejak hilang | `purchase_orders.replaces_purchase_order_id` + tautan ke selisih |

> **Catatan:** file `log_list.sig` yang ikut terkirim adalah tanda tangan digital 512-byte (format yang dipakai Chrome untuk daftar log *Certificate Transparency*). File ini tidak berkaitan dengan proyek dan diabaikan.

---

## 4. Optimasi yang Direkomendasikan

### O1. State machine per dokumen + tahap sederhana untuk pemohon

Setiap dokumen punya status sendiri yang divalidasi backend:

**Pengajuan (`requests.status`)**

```
DRAFT ──submit──▶ PENDING_APPROVAL ──semua setuju──▶ APPROVED (masuk antrean)
  ▲                  │      │                            │
  │ tarik            │      └─ approver/rute tak valid ─▶ ON_HOLD
  └──────────────────┤
                     └─ ditolak/minta revisi ─▶ REVISION_REQUIRED ─kirim ulang─▶ PENDING_APPROVAL
APPROVED ─PO dibuat─▶ IN_PROCUREMENT ─barang lengkap/selisih tuntas─▶ READY_FOR_HANDOVER
READY_FOR_HANDOVER ─serah terima disiapkan─▶ AWAITING_CONFIRMATION ─pemohon konfirmasi─▶ COMPLETED
(hampir semua status) ─▶ CANCELLATION_REQUESTED ─▶ CANCELLED
```

**Pesanan (`purchase_orders.status`)**: `DRAFT → PENDING_CHANGE_APPROVAL → READY_TO_ORDER → ORDERED → PARTIALLY_RECEIVED → ON_HOLD (masalah barang) → RECEIVED → CLOSED`, plus `CANCELLED`.

**Pemohon cukup melihat 6 tahap** (stepper): `Draf → Persetujuan → Pengadaan → Pengiriman → Serah Terima → Selesai`. Tahap ini *diturunkan* dari status pengajuan dan PO terkait. Status PRD seperti "Dipesan ke vendor", "Diterima sebagian", dan "Ditahan karena masalah barang" tetap tampil sebagai keterangan di bawah tahap.

"Ditandai untuk peninjauan" (FR-PUR-18) menjadi **penanda** (`needs_review_at`), bukan status, karena bisa terjadi pada status apa pun.

### O2. Mesin persetujuan generik

Satu mesin yang sama untuk empat jenis subjek:

| Subjek | Contoh | Approver default |
|---|---|---|
| `REQUEST` | Pengajuan baru / kirim ulang | Matriks persetujuan |
| `CHANGE_REQUEST` | Harga aktual ≠ estimasi, qty berubah, spesifikasi berubah | Pemohon + Supervisor pemohon (FR-CHG-02); bisa ditambah via matriks |
| `CANCELLATION` | Pembatalan setelah tahap tertentu | Sesuai matriks |
| `DISCREPANCY_RESOLUTION` | Usulan penyelesaian kekurangan/kerusakan | Sesuai matriks |

Tabel `approval_instances` memakai kolom `subject_type` + FK eksplisit ke subjeknya.

### O3. Mode rute dapat dikonfigurasi

- Per **aturan**: `routing_mode = SEQUENTIAL` (tahap berjenjang, pola SAP/Odoo) atau `PARALLEL` (semua tahap aktif bersamaan, sesuai hasil brainstorming FR-APR-05).
- Per **tahap**: `approval_mode = ALL` (semua harus setuju, FR-APR-04) atau `ANY`.
- Jika tidak ada aturan yang cocok atau lebih dari satu aturan dengan prioritas sama, pengajuan **ditahan (`ON_HOLD`)** dan admin diberi tahu. Sistem tidak menebak.

### O4. Resolver approver

Tiap tahap aturan menentukan approver dengan salah satu cara:

- `USER`: orang tertentu (dikonfigurasi admin, FR-APR-02)
- `ROLE`: semua pengguna dengan peran X (opsional dibatasi bagian pemohon)
- `REQUESTER_SUPERVISOR`: atasan langsung pemohon
- `DEPARTMENT_HEAD`: kepala bagian pemohon

Hasil resolusi disimpan sebagai `approval_assignments` (snapshot), sehingga perubahan konfigurasi tidak mengubah proses yang sedang berjalan (FR-APR-11).

### O5. Guard Segregation of Duties

- Approver = pemohon → penugasan itu dilewati dan dicatat. Jika tahap jadi kosong, pengajuan `ON_HOLD`.
- Approver nonaktif → `ON_HOLD` (FR-APR-08). Tidak ada delegasi otomatis. Admin dapat **mengalihkan** penugasan secara manual dan tercatat di audit.
- Admin tidak otomatis bisa menyetujui (hak teknis ≠ kewenangan bisnis).
- Peringatan konfigurasi jika satu orang menjadi approver sekaligus purchasing pada transaksi yang sama.

### O6. Buku besar kuantitas per item

Setiap item pengajuan melacak kuantitas melalui rantai dokumen:

```
diminta ─▶ dialokasikan ke PO ─▶ diterima baik ─▶ diserahkan
                                 └▶ ditolak/kurang ─▶ penyelesaian (ganti / terima selisih / batal)
```

Constraint di backend + database:

- Σ alokasi ≤ qty disetujui
- Σ diterima ≤ qty dipesan (+ toleransi 0)
- Σ diserahkan ≤ Σ diterima baik yang dialokasikan

### O7. Timeline terpadu per transaksi (pola *chatter*)

Satu panel kronologis berisi perubahan status, keputusan persetujuan, komentar, unggahan dokumen, tindak lanjut vendor, dan perubahan nilai (lama → baru). Data diambil dari tabel riwayat yang sudah ada, tanpa duplikasi.

### O8. Pusat Tugas diturunkan dari data

Tugas tidak disimpan sebagai tabel terpisah, melainkan dihitung dari kondisi nyata:

- Penugasan persetujuan yang `PENDING` untuk saya
- Pengajuan saya yang `REVISION_REQUIRED`
- Serah terima menunggu konfirmasi saya
- (Purchasing) antrean baru, PO melewati ETA, selisih terbuka, transaksi lama
- (Admin) pengajuan `ON_HOLD`, akun menunggu aktivasi

Dengan begitu tugas tidak pernah "basi" atau tidak sinkron.

### O9. Outbox + penjadwal di PostgreSQL

Notifikasi dibuat dalam transaksi yang sama dengan perubahan bisnis (tabel `notifications` + `email_outbox`). Worker mengirim email dengan *retry* dan backoff. Penjadwal harian menangani pengingat, eskalasi, dan penandaan transaksi lama. Semuanya memakai *unique key* agar aman dijalankan ulang dan tidak menggandakan notifikasi. **Tidak perlu Redis.**

### O10. Idempotensi + optimistic locking

- Setiap aksi "buat/kirim" menyertakan `Idempotency-Key` dari klien. Permintaan berulang mengembalikan hasil yang sama.
- Tabel transaksi punya `lock_version`. Update dengan versi lama ditolak dengan pesan "Data sudah diubah orang lain, muat ulang".

### O11. Penomoran dokumen

Tabel `number_sequences (doc_type, year, last_value)` dengan *row lock*. Hasilnya tanpa duplikat dan mudah dibaca: `PB-2026-00001` (pengajuan), `PO-2026-00001`, `GR-2026-00001` (penerimaan), `ST-2026-00001` (serah terima).

### O12. Aturan dokumen wajib yang dapat dikonfigurasi

`document_requirements (stage, document_type, min_count, is_active)`. Contoh: `REQUEST_SUBMIT → LAMPIRAN_PENGAJUAN ≥ 1`, `PO_ORDER → BUKTI_PESANAN ≥ 1`, `PO_ORDER → PENAWARAN ≥ N`. Backend menolak transisi jika belum terpenuhi (FR-DOC-06), dan UI menampilkan *checklist* kelengkapan sebelum tombol aksi. Jumlah penawaran minimum (TBD FR-PUR-07) cukup diatur di sini.

### O13. Draf tidak pernah hilang

Formulir pengajuan disimpan otomatis ke perangkat (*local draft*) setiap beberapa detik dan ke server saat pengguna berhenti mengetik. Status "Tersimpan di perangkat / Tersimpan di server / Terkirim" selalu terlihat (PRD 9.3).

### O14. Tabel cerdas

Pencarian global (Ctrl+K) untuk nomor, judul, dan nama barang; filter tersimpan; tab cepat ("Menunggu saya", "Terlambat", "Mendesak"); pagination dan pengurutan di server; tampilan kartu otomatis di HP.

### O15. Laporan dari riwayat status

Durasi tiap tahap dihitung dari `*_status_history` (durasi kalender + durasi jam kerja memakai `holidays` dan jam kerja). Ekspor Excel/PDF mengikuti filter dan hak akses.

---

## 5. Prinsip UI/UX (Clean & Easy to Use)

| Aspek | Keputusan |
|---|---|
| Gaya visual | Netral, banyak ruang putih, satu warna aksen, sudut membulat halus, ikon garis. Komponen **shadcn/ui** + Tailwind |
| Tipografi | Inter, ukuran dasar 14–15 px untuk tabel padat dan 16 px di HP |
| Navigasi | Sidebar per peran (hanya menu yang relevan), *top bar* berisi pencarian global, lonceng notifikasi, dan profil |
| Bahasa & format | Bahasa Indonesia; Rupiah `Rp 1.250.000`; tanggal `9 Okt 2026`; zona waktu WITA (dapat dikonfigurasi) |
| Status | *Badge* berwarna konsisten (abu = draf, kuning = menunggu, biru = proses, hijau = selesai, merah = masalah/batal) |
| Halaman detail | Header (nomor, judul, badge) → stepper 6 tahap → kotak **"Tindakan berikutnya"** → tab Item / Persetujuan / Pengadaan / Dokumen → panel Riwayat |
| Formulir pengajuan | Satu halaman, tabel item yang bisa ditambah baris, autocomplete katalog (tetap boleh ketik bebas), total otomatis, area tarik-lepas lampiran, *checklist* sebelum kirim |
| Approver di HP | Daftar kartu → ringkasan → tombol besar **Setujui** / **Tolak/Minta Revisi** (alasan wajib) |
| Purchasing | Antrean diurutkan berdasarkan prioritas final lalu tanggal dibutuhkan; centang beberapa pengajuan → **Buat PO gabungan** |
| Umpan balik | *Toast* untuk sukses/gagal, konfirmasi untuk aksi yang tidak dapat dibatalkan, *empty state* yang menjelaskan langkah berikutnya |
| Aksesibilitas | Kontras WCAG AA, navigasi keyboard, label form jelas, pesan error di dekat field |
| Mode gelap | Tersedia (mengikuti pengaturan perangkat) |

---

## 6. ERD Lengkap yang Dioptimasi (ringkasan tabel)

Kolom penuh, tipe, constraint, dan indeks akan ditulis di skema Prisma dan di `docs/database/erd.md` saat build.

**A. Organisasi & akses**
`departments` (+`head_user_id`), `employees` (+`supervisor_employee_id`), `users` (+`username`, `failed_login_count`, `locked_until`), `roles`, `permissions`, `user_roles`, `role_permissions`, `user_department_scopes`, `sessions`, `password_reset_tokens`

**B. Katalog**
`item_categories`, `catalog_items`

**C. Pengajuan**
`requests` (+`lock_version`, `needs_review_at`), `request_items` (+`needed_date`), `request_versions`, `request_version_items`, `request_status_history`, `request_comments`

**D. Persetujuan (generik)**
`approval_rules` (+`subject_type`, `routing_mode`), `approval_rule_steps` (+`approver_type`, `approver_user_id`, `approver_role_id`, `approval_mode`), `approval_instances` (+`subject_type`, FK subjek), `approval_steps`, `approval_assignments`, `approval_decisions`

**E. Purchasing**
`vendors`, `vendor_quotes` (+`is_selected`, `selection_note`), `purchase_orders` (+`replaces_purchase_order_id`, `lock_version`), `purchase_order_requests`, `purchase_order_items`, `purchase_order_item_allocations`, `purchase_order_status_history`, `purchase_followups`, `change_requests`, `change_request_items`, `department_budgets`

**F. Penerimaan & serah terima**
`goods_receipts`, `goods_receipt_items` (+`qty_accepted`, `qty_rejected`), `receipt_discrepancies` (jenis, qty, status, jenis penyelesaian, PO pengganti), `handovers`, `handover_items`

**G. Dokumen**
`documents` (FK eksplisit ke induk + `CHECK` satu induk, `sha256`, `deleted_at`), `document_requirements`

**H. Notifikasi**
`notifications`, `email_outbox`

**I. Audit, konfigurasi, dukungan**
`audit_logs` (+`ip_address`, `user_agent`), `system_settings`, `number_sequences`, `idempotency_keys`, `holidays`, `support_tickets`, `support_ticket_comments`, `faq_articles`

---

## 7. Rekomendasi Tech Stack

### Opsi A (direkomendasikan): sesuai dokumen, dengan pustaka pelengkap

| Lapisan | Teknologi | Alasan |
|---|---|---|
| Monorepo | pnpm workspaces | Sudah diputuskan di desain teknis |
| Frontend | **Next.js** (App Router) + TypeScript | Sudah diputuskan; SSR cepat, routing rapi |
| UI | **Tailwind CSS + shadcn/ui** + lucide icons | Tampilan bersih, konsisten, mudah dirawat, tanpa lisensi |
| Data & form | TanStack Query, TanStack Table, React Hook Form + **Zod** | Tabel filter/sort server-side, validasi form |
| Kontrak bersama | `packages/contracts` (skema Zod) | Satu definisi validasi untuk frontend dan backend |
| Backend | **NestJS** + TypeScript | Modul per domain sesuai daftar modul, guard RBAC, OpenAPI/Swagger otomatis |
| ORM & DB | **Prisma** + **PostgreSQL 16** | Sudah diputuskan; migrasi terkontrol |
| Auth | Sesi *cookie* HttpOnly di PostgreSQL, hash **Argon2id**, *rate limit* login, proteksi CSRF | Sesuai desain teknis 10.1, tanpa token di localStorage |
| Job & scheduler | Worker + outbox di PostgreSQL | Email *retry*, pengingat harian, eskalasi, tanpa Redis |
| Email | Nodemailer (SMTP kantor); Mailpit untuk development | |
| File | Volume privat lokal (adapter S3/MinIO bisa ditambah) | Sesuai PRD 10.1 |
| Ekspor | ExcelJS (xlsx) + pdfmake (PDF) | Ringan, tanpa browser headless |
| Testing | Vitest (unit/integrasi) + Playwright (E2E) | |
| Deploy | Docker Compose: `postgres`, `api`, `web`, `nginx`, `backup` | Sesuai desain teknis 14 |

Versi stabil saat ini (Okt 2026) yang akan dikunci: Next.js 16.x, NestJS 12.x, PostgreSQL 16, Node.js 22 LTS.

### Opsi B: Next.js full-stack (satu aplikasi)

Backend ditulis sebagai *service layer* + *route handlers* di dalam Next.js. Lebih sedikit kode dan hanya satu container aplikasi, tetapi batas frontend/backend kurang tegas, dan API untuk aplikasi mobile atau integrasi HRIS harus dirancang terpisah nanti.

### Opsi C: Laravel + Filament (PHP)

Sangat cepat untuk aplikasi internal yang dominan panel admin. Cocok **jika** tim pemelihara terbiasa PHP. Konsekuensinya, desain teknis harus ditulis ulang.

**Alasan memilih A:** dokumen sudah dirancang per modul NestJS. Aturan "backend adalah sumber kebenaran" lebih mudah ditegakkan dengan *guard* dan *service* NestJS. OpenAPI siap untuk integrasi HRIS/keuangan di masa depan. TypeScript dipakai end-to-end. Biaya tambahannya hanya satu container lagi, yang tidak berarti dengan Docker Compose.

---

## 8. Rencana Build (setelah konfirmasi)

1. Scaffold monorepo, Docker Compose dev, lint, typecheck, test.
2. Skema Prisma lengkap (bagian 6), migrasi, seed data contoh (bagian, pengguna per peran, katalog, vendor, aturan persetujuan contoh yang **ditandai sebagai contoh**).
3. Auth, pengguna, peran, bagian, audit.
4. Pengajuan: draf, item, lampiran, kirim, tarik, revisi, versi.
5. Mesin persetujuan + inbox + notifikasi.
6. Purchasing: antrean, vendor, penawaran, PO gabungan, perubahan harga/qty, tindak lanjut.
7. Penerimaan parsial, selisih, penggantian, serah terima, penutupan.
8. Dashboard per peran, laporan, ekspor, pusat tugas, FAQ, tiket bantuan.
9. Hardening: uji E2E alur penuh, uji hak akses, backup + restore.
10. Dokumentasi: `README`, `docs/deployment/` langkah demi langkah, `docs/operasional/` (backup, restore, troubleshooting).

---

## 9. Sumber Riset

- ERPNext, *Procurement Cycle Overview*: https://docs.frappe.io/erpnext/procurement-cycle-overview
- ERPNext, *Supplier Quotation*: https://docs.frappe.io/erpnext/supplier-quotation
- ERPNext, *Purchase Order*: https://docs.frappe.io/erpnext/user/manual/en/purchase-order
- ERPNext, *Purchase Receipt*: https://docs.frappe.io/erpnext/purchase-receipt
- SAP Learning, *Releasing Purchase Requisitions*: https://learning.sap.com/courses/purchasing-in-sap-s-4hana/releasing-purchase-requisitions
- Guru99, *Release Strategy in SAP MM*: https://www.guru99.com/release-procedures-for-purchasing-documents.html
- Michael Management, *SAP PO Release Strategy*: https://www.michaelmanagement.com/blog/sap/how-to-configure-sap-purchase-order-release-strategy
- WA Country Health Service, *iProcurement Governance and Segregation of Duties Policy*: https://wacountry.health.wa.gov.au/~/media/WACHS/Documents/About-us/Policies/iProcurement-Governance-and-Segregation-of-Duties-Policy.pdf
- Zapliance, *Segregation of duties in purchase to pay*: https://zapliance.com/en/?p=11449
- Gravitee, *Purchase Requisition APIs: Workflows and Governance*: https://www.gravitee.io/corpus/gen-1938/procure-to-pay/purchase-requisition-apis.html
- Cybrosys, *Odoo 17 Chatter*: https://cybrosys.com/odoo/odoo-books/odoo-17-development/emails/chatter
- Taqtics, *Approvals and Workflow Status*: https://docs.taqtics.co/process-and-workflows/approvals-and-workflow-status
- Informatica, *Viewing the workflow status*: https://onlinehelp.informatica.com/IICS/prod/c360/en/hh-c360-review-tasks/Viewing_the_workflow_status.html
- freeCodeCamp, *Fix the dual write problem with the Outbox Pattern*: https://www.freecodecamp.org/news/how-to-fix-the-dual-write-problem-in-node-js-with-the-outbox-pattern/
