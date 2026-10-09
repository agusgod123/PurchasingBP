# Panduan Operasional Admin

Untuk Administrator sistem dan penanggung jawab operasional. Deployment teknis ada di
[docs/deployment](deployment/README.md).

## 1. Pengaturan awal (sebelum pengguna mulai)

Lakukan berurutan — setiap langkah dipakai langkah berikutnya.

1. **Login pertama** dengan akun admin dari seed → ganti password.
2. **Administrasi → Pengaturan**
   - Nama organisasi, jam & hari kerja (dipakai menghitung tenggat dan durasi kerja aktif).
   - Tenggat persetujuan, interval pengingat, batas eskalasi. *Nilai bawaan adalah contoh (SLA resmi TBD).*
   - Jenis file & ukuran maksimum unggahan, dokumen yang boleh dilihat pemohon.
   - Jenis notifikasi yang juga dikirim lewat email.
3. **Administrasi → Hari Libur** — masukkan libur nasional & cuti bersama tahun berjalan (SKB 3 Menteri).
4. **Administrasi → Bagian & Pegawai**
   - Tab *Bagian*: buat semua bagian, tetapkan **kepala bagian** (wajib bila matriks memakai “Kepala bagian pemohon”).
   - Tab *Impor dari HRIS*: unduh template, isi dari ekspor HRIS (nomor pegawai, nama, kode bagian, jabatan,
     **nomor atasan**), unggah → periksa pratinjau → Impor. Bisa diulang kapan saja untuk sinkronisasi
     (dicocokkan lewat nomor pegawai; tidak ada data yang dihapus).
   - Tanpa HRIS: tambahkan pegawai manual dan isi **atasan langsung**.
5. **Administrasi → Peran & Izin** — tinjau izin peran bawaan; buat peran baru bila perlu.
   Ingat: *hak menyetujui transaksi tidak diatur di sini*, melainkan di Matriks Persetujuan.
6. **Administrasi → Matriks Persetujuan**
   - Aturan contoh (label **Contoh**, nonaktif) disediakan untuk Pengajuan, Pembatalan, dan Masalah barang.
   - Buka, sesuaikan dengan **SK/batas kewenangan resmi** (rentang nilai, bagian, tahap & approver), lalu aktifkan.
   - Gunakan *prioritas* bila beberapa aturan bisa cocok (mis. aturan khusus bagian TI prioritas 10,
     aturan umum prioritas 0). Aturan aktif yang beririsan pada prioritas sama memunculkan peringatan.
   - Perubahan (harga/qty/spesifikasi) tanpa aturan aktif otomatis disetujui oleh **pemohon + atasan langsungnya**.
7. **Administrasi → Dokumen Wajib** — tentukan dokumen yang harus ada sebelum suatu tahap
   (mis. 1 penawaran sebelum PO dipesan; 3 penawaran untuk nilai ≥ Rp50 juta).
8. **Administrasi → Katalog Barang** — isi barang yang sering diminta beserta estimasi harga.
9. **Administrasi → Anggaran** — isi pagu per bagian (opsional; hanya memunculkan peringatan).
10. **Purchasing → Vendor** (oleh petugas Purchasing) — daftarkan vendor langganan.
11. **Pengguna** — buat akun (password sementara ditampilkan sekali) atau minta pegawai **mendaftar
    sendiri** di halaman Daftar lalu aktifkan dari tab *Menunggu aktivasi*. Pastikan setiap akun
    **tertaut ke data pegawai** — tanpa itu, jalur “atasan langsung/kepala bagian” tidak dapat ditentukan.
12. **Uji coba** satu alur penuh dengan 3–4 orang kunci (pemohon, atasan, Purchasing) sebelum diumumkan.

## 2. Rutinitas

