# Desain Teknis Sistem Pengajuan Barang dan Pelacakan Purchasing

**Versi:** 1.0, Draft Desain Teknis
**Status:** Rancangan awal
**Bahasa:** Indonesia
**Stack utama:** Next.js, TypeScript, NestJS, PostgreSQL, Prisma ORM
**Pendekatan:** Monorepo + Modular Monolith

---

## 1. Ringkasan Eksekutif

Dokumen ini menjadi panduan teknis awal pembangunan Sistem Pengajuan Barang dan Pelacakan Purchasing untuk kebutuhan internal kantor.

Sistem dirancang untuk mendigitalisasi proses:

1. Pengajuan barang oleh pegawai.
2. Pemeriksaan dan persetujuan pengajuan.
3. Revisi pengajuan.
4. Antrean dan transaksi purchasing.
5. Pengelolaan penawaran dan pesanan vendor.
6. Pelacakan keterlambatan pesanan.
7. Penerimaan barang.
8. Serah terima barang kepada pemohon.
9. Pengelolaan dokumen pendukung.
10. Notifikasi, laporan, dan audit aktivitas.

Sistem akan dirancang agar dapat berjalan pada server internal kantor dan dapat dikembangkan untuk akses dari luar kantor apabila diperlukan.

### 1.1 Keputusan Teknologi Awal

| Komponen | Teknologi |
|---|---|
| Frontend | Next.js + TypeScript |
| Backend | NestJS + TypeScript |
| Database | PostgreSQL |
| Database ORM | Prisma ORM |
| Styling | Tailwind CSS |
| Package manager | pnpm |
| Version control | Git |
| Container | Docker |
| Multi-container orchestration awal | Docker Compose |
| Reverse proxy | Nginx |
| Email | SMTP |
| File storage | Penyimpanan privat |
| Testing | Unit test, integration test, end-to-end test |

Versi paket akan dikunci berdasarkan versi stabil yang kompatibel ketika proyek mulai dibuat.

Tidak perlu menggunakan microservices, Kubernetes, atau infrastruktur kompleks pada tahap awal.

---

## 2. Tujuan dan Ruang Lingkup

### 2.1 Tujuan

Sistem harus mampu:

- Mempercepat proses pengajuan barang.
- Memberikan transparansi status pengajuan.
- Mengurangi komunikasi manual melalui WhatsApp.
- Menyimpan seluruh riwayat persetujuan dan revisi.
- Mengatur pekerjaan purchasing melalui antrean terpusat.
- Melacak pembelian sampai barang diterima dan diserahkan.
- Menyediakan laporan yang bisa difilter dan diekspor.
- Memastikan dokumen transaksi tersimpan dengan aman.
- Menyediakan audit trail untuk perubahan penting.
- Memungkinkan sistem dikembangkan secara bertahap tanpa harus dibangun ulang.

### 2.2 Di Luar Ruang Lingkup Awal

Hal-hal berikut tidak termasuk tahap pertama:

- ERP penuh.
- Sistem inventaris menyeluruh.
- Modul pengadaan jasa.
- Integrasi otomatis dua arah dengan HRIS.
- Integrasi penuh dengan akuntansi.
- Microservices.
- Infrastruktur Kubernetes.
- Otomatisasi seluruh proses keuangan kantor.

### 2.3 Asumsi Operasional

- Volume awal diperkirakan kurang dari 50 pengajuan per bulan.
- Komputer menjadi perangkat utama.
- HP digunakan untuk pemeriksaan dan persetujuan.
- Bahasa antarmuka menggunakan Bahasa Indonesia.
- Data pegawai diimpor dari HRIS melalui proses manual pada tahap awal.
- Pengajuan, persetujuan, transaksi pembelian, penerimaan, dan serah terima harus dapat dilacak satu sama lain.

---

## 3. Arsitektur Aplikasi

### 3.1 Pola Arsitektur

Sistem menggunakan pendekatan **Modular Monolith**.

Artinya, backend merupakan satu aplikasi utama, tetapi kode di dalamnya dibagi menjadi modul berdasarkan tanggung jawab bisnis.

Frontend dan backend merupakan aplikasi terpisah, tetapi dikelola dalam satu repositori proyek.

Keuntungannya:

- Lebih sederhana untuk dikembangkan dan dirawat.
- Tidak memerlukan banyak server atau layanan terpisah.
- Transaksi database lebih mudah dikelola.
- Modul dapat dikembangkan secara independen secara logis.
- Infrastruktur awal tetap sederhana.
- Jika skala bertambah, modul tertentu dapat dipisahkan di masa depan berdasarkan kebutuhan nyata.

### 3.2 Diagram Arsitektur

