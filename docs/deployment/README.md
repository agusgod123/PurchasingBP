# Panduan Deployment e-Pengadaan

Dokumen ini menjelaskan langkah demi langkah menjalankan aplikasi di produksi.

| Opsi | Cocok untuk | Komponen |
|---|---|---|
| **A. Vercel + Supabase** (rekomendasi) | Paling sedikit perawatan server | Vercel (aplikasi), Supabase (PostgreSQL + Storage) |
| B. Netlify + Supabase | Bila kantor sudah memakai Netlify | Netlify (aplikasi), Supabase |
| C. Docker Compose (on-premise/VPS) | Data wajib di server kantor / tanpa internet publik | PostgreSQL, aplikasi, Caddy (HTTPS), penjadwal & backup |

> **Catatan lisensi hosting.** Paket gratis *Vercel Hobby* hanya untuk penggunaan non-komersial dan cron-nya
> dibatasi sekali sehari. Untuk dipakai kantor, gunakan **Vercel Pro**. Supabase *Free* menghentikan proyek
> yang tidak aktif selama seminggu dan tidak menyediakan backup harian — untuk produksi gunakan **Supabase Pro**,
> atau tetap aktifkan workflow backup GitHub (langkah A8).

---

## Persiapan umum

1. Akun GitHub dengan repositori ini.
2. Domain/subdomain kantor (opsional tapi disarankan), mis. `pengadaan.kantor.co.id`.
3. Akun email pengirim (SMTP) — mis. Google Workspace, Microsoft 365, atau layanan seperti Brevo/Mailgun.
4. Dua rahasia acak — buat di terminal:

   ```bash
   openssl rand -base64 48   # → SESSION_SECRET
   openssl rand -base64 32   # → CRON_SECRET
   ```

   Tidak punya `openssl`? Buka https://generate-secret.vercel.app/48 atau gunakan password manager.

Daftar lengkap variabel ada di [`.env.example`](../../.env.example).

---

## A. Vercel + Supabase (rekomendasi)

### A1. Buat proyek Supabase

1. Masuk ke https://supabase.com/dashboard → **New project**.
2. **Region: Southeast Asia (Singapore)** — paling dekat dengan Indonesia dan dengan region Vercel `sin1`.
3. Isi *Database password* yang kuat dan **simpan** di password manager.
4. Tunggu proyek siap (± 2 menit).

### A2. Ambil connection string database

1. Di dashboard proyek klik tombol **Connect** (bagian atas).
2. Tab **Connection string** → pilih:
   - **Transaction pooler** (port **6543**) → ini `DATABASE_URL`. Tambahkan `?pgbouncer=true&sslmode=require` di akhir.
   - **Session pooler** (port **5432**) → ini `DIRECT_URL` (dipakai untuk migrasi). Tambahkan `?sslmode=require`.
3. Ganti `[YOUR-PASSWORD]` dengan password database dari langkah A1.

Contoh:

```
DATABASE_URL=postgresql://postgres.abcd1234:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
DIRECT_URL=postgresql://postgres.abcd1234:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require
```

> Jangan memakai *Direct connection* (`db.xxxx.supabase.co`) untuk Vercel: alamat itu hanya IPv6,
> sedangkan server build Vercel memakai IPv4. Session pooler aman untuk keduanya.

### A3. Buat bucket penyimpanan dokumen

1. Menu **Storage** → **New bucket**.
2. Nama: `documents` · **Public bucket: OFF (privat)**.
3. (Opsional) *Restrict file size*: 10 MB — samakan dengan Pengaturan aplikasi.
4. Tidak perlu membuat *policy*: aplikasi mengakses bucket hanya dari server memakai kunci service role,
   dan setiap unduhan dicek hak aksesnya oleh aplikasi lalu diberi tautan bertanda tangan berumur pendek.

### A4. Ambil URL proyek & kunci service role

1. **Project Settings → API Keys** (atau **Data API**).
2. `SUPABASE_URL` = *Project URL*, mis. `https://abcd1234.supabase.co`.
3. `SUPABASE_SERVICE_ROLE_KEY` = kunci **`service_role`** (tab *Legacy API keys*), atau *Secret key* (`sb_secret_…`).

> ⚠️ Kunci ini setara akses admin penuh. Hanya diisi di environment server (Vercel), **jangan** pernah diberi
> awalan `NEXT_PUBLIC_` dan jangan dibagikan.

**Tentang keamanan data (RLS).** Migrasi aplikasi mengaktifkan *Row Level Security* di semua tabel tanpa
policy dan mencabut hak peran `anon`/`authenticated`. Artinya Data API publik Supabase **tidak dapat**
membaca data apa pun; satu-satunya jalan masuk adalah aplikasi ini. Peringatan "RLS enabled, no policies"
di dashboard Supabase memang disengaja.

