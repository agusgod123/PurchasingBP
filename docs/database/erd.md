# Struktur Data (ERD)

Sumber kebenaran: [`prisma/schema.prisma`](../../prisma/schema.prisma) dan migrasi di
[`prisma/migrations`](../../prisma/migrations). Diagram ini merangkum relasi utama.

## Alur inti

```mermaid
erDiagram
  DEPARTMENT ||--o{ EMPLOYEE : "memiliki"
  EMPLOYEE |o--o{ EMPLOYEE : "atasan langsung"
  EMPLOYEE |o--o| USER : "akun"
  DEPARTMENT |o--o| USER : "kepala bagian"
  USER ||--o{ USER_ROLE : ""
  ROLE ||--o{ USER_ROLE : ""
  ROLE ||--o{ ROLE_PERMISSION : ""
  PERMISSION ||--o{ ROLE_PERMISSION : ""

  USER ||--o{ REQUEST : "mengajukan"
  DEPARTMENT ||--o{ REQUEST : ""
  REQUEST ||--|{ REQUEST_ITEM : "berisi"
  REQUEST ||--o{ REQUEST_VERSION : "versi saat dikirim"
  REQUEST_VERSION ||--|{ REQUEST_VERSION_ITEM : "snapshot item"
  REQUEST ||--o{ REQUEST_STATUS_HISTORY : "riwayat"

  APPROVAL_RULE ||--|{ APPROVAL_RULE_STEP : "tahap"
  REQUEST ||--o{ APPROVAL_INSTANCE : "proses persetujuan"
  APPROVAL_RULE |o--o{ APPROVAL_INSTANCE : "dipakai"
  APPROVAL_INSTANCE ||--|{ APPROVAL_STEP : ""
  APPROVAL_STEP ||--|{ APPROVAL_ASSIGNMENT : "approver (snapshot)"
  APPROVAL_ASSIGNMENT ||--o{ APPROVAL_DECISION : "keputusan"

  PURCHASE_ORDER ||--|{ PURCHASE_ORDER_REQUEST : "menggabungkan"
  REQUEST ||--o{ PURCHASE_ORDER_REQUEST : ""
  PURCHASE_ORDER ||--|{ PURCHASE_ORDER_ITEM : ""
  REQUEST_ITEM ||--o{ PURCHASE_ORDER_ITEM : "dipenuhi oleh"
  VENDOR |o--o{ PURCHASE_ORDER : ""
  PURCHASE_ORDER ||--o{ VENDOR_QUOTE : "penawaran"
  PURCHASE_ORDER ||--o{ PURCHASE_FOLLOWUP : "tindak lanjut"
  PURCHASE_ORDER ||--o{ CHANGE_REQUEST : "perubahan harga/qty/spek"
  CHANGE_REQUEST ||--|{ CHANGE_REQUEST_ITEM : ""

  PURCHASE_ORDER ||--o{ GOODS_RECEIPT : "penerimaan"
  GOODS_RECEIPT ||--|{ GOODS_RECEIPT_ITEM : ""
  PURCHASE_ORDER_ITEM ||--o{ GOODS_RECEIPT_ITEM : ""
  PURCHASE_ORDER ||--o{ RECEIPT_DISCREPANCY : "masalah barang"
  RECEIPT_DISCREPANCY |o--o| PURCHASE_ORDER : "PO pengganti"

  REQUEST ||--o{ HANDOVER : "serah terima"
  HANDOVER ||--|{ HANDOVER_ITEM : ""
  REQUEST ||--o{ CANCELLATION_REQUEST : "pembatalan"

  DOCUMENT }o--o| REQUEST : ""
  DOCUMENT }o--o| PURCHASE_ORDER : ""
  DOCUMENT }o--o| VENDOR_QUOTE : ""
  DOCUMENT }o--o| GOODS_RECEIPT : ""
  DOCUMENT }o--o| HANDOVER : ""
  DOCUMENT }o--o| RECEIPT_DISCREPANCY : ""
```

## Daftar tabel per kelompok

| Kelompok | Tabel |
|---|---|
| Organisasi & akses | `departments`, `employees`, `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `user_department_scopes`, `sessions`, `password_reset_tokens`, `login_attempts` |
| Katalog & vendor | `item_categories`, `catalog_items`, `vendors` |
| Pengajuan | `requests`, `request_items`, `request_versions`, `request_version_items`, `request_status_history`, `comments` |
| Persetujuan | `approval_rules`, `approval_rule_steps`, `approval_instances`, `approval_steps`, `approval_assignments`, `approval_decisions` |
| Purchasing | `purchase_orders`, `purchase_order_requests`, `purchase_order_items`, `vendor_quotes`, `purchase_order_status_history`, `purchase_followups`, `change_requests`, `change_request_items`, `department_budgets` |
| Penerimaan & serah terima | `goods_receipts`, `goods_receipt_items`, `receipt_discrepancies`, `handovers`, `handover_items`, `cancellation_requests` |
| Dokumen | `documents` (tepat satu induk — dijaga CHECK constraint), `document_requirements` |
| Notifikasi | `notifications` (dengan `dedupe_key`), `email_outbox` |
| Sistem | `audit_logs`, `system_settings`, `number_sequences`, `idempotency_keys`, `holidays` |
| Bantuan | `support_tickets`, `support_ticket_comments`, `faq_articles` |

## Aturan integritas penting

- **Buku besar kuantitas per item**: dibutuhkan = `quantity − cancelled_quantity`; dialokasikan =
  Σ(`quantity_ordered − closed_quantity`) PO aktif; diterima dan diserahkan dihitung dari penerimaan &
  serah terima. Constraint CHECK di database mencegah nilai negatif serta pembatalan/penutupan yang
  melebihi jumlah; alokasi berlebih ke PO dicegah oleh service sebelum disimpan.
- **Satu baris PO = satu item pengajuan**; penggabungan beberapa pengajuan terjadi di tingkat PO
  (`purchase_order_requests`), sehingga jejak dari kebutuhan ke pembelian tidak pernah hilang.
- **Approver di-snapshot** ke `approval_assignments` saat proses dimulai — perubahan matriks tidak
  mengubah proses yang sedang berjalan.
- **Versi pengajuan** (`request_versions`) disimpan setiap kali dikirim, sebagai dasar perbandingan
  revisi dan *carry-over* persetujuan.
- **Penomoran** `PB/PO/GR/ST/TK-YYYY-00001` dari `number_sequences` (aman dari balapan).
- **Optimistic locking** (`lock_version`) pada pengajuan & PO; **idempotency key** untuk aksi kirim.
- **RLS** aktif pada semua tabel tanpa policy; hak `anon`/`authenticated` dicabut (khusus Supabase).
- Waktu disimpan sebagai `timestamptz`; tanggal kebutuhan/ETA sebagai `date`; uang `numeric(18,2)`,
  kuantitas `numeric(18,3)`.