```
                    PENGGUNA
             Pegawai / Approver / Admin
                         |
                 Browser komputer/HP
                         |
                     HTTPS/TLS
                         |
                       NGINX
                         |
              +----------+----------+
              |                     |
          NEXT.JS                 NESTJS
         FRONTEND                 BACKEND
              |                     |
              |              Aturan bisnis
              |              Validasi input
              |              Pemeriksaan akses
              |              Audit aktivitas
              |                     |
              |                  PRISMA
              |                     |
              |                POSTGRESQL
              |                     |
              |              Data transaksi
              |
              +----------------------------
```

Layanan pendukung:

- Penyimpanan dokumen privat
- SMTP untuk email
- Scheduler untuk pengingat dan eskalasi
- Backup database dan dokumen
- Logging dan monitoring

### 3.3 Alur Kerja Sistem

Contoh alur pengajuan barang:

1. Pegawai membuka aplikasi.
2. Pegawai mengisi formulir pengajuan.
3. Frontend mengirim data ke backend.
4. Backend memvalidasi data, identitas, izin, dan aturan bisnis.
5. Backend menyimpan pengajuan melalui Prisma ke PostgreSQL.
6. Sistem menentukan approver berdasarkan matriks persetujuan.
7. Approver memberikan keputusan.
8. Setelah seluruh persetujuan yang diwajibkan terpenuhi, pengajuan masuk antrean purchasing.
9. Purchasing mencatat penawaran, transaksi, dan pesanan.
10. Vendor mengirim barang.
11. Purchasing mencatat penerimaan.
12. Barang diserahkan kepada pemohon.
13. Pemohon mengonfirmasi penerimaan.
14. Sistem mencatat riwayat aktivitas dan menyelesaikan transaksi jika seluruh persyaratan terpenuhi.

> **Prinsip penting:** frontend tidak boleh menjadi penentu kebenaran status transaksi. Seluruh transisi status harus divalidasi oleh backend.

---

## 4. Struktur Repositori Proyek

Proyek menggunakan monorepo dengan pnpm workspaces.

```
procurement-system/
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── lib/
│   │   │   └── styles/
│   │   └── package.json
│   │
│   └── api/
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── auth/
│       │   ├── users/
│       │   ├── organization/
│       │   ├── catalog/
│       │   ├── requests/
│       │   ├── approvals/
│       │   ├── purchasing/
│       │   ├── vendors/
│       │   ├── receiving/
│       │   ├── handover/
│       │   ├── documents/
│       │   ├── notifications/
│       │   ├── reports/
│       │   └── audit/
│       └── package.json
│
├── packages/
│   ├── database/
│   ├── contracts/
│   └── config/
│
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── backup/
│
├── docs/
│   ├── architecture/
│   ├── database/
│   ├── api/
│   └── deployment/
│
├── scripts/
├── .env.example
├── compose.yaml
├── pnpm-workspace.yaml
└── README.md
```

### 4.1 Fungsi Folder

**`apps/web`**
Berisi seluruh antarmuka pengguna menggunakan Next.js. Contoh fitur:

- Login.
- Dashboard.
- Formulir pengajuan.
- Daftar pengajuan.
- Halaman persetujuan.
- Antrean purchasing.
- Halaman pesanan.
- Penerimaan barang.
- Serah terima.
- Laporan.

**`apps/api`**
Berisi backend menggunakan NestJS. Backend bertanggung jawab atas:

- Validasi data.
- Hak akses.
- Aturan bisnis.
- Persetujuan.
- Transaksi pembelian.
- Penyimpanan data.
- Notifikasi.
- Audit.
- Laporan.

**`packages/database`**
Berisi Prisma schema, migrasi database, konfigurasi Prisma, dan seed data untuk pengujian.

**`packages/contracts`**
Berisi kontrak atau tipe data yang memang perlu dibagikan antara frontend dan backend.

> Jangan mengekspos seluruh model database secara otomatis kepada frontend.

**`infrastructure`**
Berisi konfigurasi deployment, Docker, Nginx, dan backup.

---

## 5. Pembagian Modul Backend

| Modul | Tanggung jawab |
|---|---|
| Auth | Login, logout, sesi, reset password |
| Users | Akun pengguna dan status aktif |
| Organization | Struktur organisasi dan bagian |
| Catalog | Kategori dan katalog barang |
| Requests | Pengajuan, item, draft, revisi, versi |
| Approvals | Matriks persetujuan, penugasan, keputusan |
| Purchasing | Antrean purchasing dan transaksi pembelian |
| Vendors | Data vendor yang dibutuhkan transaksi |
| Receiving | Penerimaan barang |
| Handover | Serah terima kepada pemohon |
| Documents | Metadata file dan pemeriksaan akses |
| Notifications | Notifikasi dan pengingat |
| Reports | Dashboard dan laporan |
| Audit | Riwayat aktivitas dan perubahan data |