### A5. Import proyek ke Vercel

1. https://vercel.com/new → pilih repositori GitHub ini → **Import**.
2. *Framework preset* terdeteksi otomatis **Next.js**. Build command & install command sudah diatur di
   [`vercel.json`](../../vercel.json) (`pnpm run build:hosting`) — biarkan.
3. Buka **Environment Variables** dan isi (scope **Production**):

   | Nama | Nilai |
   |---|---|
   | `DATABASE_URL` | dari A2 (transaction pooler, 6543) |
   | `DIRECT_URL` | dari A2 (session pooler, 5432) |
   | `APP_URL` | `https://pengadaan.kantor.co.id` (atau URL `*.vercel.app` sementara) |
   | `APP_NAME` | `e-Pengadaan` |
   | `NEXT_PUBLIC_APP_TIMEZONE` | `Asia/Jakarta` / `Asia/Makassar` / `Asia/Jayapura` |
   | `SESSION_SECRET` | rahasia acak #1 |
   | `CRON_SECRET` | rahasia acak #2 |
   | `STORAGE_DRIVER` | `supabase` |
   | `SUPABASE_URL` | dari A4 |
   | `SUPABASE_SERVICE_ROLE_KEY` | dari A4 |
   | `SUPABASE_STORAGE_BUCKET` | `documents` |
   | `EMAIL_TRANSPORT` | `smtp` (atau `log` saat uji coba) |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | dari penyedia email |

4. Klik **Deploy**. Pada deploy *Production*, skrip build otomatis menjalankan `prisma migrate deploy`
   sehingga semua tabel dibuat. Deploy *Preview* **tidak** menjalankan migrasi.

   > Ingin Preview memakai database sendiri? Buat proyek Supabase kedua (staging) dan isi variabelnya
   > dengan scope **Preview**. Jangan arahkan Preview ke database produksi.

5. **Settings → Functions → Function Region**: pastikan **Singapore (sin1)** (sudah diset di `vercel.json`).

### A6. Buat data dasar & akun admin pertama (sekali saja)

Dari komputer Anda (butuh Node.js 22 + pnpm):

```bash
git clone <repo> && cd PurchasingBP
pnpm install
# isi DATABASE_URL & DIRECT_URL produksi (A2) di file .env sementara
ADMIN_USERNAME=admin ADMIN_EMAIL=admin@kantor.co.id ADMIN_PASSWORD='PasswordKuat123' pnpm db:seed
rm .env   # hapus lagi setelah selesai
```

Perintah ini membuat izin, peran bawaan, pengaturan default, kategori, ketentuan dokumen contoh,
**aturan persetujuan contoh (nonaktif)**, FAQ, dan akun admin. Aman diulang (tidak menimpa data).
Admin wajib mengganti password saat login pertama.

> Jangan menjalankan `pnpm db:seed:demo` di produksi — skrip itu membuat akun & transaksi contoh dan
> akan menolak berjalan bila `NODE_ENV=production`.

### A7. Penjadwal (cron)

Aplikasi membutuhkan pemanggilan berkala ke endpoint berikut (header `Authorization: Bearer <CRON_SECRET>`):

| Endpoint | Fungsi | Frekuensi ideal |
|---|---|---|
| `/api/cron/outbox` | kirim ulang email yang tertunda/gagal | tiap 5–15 menit |
| `/api/cron/approvals` | pengingat & eskalasi persetujuan yang lewat tenggat | tiap jam pada jam kerja |
| `/api/cron/daily` | keterlambatan PO, penanda "tanpa aktivitas", pembersihan sesi | harian |
| `/api/cron/all` | semua tugas di atas sekaligus | — |

Email juga langsung dikirim setelah setiap aksi, jadi cron `outbox` hanya jaring pengaman.

**Pilihan 1 — Vercel Cron (sudah aktif).** `vercel.json` menjadwalkan `/api/cron/all` sekali sehari
pukul 22:00 UTC (06:00 WITA). Vercel otomatis mengirim header `CRON_SECRET`. Di Vercel Pro Anda boleh
menambah jadwal yang lebih sering, mis.:

```json
"crons": [
  { "path": "/api/cron/outbox", "schedule": "*/10 * * * *" },
  { "path": "/api/cron/approvals", "schedule": "5 0-9 * * 1-5" },
  { "path": "/api/cron/daily", "schedule": "0 22 * * *" }
]
```

**Pilihan 2 — Supabase pg_cron (berfungsi di paket Vercel apa pun).** Di Supabase: **Database → Extensions**
aktifkan `pg_cron` dan `pg_net`, lalu jalankan di **SQL Editor** (ganti URL & rahasia):