| Kapan | Siapa | Kegiatan |
|---|---|---|
| Harian | Admin | Cek **Pengguna → Menunggu aktivasi**; cek **Matriks Persetujuan → Pengajuan ditahan** dan proses ulang setelah aturan diperbaiki; tanggapi **Tiket Bantuan** |
| Harian | Purchasing | Kerjakan **Pusat Tugas** & **Antrean**; catat tindak lanjut untuk PO terlambat |
| Mingguan | Admin | **Email Keluar**: pastikan tidak ada status *Gagal* menumpuk |
| Bulanan | Admin | Sinkron data pegawai dari HRIS (impor CSV); nonaktifkan akun pegawai keluar/mutasi |
| Bulanan | Pimpinan | Tinjau **Laporan** (tertunda, durasi, keterlambatan) |
| Tiap 3 bulan | Admin/TI | **Uji restore backup** (lihat panduan deployment) |
| Tahunan | Admin | Hari libur tahun baru, pagu anggaran tahun baru, tinjau matriks persetujuan |

## 3. Situasi khusus

- **Approver cuti/berhalangan.** Pengguna dengan izin *Mengalihkan penugasan persetujuan* membuka detail
  pengajuan → alihkan ke orang lain dengan alasan. Proses tidak pernah disetujui otomatis karena terlambat.
- **Pengajuan ditahan.** Penyebab tertulis di pengajuan (mis. “Tidak ada aturan yang cocok”, “Atasan
  pemohon tidak ditemukan”). Perbaiki data (aturan/atasan/kepala bagian) lalu klik **Proses ulang**.
- **Pegawai pindah bagian.** Ubah bagian & atasan di data pegawai. Pengajuan lama tetap tercatat
  di bagian lama; persetujuan yang sedang berjalan memakai approver yang sudah ditetapkan saat itu.
- **Pegawai keluar.** *Pengguna → Nonaktifkan* (isi alasan). Riwayat tetap utuh; penugasan persetujuan
  yang masih menunggu harus dialihkan.
- **Lupa password.** Pengguna memakai *Lupa password* (email). Alternatif: Admin → detail pengguna →
  **Reset password** (password sementara ditampilkan sekali).
- **Akun terkunci.** Terkunci otomatis 15 menit setelah 5 kali salah password; Admin dapat membuka
  dengan **Aktifkan kembali** / reset password.

## 4. Pemantauan

- **Health check**: `GET /api/health` → `{"status":"ok"}`. Pasang di layanan uptime (UptimeRobot,
  Better Stack, dsb.) dengan interval 5 menit.
- **Log aplikasi**: Vercel → Project → *Logs* (filter `[action]`, `[cron:`, `[outbox]`, `[export]`);
  Docker → `docker compose logs -f app scheduler`.
- **Cron**: respons `/api/cron/*` berisi jumlah pengingat/eskalasi/email yang diproses.
- **Audit log**: semua aksi penting (login, persetujuan, perubahan konfigurasi, unduhan dokumen,
  ekspor laporan) tercatat dengan pelaku, waktu, IP, dan nilai sebelum/sesudah.

## 5. Keamanan

- Password di-hash **Argon2id**; sesi berupa cookie HttpOnly (14 hari, diperpanjang saat aktif).
- Batas percobaan login per akun dan per IP; pesan galat tidak membocorkan akun terdaftar.
- Hak akses diperiksa di server untuk setiap halaman, aksi, unduhan dokumen, dan ekspor.
- Dokumen di bucket **privat**; unduhan memakai tautan bertanda tangan berumur pendek dan dicatat.
- Database Supabase: RLS aktif tanpa policy → Data API publik tertutup; aplikasi memakai koneksi server.
- Simpan `SESSION_SECRET`, `CRON_SECRET`, kunci service role, dan password SMTP hanya di environment
  hosting/password manager. Bila bocor: ganti nilainya lalu redeploy (mengganti `SESSION_SECRET` tidak
  mengeluarkan sesi; untuk itu gunakan **Keluarkan sesi** per pengguna).
- Prinsip **pemisahan tugas**: pemohon tidak dapat menyetujui pengajuannya sendiri; Admin tidak
  otomatis berwenang menyetujui transaksi.

## 6. Retensi data

- Transaksi, riwayat status, keputusan, dan audit log **tidak pernah dihapus** oleh aplikasi.
- Dokumen yang dihapus pengguna disembunyikan (*soft delete*) dan tetap tercatat.
- Dibersihkan otomatis oleh tugas harian: sesi kedaluwarsa, token reset password lama, catatan
  percobaan login > 90 hari, notifikasi yang sudah dibaca > 1 tahun.