Setiap modul memiliki tanggung jawab yang jelas. Sebagai contoh, modul Purchasing tidak boleh melewati aturan persetujuan hanya karena pengajuan sudah masuk antrean.

---

## 6. Rancangan Database Konseptual

Bagian ini merupakan rancangan awal, belum merupakan ERD final.

Nama kolom, tipe data, constraint, indeks, dan kardinalitas perlu dikunci sebelum migrasi database dibuat.

### 6.1 Modul Pengguna dan Organisasi

**Tabel `users`**
Menyimpan akun pengguna aplikasi. Kolom awal: `id`, `email`, `password_hash` (jika autentikasi lokal digunakan), `status`, `last_login_at`, `created_at`, `updated_at`.

Password tidak boleh disimpan dalam bentuk teks asli.

**Tabel `employees`**
Menyimpan data pegawai. Kolom awal: `id`, `employee_number`, `full_name`, `email`, `department_id`, `employment_status`, `hris_source_id`, `imported_at`, `created_at`, `updated_at`.

`employee_number` sebaiknya unik jika tersedia dan konsisten dari HRIS.

Perlu ditentukan apakah setiap pegawai harus memiliki akun aplikasi atau ada akun teknis yang tidak terhubung dengan pegawai.

**Tabel `departments`**
Menyimpan struktur bagian kantor. Kolom awal: `id`, `code`, `name`, `parent_department_id`, `is_active`.

**Tabel `roles`**
Menyimpan daftar peran pengguna. Contoh peran:

- Pegawai.
- Pengelola bagian.
- Approver.
- Purchasing.
- Finance.
- Pimpinan.
- Admin.
- Pemelihara teknis.

**Tabel `permissions`**
Menyimpan izin berdasarkan tindakan. Contoh:

- Melihat pengajuan.
- Membuat pengajuan.
- Menyetujui pengajuan.
- Mengubah prioritas.
- Mencatat pembelian.
- Mengunggah dokumen.
- Melihat laporan lintas bagian.
- Mengelola pengguna.

**Tabel `user_roles`** menghubungkan pengguna dengan peran.
**Tabel `role_permissions`** menghubungkan peran dengan izin.

### 6.2 Modul Katalog Barang

**Tabel `item_categories`**
Menyimpan kategori barang. Contoh: IT, Operasional, Peralatan, Proyek, Lainnya.

**Tabel `items`**
Menyimpan katalog barang yang dikelola admin. Kolom awal: `id`, `category_id`, `name`, `default_specification`, `unit`, `is_active`, `created_at`, `updated_at`.

Barang bebas tetap diperbolehkan pada pengajuan. Barang yang ditulis bebas tidak otomatis menjadi entri katalog.

### 6.3 Modul Pengajuan

**Tabel `requests`**
Menyimpan informasi utama pengajuan. Kolom awal: `id`, `request_number`, `requester_employee_id`, `department_id`, `status`, `urgency_requested`, `priority_final`, `needed_by`, `reason`, `current_version_number`, `submitted_at`, `created_at`, `updated_at`.

- Nomor pengajuan harus unik.
- Status harus memakai nilai yang telah ditentukan, bukan teks bebas.

**Tabel `request_items`**
Menyimpan barang yang diminta. Kolom awal: `id`, `request_id`, `catalog_item_id`, `item_name_snapshot`, `specification_snapshot`, `quantity_requested`, `unit`, `estimated_unit_price`, `reason`, `needed_by`, `created_at`, `updated_at`.

- `catalog_item_id` dapat kosong jika pemohon memasukkan barang bebas.
- Snapshot nama dan spesifikasi diperlukan agar riwayat tidak berubah ketika data katalog diperbarui.

**Tabel `request_versions`**
Menyimpan versi pengajuan. Kolom awal: `id`, `request_id`, `version_number`, `created_by`, `change_reason`, `created_at`, `submitted_at`.

Desain final harus memastikan isi versi yang menjadi dasar keputusan lama dapat direkonstruksi.

**Tabel `request_status_history`**
Menyimpan riwayat perubahan status. Kolom awal: `id`, `request_id`, `from_status`, `to_status`, `changed_by`, `reason`, `created_at`.

### 6.4 Modul Persetujuan

**Tabel `approval_rules`**
Menyimpan aturan persetujuan. Kolom awal: `id`, `name`, `department_id`, `request_type`, `minimum_amount`, `maximum_amount`, `is_active`, `effective_from`, `effective_until`.

Aturan final harus mengikuti matriks kewenangan resmi kantor.

**Tabel `approval_steps`**
Menyimpan tahapan persetujuan. Kolom awal: `id`, `approval_rule_id`, `step_number`, `approval_mode`, `required_approvals`.

`approval_mode` masih perlu diputuskan, misalnya sequential atau parallel pada tingkat tertentu.