```sql
select cron.schedule('pengadaan-outbox', '*/10 * * * *', $$
  select net.http_get(
    url := 'https://pengadaan.kantor.co.id/api/cron/outbox',
    headers := jsonb_build_object('Authorization', 'Bearer GANTI_DENGAN_CRON_SECRET'),
    timeout_milliseconds := 55000);
$$);

select cron.schedule('pengadaan-approvals', '5 0-9 * * 1-5', $$
  select net.http_get(
    url := 'https://pengadaan.kantor.co.id/api/cron/approvals',
    headers := jsonb_build_object('Authorization', 'Bearer GANTI_DENGAN_CRON_SECRET'),
    timeout_milliseconds := 55000);
$$);
```

Jadwal cron memakai **UTC**: `0-9` UTC = 08:00–17:00 WITA (untuk WIB pakai `1-10`, WIT `23,0-8`).
Cek riwayat: `select * from cron.job_run_details order by start_time desc limit 20;`

### A8. Backup database

- **Supabase Pro**: backup harian otomatis (7 hari) + opsi Point-in-Time Recovery.
- **Tambahan (disarankan, semua paket)**: workflow GitHub [`backup.yml`](../../.github/workflows/backup.yml)
  membuat `pg_dump` terenkripsi setiap malam dan menyimpannya 30 hari sebagai artefak.
  Di GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
  - `BACKUP_DATABASE_URL` = `DIRECT_URL` (session pooler, 5432)
  - `BACKUP_PASSPHRASE` = kata sandi enkripsi (simpan di brankas password kantor!)

  Jalankan sekali manual dari tab **Actions → Backup database → Run workflow** untuk memastikan berhasil.
- **Dokumen (Storage)** tidak termasuk dalam `pg_dump`. Untuk arsip berkala, unduh bucket via
  Supabase CLI (`supabase storage cp -r ss:///documents ./arsip --experimental`) atau aktifkan backup
  Storage pada paket Supabase Anda.

### A9. Domain kustom

1. Vercel → **Settings → Domains** → tambahkan `pengadaan.kantor.co.id`.
2. Buat record DNS sesuai instruksi Vercel (CNAME ke `cname.vercel-dns.com`).
3. Ubah `APP_URL` menjadi domain tersebut → **Redeploy** (tautan di email memakai `APP_URL`).

### A10. Uji setelah deploy (checklist)