**Tabel `approval_assignments`**
Menyimpan penugasan approver untuk suatu pengajuan dan versi.

**Tabel `approval_decisions`**
Menyimpan keputusan approver. Kolom awal: `id`, `approval_assignment_id`, `decision`, `decided_by`, `comment`, `decided_at`, `request_version_id`.

Keputusan lama tidak boleh dihapus ketika pengajuan direvisi.

> **Catatan:** notifikasi kepada semua tingkat secara bersamaan tidak otomatis berarti semua tingkat boleh menyetujui secara paralel. Aturan ini harus dikonfirmasi sebelum implementasi final.

### 6.5 Modul Purchasing dan Vendor

**Tabel `vendors`**
Menyimpan informasi vendor yang diperlukan untuk transaksi. Kolom awal: `id`, `name`, `contact_name`, `email`, `phone`, `address`, `is_active`.

Ini bukan sistem manajemen vendor penuh.

**Tabel `purchase_orders`**
Menyimpan catatan pesanan atau transaksi pembelian. Kolom awal: `id`, `purchase_number`, `vendor_id`, `status`, `ordered_at`, `expected_at`, `created_by`, `notes`, `created_at`, `updated_at`.

**Tabel `purchase_order_items`**
Menyimpan item pembelian. Kolom awal: `id`, `purchase_order_id`, `request_item_id`, `quantity_ordered`, `actual_unit_price`, `line_total`, `status`.

- Model final harus mendukung penggabungan beberapa pengajuan ke satu pembelian.
- Jika satu item pengajuan dapat dipenuhi melalui beberapa pesanan, diperlukan model alokasi yang mampu melacak kuantitas secara tepat.

**Tabel `vendor_quotes`**
Menyimpan informasi penawaran vendor. Kolom awal: `id`, `purchase_order_id` (atau referensi proses pembelian yang sesuai), `vendor_id`, `quoted_amount`, `quoted_at`, `document_id`, `notes`.

Jumlah penawaran yang diwajibkan masih mengikuti kebijakan kantor dan perlu dikonfirmasi.

**Tabel `purchase_followups`**
Mencatat tindak lanjut keterlambatan. Kolom awal: `id`, `purchase_order_id`, `reason`, `new_eta`, `action_taken`, `responsible_user_id`, `vendor_response`, `target_resolution_at`, `created_at`.

### 6.6 Modul Penerimaan

**Tabel `receipts`**
Mencatat setiap peristiwa penerimaan barang dari vendor. Kolom awal: `id`, `purchase_order_id`, `received_at`, `received_by`, `status`, `notes`.

**Tabel `receipt_items`**
Mencatat kuantitas dan kondisi barang yang diterima. Kolom awal: `id`, `receipt_id`, `purchase_order_item_id`, `quantity_received`, `condition`, `discrepancy_type`, `notes`.

- Penerimaan parsial harus tetap tercatat sebagai beberapa peristiwa.
- Barang rusak atau tidak sesuai harus mengikuti proses penyelesaian yang resmi sebelum transaksi ditutup.

### 6.7 Modul Serah Terima

**Tabel `handovers`**
Mencatat serah terima kepada pemohon. Kolom awal: `id`, `request_id` (atau referensi alokasi yang sesuai), `prepared_by`, `requester_confirmed_by`, `prepared_at`, `confirmed_at`, `status`, `notes`.

**Tabel `handover_items`**
Mencatat item dan kuantitas yang diserahkan.

Desain final harus memastikan kuantitas yang diserahkan tidak melebihi kuantitas yang tersedia dan dialokasikan.

### 6.8 Modul Dokumen

**Tabel `documents`**
Menyimpan metadata file. Kolom awal: `id`, `storage_key`, `original_filename`, `mime_type`, `size_bytes`, `uploaded_by`, `document_type`, `created_at`.

- File fisik disimpan di penyimpanan privat, bukan di folder publik aplikasi.
- Dokumen harus dihubungkan ke pengajuan, penawaran, pesanan, penerimaan, atau serah terima melalui relasi yang dirancang dengan jelas.

### 6.9 Modul Notifikasi

**Tabel `notifications`**
Kolom awal: `id`, `recipient_user_id`, `type`, `title`, `body`, `related_entity_type`, `related_entity_id`, `read_at`, `created_at`.

Pengguna dapat menandai notifikasi sebagai sudah dibaca.

### 6.10 Modul Audit

**Tabel `audit_logs`**
Kolom awal: `id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `old_values`, `new_values`, `reason`, `created_at`.

Audit log harus mencatat perubahan penting, termasuk siapa yang melakukan, kapan, alasan, dan nilai sebelum/sesudah jika relevan.

> Jangan menyimpan password, token sesi, atau rahasia di audit log.

---

## 7. Hubungan Data Konseptual

```
Department 1 ── * Employee
Employee   1 ── 0..1 User
User       * ── * Role
Role       * ── * Permission

Employee   1 ── * Request
Request    1 ── * RequestItem
Request    1 ── * RequestVersion
Request    1 ── * RequestStatusHistory

RequestVersion 1 ── * ApprovalAssignment
ApprovalAssignment 1 ── * ApprovalDecision

RequestItem * ── 0..1 CatalogItem

Vendor 1 ── * PurchaseOrder
PurchaseOrder 1 ── * PurchaseOrderItem

RequestItem * ── * PurchaseOrderItem
  melalui model alokasi jika diperlukan

PurchaseOrder 1 ── * Receipt
Receipt 1 ── * ReceiptItem

Request/Allocation 1 ── * Handover
Handover 1 ── * HandoverItem

User 1 ── * Notification
User 1 ── * AuditLog
```

Diagram ini masih konseptual. Relasi antara item pengajuan, pesanan, penerimaan, dan serah terima harus difinalkan melalui ERD terperinci agar mendukung penggabungan pembelian dan pemenuhan parsial.

---

## 8. Aturan Integritas Database

Aturan awal yang wajib dipertimbangkan:

1. Nomor pengajuan dan nomor pembelian harus unik.
2. Kuantitas harus lebih besar dari nol.
3. Nilai uang disimpan menggunakan tipe desimal, bukan floating-point.
4. Status menggunakan nilai yang terkontrol.
5. Keputusan persetujuan harus terhubung ke versi yang benar.
6. Revisi tidak boleh menghapus versi atau keputusan lama.
7. Perubahan harga, jumlah, atau spesifikasi menjalankan aturan persetujuan ulang yang berlaku.
8. Perubahan harga aktual harus mendapatkan persetujuan pemohon dan supervisor sebelum pembelian dilanjutkan sesuai aturan yang telah ditetapkan.
9. Penerimaan parsial dicatat sebagai peristiwa baru.
10. Kuantitas serah terima tidak boleh melampaui kuantitas tersedia.
11. Transisi status hanya dilakukan melalui service backend yang memvalidasi prasyarat.
12. Operasi yang perlu konsisten menggunakan transaksi database.
13. Transaksi historis tidak dihapus secara fisik melalui fitur biasa.
14. Indeks database dibuat berdasarkan kebutuhan pencarian dan pola query yang terukur.

---

## 9. Desain API

Backend menyediakan API dengan prefix awal `/api/v1`.

### 9.1 Prinsip API

- Frontend tidak mengakses database secara langsung.
- Semua input divalidasi di backend.
- Semua operasi memeriksa izin pengguna.
- Respons tidak mengekspos field internal yang tidak diperlukan.
- Kesalahan menggunakan kode HTTP yang sesuai.
- Daftar data menggunakan pagination dan filter server-side.
- Endpoint ekspor laporan tetap memeriksa hak akses.
- Dokumentasi API dapat dibuat menggunakan OpenAPI/Swagger.

### 9.2 Contoh Endpoint

| Area | Endpoint contoh |
|---|---|
| Auth | `POST /api/v1/auth/login` |
| Auth | `POST /api/v1/auth/logout` |
| Users | `GET /api/v1/users/me` |
| Users | `GET /api/v1/users` |
| Requests | `POST /api/v1/requests` |
| Requests | `GET /api/v1/requests` |
| Requests | `GET /api/v1/requests/:id` |
| Requests | `POST /api/v1/requests/:id/submit` |
| Requests | `POST /api/v1/requests/:id/revisions` |
| Approvals | `GET /api/v1/approvals/inbox` |
| Approvals | `POST /api/v1/approvals/:id/decision` |
| Purchasing | `GET /api/v1/purchasing/queue` |
| Purchasing | `POST /api/v1/purchase-orders` |
| Receiving | `POST /api/v1/purchase-orders/:id/receipts` |
| Handover | `POST /api/v1/handovers` |
| Handover | `POST /api/v1/handovers/:id/confirm` |
| Notifications | `GET /api/v1/notifications` |
| Reports | `GET /api/v1/reports/requests` |

Endpoint di atas merupakan contoh, bukan kontrak final.

---

## 10. Autentikasi dan Otorisasi

### 10.1 Prinsip Keamanan

- Autentikasi harus diperiksa di backend.
- Password disimpan dalam bentuk hash menggunakan mekanisme yang teruji.
- Batasi percobaan login.
- Sediakan reset password yang aman.
- Gunakan cookie `HttpOnly`, `Secure`, dan `SameSite` yang sesuai jika desain autentikasi berbasis sesi cookie dipilih.
- Terapkan perlindungan CSRF bila diperlukan.
- Jangan menyimpan token sensitif di `localStorage` tanpa analisis risiko.
- Perubahan peran dan status pengguna dicatat dalam audit.
- Terapkan prinsip least privilege.

### 10.2 Aturan Akses Awal

- Pegawai melihat pengajuan miliknya.
- Pengelola bagian melihat pengajuan pada bagian yang menjadi tanggung jawabnya.
- Purchasing melihat informasi yang dibutuhkan untuk proses pembelian.
- Pimpinan dan admin mengakses laporan lintas bagian sesuai kewenangan.
- Dokumen mengikuti izin terhadap transaksi terkait.

Matriks akses final harus disetujui sebelum production.

Menyembunyikan tombol di frontend saja tidak cukup. Backend harus tetap menolak permintaan yang tidak diizinkan.

---

## 11. Dokumen dan File Storage

### 11.1 Aturan Penyimpanan

- Simpan file di lokasi privat di luar direktori publik.
- Database hanya menyimpan metadata dan kunci penyimpanan.
- Unduhan harus melalui pemeriksaan izin.
- Batasi ukuran dan jenis file.
- Periksa MIME type dan isi file sesuai kemampuan yang tersedia.
- Gunakan nama file internal yang aman.
- Cegah path traversal.
- Jangan mempercayai ekstensi file dari pengguna.
- Pertimbangkan pemindaian malware jika tersedia.
- Backup file harus konsisten dengan backup database.

### 11.2 Jenis Dokumen

- Lampiran pengajuan.
- Penawaran vendor.
- Bukti pesanan.
- Bukti penerimaan.
- Bukti serah terima.
- Dokumen pendukung penyelesaian ketidaksesuaian.

Dokumen yang wajib pada tiap tahap harus ditentukan dalam aturan bisnis. Sistem harus menolak transisi jika dokumen wajib belum tersedia.

---

## 12. Notifikasi dan Tugas Terjadwal

Notifikasi dapat dikirim untuk:

- Pengajuan baru.
- Keputusan persetujuan.
- Pengajuan yang memerlukan revisi.
- Pengajuan yang masuk antrean purchasing.
- Perubahan harga atau jumlah yang membutuhkan persetujuan ulang.
- Pesanan terlambat.
- Penerimaan barang.
- Masalah barang rusak atau kurang.
- Serah terima.
- Eskalasi kepada supervisor.

Kebutuhan awal:

- Pengingat persetujuan nonrespons setiap hari.
- Pengingat purchasing mengikuti deadline.
- Notifikasi penting dikirim hanya kepada pihak relevan.
- Pengguna dapat menandai notifikasi sebagai sudah dibaca.
- Notifikasi wajib tidak dapat dimatikan jika ditetapkan sebagai wajib.
- SLA dan waktu eskalasi rinci masih perlu dikonfirmasi.

Implementasi awal dapat menggunakan scheduler sederhana. Jika kebutuhan retry dan antrean meningkat, sistem dapat dikembangkan menggunakan job queue.

Tugas terjadwal harus dirancang agar aman dijalankan ulang dan tidak menghasilkan notifikasi duplikat.

---

## 13. Dashboard, Pencarian, dan Laporan

Sistem harus mendukung:

- Pencarian cepat.
- Filter lanjutan.
- Pengurutan tabel.
- Pagination server-side.
- Dashboard berdasarkan peran.
- Laporan jumlah pengajuan per status.
- Durasi proses.
- Data anggaran.
- Data keterlambatan.
- Riwayat pengajuan.
- Urgensi dan pembatalan.
- Filter periode, bagian, kategori, status, urgensi, dan petugas purchasing.
- Ekspor Excel dan PDF.

Semua laporan tetap mengikuti hak akses pengguna.

---

## 14. Deployment

### 14.1 Lingkungan

Rencanakan tiga lingkungan:

1. Development.
2. Testing atau staging.
3. Production.

Staging digunakan untuk menguji perubahan sebelum dipakai oleh pegawai.

Hindari menggunakan data sensitif produksi pada lingkungan pengembangan kecuali telah dianonimkan dan diizinkan.

### 14.2 Server

Satu server internal dapat digunakan pada tahap awal apabila kapasitas, jaringan, storage, dan kebutuhan operasional memadai.

Komponen deployment:

- Next.js.
- NestJS.
- PostgreSQL.
- Penyimpanan dokumen privat.
- Nginx.
- Scheduler.
- Backup job.

Database tidak boleh dibuka langsung ke internet.

### 14.3 Docker Compose

Docker Compose digunakan untuk menjalankan layanan secara konsisten.

Pastikan:

- PostgreSQL menggunakan volume persisten.
- File dokumen disimpan di volume atau lokasi yang tepat.
- Rahasia tidak ditanam ke dalam image.
- File `.env` tidak dimasukkan ke Git.
- Backup disimpan di lokasi berbeda dari data utama.

Docker bukan pengganti backup.

### 14.4 Konfigurasi Environment

Buat `.env.example` yang hanya berisi nama variabel dan contoh nilai yang aman.

Contoh variabel:

- `DATABASE_URL`
- `API_PORT`
- `WEB_ORIGIN`
- `SESSION_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `DOCUMENT_STORAGE_PATH`