- [ ] `https://<domain>/api/health` → `{"status":"ok","db":"ok"}`
- [ ] Login sebagai admin → diminta ganti password → berhasil.
- [ ] **Admin → Email Keluar → Kirim email uji coba** → status *Terkirim* dan email diterima.
- [ ] Buat satu pengajuan uji, unggah lampiran PDF, lalu unduh kembali → berhasil.
- [ ] Panggil cron manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/all` → `"ok":true`.
- [ ] Lanjutkan ke **[Panduan operasional](../operasional.md) → Pengaturan awal** (struktur organisasi,
      matriks persetujuan, dsb.) sebelum pengguna mulai memakai.

### Memperbarui aplikasi

Push/merge ke branch produksi → Vercel build otomatis → migrasi baru dijalankan otomatis pada deploy
Production. Bila deploy gagal, versi lama tetap melayani (tidak ada downtime). Rollback: Vercel →
**Deployments** → pilih versi sebelumnya → **Promote to Production** (migrasi database tidak ikut mundur;
semua migrasi aplikasi ini bersifat menambah/aman).

---

## B. Netlify + Supabase

1. Lakukan langkah **A1–A4** (Supabase) dan **A6** (data dasar).
2. https://app.netlify.com → **Add new site → Import an existing project** → pilih repositori.
3. Build settings terbaca dari [`netlify.toml`](../../netlify.toml) (`pnpm run build:hosting`, Node 22).
   Migrasi otomatis berjalan hanya pada deploy *production* (`CONTEXT=production`).
4. **Site configuration → Environment variables**: isi variabel yang sama seperti tabel A5.
5. Deploy. Tugas terjadwal berjalan otomatis lewat *Scheduled Functions* di `netlify/functions/`
   (email tiap 10 menit, persetujuan tiap jam kerja, harian 06:00 WITA). Netlify memakai variabel `URL`
   bawaan untuk alamat situs dan `CRON_SECRET` dari environment.
6. Domain: **Domain management → Add a domain**. Ubah `APP_URL` lalu redeploy.

> Batas ukuran request fungsi Netlify/Vercel ± 4,5–6 MB. Karena itu unggahan dokumen dikirim langsung
> dari browser ke Supabase Storage memakai *signed upload URL* — file 10 MB tetap aman.

---

## C. Docker Compose (on-premise / VPS)

Kebutuhan: server Linux 2 vCPU / 4 GB RAM / 40 GB disk, Docker Engine 24+ dengan plugin Compose.

```bash
git clone <repo> /opt/e-pengadaan && cd /opt/e-pengadaan
cp .env.example .env
nano .env
```

Isi minimal di `.env`:

```dotenv
POSTGRES_PASSWORD=password-db-yang-kuat
APP_URL=https://pengadaan.kantor.co.id
SITE_ADDRESS=pengadaan.kantor.co.id      # atau IP/hostname internal, mis. 10.0.0.15
NEXT_PUBLIC_APP_TIMEZONE=Asia/Makassar
TZ=Asia/Makassar
SESSION_SECRET=...
CRON_SECRET=...
EMAIL_TRANSPORT=smtp
SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASSWORD=... SMTP_FROM="e-Pengadaan <no-reply@kantor.co.id>"
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@kantor.co.id
ADMIN_PASSWORD=PasswordKuat123
```

(Variabel `DATABASE_URL`, `STORAGE_*`, `SUPABASE_*` di `.env.example` tidak dipakai Compose; abaikan.)

Jalankan:

```bash
docker compose up -d --build
docker compose logs -f migrate     # tunggu "Selesai."
docker compose ps                   # app, proxy, scheduler: running/healthy
```

Komponen:

- **db** — PostgreSQL 16, data di volume `db-data`.
- **migrate** — menjalankan migrasi + data dasar + admin pertama, lalu berhenti (aman diulang).
- **app** — aplikasi; dokumen disimpan di volume `storage`.
- **proxy** — Caddy. Domain publik → sertifikat HTTPS Let's Encrypt otomatis (port 80/443 harus terbuka
  dari internet). Hostname/IP internal → sertifikat internal Caddy; pasang CA Caddy ke perangkat kantor
  (`docker compose exec proxy cat /data/caddy/pki/authorities/local/root.crt`).
- **scheduler** — memanggil cron aplikasi (email tiap 10 menit, persetujuan tiap jam kerja, harian 06:00)
  dan membuat **backup harian 01:30** ke folder `./backups` (database `db-*.dump` + dokumen
  `dokumen-*.tar.gz`, disimpan 30 hari).

> Salin isi `./backups` ke lokasi lain (NAS/cloud) secara rutin — backup di mesin yang sama tidak
> melindungi dari kerusakan disk atau ransomware.

Pembaruan:

```bash
git pull
docker compose up -d --build        # migrate berjalan dulu, lalu app diganti
```

---

## Backup & restore

### Restore dari artefak GitHub (Supabase)

```bash
gpg --decrypt db-20261009-1830.dump.gpg > db.dump      # masukkan BACKUP_PASSPHRASE
# Pulihkan ke database KOSONG (proyek Supabase baru atau database staging):
pg_restore --no-owner --no-privileges --clean --if-exists -d "$DIRECT_URL" db.dump
```

### Restore pada Docker Compose

```bash
docker compose stop app scheduler
docker compose exec -T db pg_restore -U pengadaan -d pengadaan --clean --if-exists < backups/db-YYYYMMDD-HHMM.dump
docker run --rm -v e-pengadaan_storage:/data/storage -v "$PWD/backups":/b alpine \
  sh -c "rm -rf /data/storage/* && tar -xzf /b/dokumen-YYYYMMDD-HHMM.tar.gz -C /data"
docker compose start app scheduler
```

### Uji restore (wajib tiap 3 bulan)

Backup yang tidak pernah diuji belum tentu bisa dipulihkan. Pulihkan backup terbaru ke database
staging, buka aplikasi staging, pastikan pengajuan, PO, dan dokumen terbaru tampil. Catat tanggal uji
di log operasional.

---

## Pemecahan masalah

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| Build gagal di `prisma migrate deploy` | `DIRECT_URL` salah / memakai port 6543 | Pakai session pooler port 5432 |
| Error `prepared statement ... already exists` | `DATABASE_URL` tanpa `?pgbouncer=true` | Tambahkan parameter tersebut |
| `Konfigurasi environment tidak valid` | Variabel wajib kosong | Cek log fungsi, lengkapi variabel, redeploy |
| Unggah dokumen gagal | Bucket salah nama/belum dibuat, kunci service role salah | Cek A3–A4 |
| Email tidak terkirim | SMTP salah atau `EMAIL_TRANSPORT=log` | Admin → Email Keluar: lihat pesan error, perbaiki, klik kirim ulang |
| Pengajuan berstatus **Ditahan** | Belum ada aturan persetujuan aktif yang cocok | Admin → Matriks Persetujuan → aktifkan/ubah aturan → **Proses ulang** |
| `/api/cron/*` → 401 | `CRON_SECRET` berbeda | Samakan nilai di hosting & penjadwal |
| Terlalu banyak koneksi database | Banyak instance serverless | Pastikan memakai transaction pooler; turunkan `DATABASE_POOL_MAX` |