Nilai rahasia sebenarnya tidak boleh dimasukkan ke repositori.

---

## 15. Akses Internal dan Eksternal

Arsitektur harus mendukung dua skenario.

### 15.1 Jaringan Internal

Pengguna mengakses aplikasi melalui jaringan kantor.

Ini merupakan pilihan awal yang paling sederhana untuk pengujian dan penggunaan internal.

### 15.2 Akses dari Luar Kantor

Akses eksternal baru diaktifkan setelah:

- HTTPS dikonfigurasi.
- Domain dan DNS disiapkan jika diperlukan.
- Autentikasi dan kontrol akses diuji.
- Aturan firewall ditinjau.
- Backup dan monitoring berjalan.
- Jalur akses eksternal disetujui pihak yang berwenang.

VPN dapat dipertimbangkan untuk membatasi akses pegawai dari luar jaringan kantor.

Kedua skenario dapat menggunakan kode aplikasi yang sama. Perbedaannya terutama berada pada konfigurasi jaringan dan deployment.

---

## 16. Backup dan Pemulihan

### 16.1 Kebijakan Awal

- Backup database harian.
- Backup file dokumen.
- Salinan backup pada perangkat atau lokasi terpisah.
- Pembatasan akses terhadap backup.
- Enkripsi backup jika sesuai risiko.
- Dokumentasi prosedur pemulihan.
- Pengujian restore secara berkala.

Keberhasilan backup belum terbukti sebelum proses restore berhasil diuji.

### 16.2 Hal yang Perlu Ditentukan

- RPO: batas kehilangan data yang dapat diterima.
- RTO: target waktu pemulihan layanan.
- Lama retensi backup.
- Frekuensi salinan ke lokasi kedua.
- Penanggung jawab monitoring backup dan kapasitas storage.

---

## 17. Pengujian

### 17.1 Unit Test

Uji aturan bisnis:

- Transisi status.
- Perhitungan total.
- Aturan persetujuan.
- Perubahan harga dan kuantitas.
- Persyaratan penyelesaian penerimaan.
- Hak akses dokumen.

### 17.2 Integration Test

Uji interaksi service dengan PostgreSQL:

- Pengajuan dengan banyak item.
- Revisi dan versi.
- Persetujuan serta perubahan status.
- Penggabungan beberapa pengajuan ke pembelian.
- Penerimaan parsial.
- Serah terima dan pemeriksaan kuantitas.

### 17.3 End-to-End Test

Uji alur lengkap:

1. Login.
2. Membuat draft.
3. Mengirim pengajuan.
4. Memproses persetujuan.
5. Mencatat pembelian.
6. Mencatat pesanan.
7. Mencatat penerimaan.
8. Menyelesaikan serah terima.
9. Melihat riwayat dan laporan.

### 17.4 Pengujian Keamanan

- Pengguna tidak dapat melihat pengajuan tanpa izin.
- Pengguna tidak dapat menyetujui pengajuan sendiri jika dilarang aturan.
- Pengguna tidak dapat melewati status.
- URL dokumen tidak dapat melewati pemeriksaan akses.
- Perubahan harga dan jumlah memicu persetujuan ulang.
- Request berulang tidak membuat transaksi ganda.
- Revisi tidak menghapus keputusan lama.

---

## 18. Tahapan Implementasi

| Tahap | Hasil |
|---|---|
| 1. Finalisasi desain | ERD, matriks akses, status, aturan persetujuan |
| 2. Scaffold proyek | Monorepo, Next.js, NestJS, pnpm, TypeScript |
| 3. Database | PostgreSQL, Prisma schema, migrasi, seed |
| 4. Identitas | Login, pengguna, peran, bagian, impor HRIS |
| 5. Pengajuan | Draft, item, lampiran, submit, versi, revisi |
| 6. Persetujuan | Aturan, assignment, keputusan, notifikasi |
| 7. Purchasing | Antrean, penawaran, vendor, pesanan |
| 8. Penerimaan dan serah terima | Penerimaan parsial, ketidaksesuaian, konfirmasi |
| 9. Laporan dan operasi | Dashboard, ekspor, audit, backup, monitoring |
| 10. Pilot dan go-live | Pengujian pengguna, perbaikan, dokumentasi |

Setiap tahap harus memiliki kriteria penerimaan dan pengujian sebelum dinyatakan selesai.

---

## 19. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Aturan persetujuan belum lengkap | Konfirmasi matriks kewenangan sebelum implementasi |
| Semantik persetujuan paralel belum jelas | Pisahkan notifikasi paralel dari persetujuan paralel |
| Penggabungan pembelian terlalu kompleks | Uji skenario alokasi item pada ERD |
| Akses dokumen terlalu luas | Pemeriksaan izin di backend setiap kali mengunduh |
| Backup hanya berada di server utama | Simpan salinan di lokasi terpisah dan uji restore |
| Ketergantungan pada satu pengembang | Dokumentasi, Git, dan panduan operasi |
| Kompleksitas awal terlalu tinggi | Modular monolith, hindari layanan yang belum diperlukan |
| Jaringan tidak stabil | Penanganan error dan retry yang aman |
| Akses eksternal menambah risiko | Aktifkan setelah review keamanan dan konfigurasi jaringan |

---

## 20. Daftar Keputusan yang Masih TBD

Sebelum fitur terkait masuk production, tentukan:

1. Matriks persetujuan resmi berdasarkan bagian, nilai, dan jenis pengajuan.
2. Apakah persetujuan tiap tingkat berurutan atau paralel.
3. Daftar status pengajuan, pembelian, penerimaan, dan serah terima.
4. Matriks akses final untuk data dan dokumen lintas bagian.
5. Jumlah penawaran vendor yang diwajibkan.
6. Retensi dokumen dan audit.
7. RPO, RTO, dan retensi backup.
8. SLA, tenggat, pengingat, dan eskalasi.
9. Pemetaan data HRIS.
10. Kebijakan autentikasi dan reset password.
11. Apakah satu item pengajuan dapat dipenuhi melalui beberapa pesanan.
12. Apakah penerimaan dan serah terima dilakukan per item atau setelah seluruh item lengkap.
13. Aturan barang rusak, kekurangan, pembatalan, dan perubahan harga.
14. Pilihan akses eksternal, misalnya VPN atau reverse proxy.
15. Lokasi penyimpanan dokumen dan backup.

---

## 21. Definition of Done — Fondasi Proyek

Fondasi proyek dianggap siap jika:

- [ ] Next.js berjalan.
- [ ] NestJS berjalan.
- [ ] Frontend dapat memanggil backend.
- [ ] PostgreSQL berjalan dan tidak terbuka ke jaringan publik.
- [ ] Prisma dapat menjalankan migrasi pada database kosong.
- [ ] Rahasia tidak berada di Git.
- [ ] Lint, type-check, dan tes dasar berjalan.
- [ ] Struktur modul terdokumentasi.
- [ ] Docker Compose menggunakan volume persisten.
- [ ] README menjelaskan cara menjalankan proyek dari awal.
- [ ] Data uji tidak berisi rahasia produksi.
- [ ] ERD dan daftar keputusan TBD tersedia.

---

## 22. Glosarium

**Frontend:** Bagian aplikasi yang dilihat pengguna.

**Backend:** Bagian server yang menjalankan aturan bisnis dan memproses data.

**API:** Antarmuka komunikasi antara frontend dan backend.

**Database:** Tempat menyimpan data terstruktur.

**ORM:** Alat yang membantu aplikasi berinteraksi dengan database.

**Migration:** Perubahan struktur database yang dicatat dan diterapkan secara terkontrol.

**Monorepo:** Beberapa aplikasi dan paket dalam satu repositori.

**Modular Monolith:** Satu aplikasi backend dengan modul-modul yang memiliki tanggung jawab terpisah.

**Reverse Proxy:** Layanan di depan aplikasi yang meneruskan permintaan ke layanan tujuan.

**RPO:** Target batas kehilangan data saat terjadi insiden.

**RTO:** Target waktu pemulihan layanan.

**Audit Log:** Catatan aktivitas penting dan perubahan data.

---

## 23. Langkah Teknis Berikutnya

Setelah dokumen desain teknis ini, pekerjaan berikutnya adalah membuat ERD terperinci dan spesifikasi skema PostgreSQL/Prisma.

ERD harus mencakup:

1. Tabel dan kolom final.
2. Tipe data.
3. Primary key dan foreign key.
4. Constraint dan indeks.
5. Relasi pengajuan, item, versi, dan persetujuan.
6. Relasi item pengajuan, pesanan, penerimaan, dan serah terima.
7. Model dokumen dan audit.
8. Contoh data dan skenario transaksi.
9. Aturan transaksi database.
10. Skenario pengujian integritas data.

Setelah ERD dan aturan bisnis yang masih TBD cukup jelas, kerangka kode dapat dibuat berdasarkan desain tersebut.

Prinsip akhir: rancang data dan aturan bisnis terlebih dahulu, bangun fondasi yang aman, lalu kembangkan setiap modul secara bertahap.
