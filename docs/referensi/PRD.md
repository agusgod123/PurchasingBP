# Product Requirements Document (PRD)

## Sistem Pengajuan Barang dan Pelacakan Purchasing

**Status dokumen:** Draft konsolidasi kebutuhan untuk validasi sebelum
implementasi\
**Versi:** 1.0\
**Tanggal:** 9 Oktober 2026\
**Bahasa:** Indonesia\
**Pemilik produk:** Organisasi / kantor pengguna\
**Pengguna utama:** Pegawai, Pengelola Bagian, Supervisor/Atasan,
Purchasing, Keuangan, Pimpinan, Admin\
**Nama sistem:** Belum ditetapkan

------------------------------------------------------------------------

## 1. Ringkasan Eksekutif

Sistem Pengajuan Barang dan Pelacakan Purchasing adalah aplikasi
internal untuk mendigitalisasi proses pengajuan kebutuhan barang,
persetujuan, pengadaan oleh tim purchasing, penerimaan barang dari
vendor, dan serah terima kepada pemohon.

Sistem dirancang agar pengguna dapat memantau status pengajuan tanpa
harus mencari informasi melalui percakapan pribadi atau grup pesan.
Purchasing memperoleh antrean kerja terpusat, riwayat transaksi,
dokumentasi penawaran dan pemesanan, serta sarana pencatatan
keterlambatan dan tindak lanjut vendor. Pimpinan memperoleh ringkasan
status, keterlambatan, urgensi, anggaran, dan kinerja proses.

Rilis awal berfokus pada **pengadaan barang**. Pengajuan jasa dapat
dikembangkan sebagai modul terpisah. Sistem tidak dimaksudkan sebagai
ERP penuh, sistem inventaris menyeluruh, atau aplikasi manajemen vendor
penuh pada tahap awal.

Dokumen ini mengonsolidasikan hasil brainstorming kebutuhan. Sejumlah
aturan bisnis---terutama matriks persetujuan, SLA, retensi data, dan
rincian kewenangan---masih perlu dikonfirmasi sebelum konfigurasi
produksi. Bagian tersebut ditandai sebagai **Belum Diputuskan (TBD)**
dan tidak boleh diasumsikan sebagai kebijakan kantor yang sudah
disahkan.

## 2. Latar Belakang dan Masalah

### 2.1 Kondisi yang ingin diperbaiki

-   Pengaju kesulitan mengetahui posisi dan perkembangan pengajuan.
-   Riwayat, dokumen, dan tindak lanjut tersebar di banyak tempat.
-   Purchasing perlu mengelola antrean kerja, prioritas, penawaran,
    pesanan, serta tindak lanjut vendor secara terpusat.
-   Persetujuan dan perubahan transaksi membutuhkan jejak audit yang
    dapat ditelusuri.
-   Penerimaan parsial, barang rusak/tidak sesuai, keterlambatan,
    pembatalan, dan penggantian barang perlu ditangani secara konsisten.
-   Pimpinan memerlukan laporan yang dapat difilter dan diekspor tanpa
    merangkum data secara manual.

### 2.2 Tujuan produk

1.  Menyediakan satu sumber data transaksi pengajuan dan purchasing.
2.  Memudahkan pegawai mengajukan barang dan memantau statusnya.
3.  Menstandarkan alur persetujuan sesuai kewenangan kantor.
4.  Membantu purchasing mengelola antrean, pembelian, vendor,
    penerimaan, dan serah terima.
5.  Menjaga seluruh perubahan, keputusan, dan bukti transaksi tetap
    terlacak.
6.  Menyediakan dashboard dan laporan operasional untuk peran yang
    berwenang.
7.  Membangun fondasi yang dapat diperluas ke modul jasa atau modul
    kantor lain di masa depan.

### 2.3 Bukan tujuan rilis awal

-   Menggantikan seluruh fungsi ERP.
-   Menjadi sistem inventaris lengkap dengan pencatatan aset dan stok
    menyeluruh.
-   Menyediakan manajemen vendor penuh, seperti onboarding, evaluasi
    vendor, dan kontrak vendor terpusat.
-   Mengelola pengajuan jasa dalam alur yang sama; jasa direncanakan
    sebagai modul terpisah.
-   Menyediakan akuntansi atau pembukuan penuh.
-   Mengotomatisasi semua keputusan yang memerlukan kewenangan manusia.

## 3. Ruang Lingkup

### 3.1 Termasuk dalam rilis awal

-   Akun, login, peran, dan hak akses.
-   Data pegawai dan bagian yang dibutuhkan untuk pengajuan dan
    persetujuan.
-   Katalog kategori barang sederhana; nama barang dan spesifikasi dapat
    diketik bebas.
-   Pengajuan satu atau banyak item, termasuk penyimpanan draf.
-   Lampiran wajib sesuai kebutuhan pengajuan.
-   Penarikan, revisi, pengiriman ulang, dan histori versi.
-   Alur persetujuan yang dikonfigurasi berdasarkan aturan kantor.
-   Antrean purchasing dan penentuan prioritas.
-   Pencatatan penawaran, dokumen pendukung, vendor, dan bukti
    pemesanan.
-   Perubahan harga dan kuantitas beserta persetujuan ulang.
-   Pelacakan status pemesanan dan tindak lanjut vendor.
-   Penerimaan barang dari vendor, termasuk penerimaan parsial dan
    masalah barang.
-   Serah terima akhir kepada pemohon.
-   Pembatalan, penyelesaian pengecualian, dan penutupan transaksi.
-   Notifikasi, pusat tugas, dashboard, laporan, ekspor Excel/PDF.
-   Audit log, backup, dan prosedur pemulihan.
-   FAQ/panduan penggunaan dan mekanisme bantuan melalui admin.

### 3.2 Di luar cakupan rilis awal

-   Modul pengajuan jasa.
-   Manajemen persediaan dan stok lengkap.
-   Pengelolaan vendor secara penuh.
-   Integrasi otomatis dengan HRIS atau sistem keuangan, kecuali
    diputuskan kemudian.
-   Persetujuan otomatis berdasarkan AI.
-   Aplikasi mobile native. Antarmuka web responsif menjadi pendekatan
    awal.
-   Penetapan kebijakan anggaran atau pengadaan yang belum disahkan
    kantor.

## 4. Pemangku Kepentingan dan Peran

  -----------------------------------------------------------------------
  Peran                   Tanggung jawab utama    Akses awal
  ----------------------- ----------------------- -----------------------
  Pegawai/Pemohon         Membuat pengajuan,      Pengajuan sendiri;
                          melengkapi lampiran,    ringkasan pengajuan
                          menanggapi revisi,      lintas bagian
                          mengonfirmasi serah     
                          terima                  

  Pengelola Bagian        Melihat pengajuan       Data bagian dan
                          bagian dan menjalankan  tindakan yang
                          tindakan sesuai         diotorisasi
                          kewenangan yang         
                          diberikan               

  Supervisor/Atasan       Memberi persetujuan,    Transaksi yang
                          menentukan prioritas,   ditugaskan dan data
                          menangani eskalasi      sesuai kewenangan
                          sesuai kewenangan       

  Purchasing              Menangani antrean       Transaksi pengadaan dan
                          pembelian, penawaran,   arsip terkait
                          pemesanan, tindak       
                          lanjut vendor,          
                          penerimaan dan serah    
                          terima                  

  Keuangan                Menjalankan pemeriksaan Transaksi dan data
                          atau persetujuan        keuangan yang
                          anggaran sesuai matriks diotorisasi
                          yang disahkan           

  Pimpinan                Melihat ringkasan       Dashboard dan laporan
                          lintas bagian dan       lintas bagian; detail
                          mengambil keputusan     mengikuti kebijakan
                          sesuai kewenangan       

  Admin                   Mengelola akun,         Fungsi administratif;
                          konfigurasi, hak akses, perubahan transaksi
                          kategori, matriks       sensitif dibatasi
                          persetujuan, dan        
                          bantuan sistem          

  Tim teknis/pengelola    Menangani gangguan      Akses teknis minimum
  sistem                  aplikasi,               yang diperlukan
                          infrastruktur, backup,  
                          dan pemulihan           
  -----------------------------------------------------------------------

**Catatan akses:** Semua pegawai boleh melihat ringkasan pengajuan dari
seluruh bagian, tetapi detail dan dokumen pengajuan milik orang lain
tidak otomatis terbuka. Arsip dokumen pusat dibatasi untuk Purchasing
dan Admin pada rancangan awal. Akses detail untuk atasan, keuangan,
pimpinan, atau pengelola bagian harus ditetapkan secara eksplisit dalam
matriks hak akses sebelum produksi.

## 5. Asumsi, Batasan, dan Prinsip Desain

### 5.1 Asumsi awal

-   Perkiraan volume kurang dari 50 pengajuan per bulan.
-   Komputer merupakan perangkat utama; HP digunakan untuk pengecekan
    dan persetujuan.
-   Antarmuka menggunakan Bahasa Indonesia.
-   Penggunaan utama berupa aplikasi web responsif.
-   Pengajuan dapat memuat satu atau beberapa item.
-   Katalog barang tidak wajib lengkap pada awal; input nama barang dan
    spesifikasi tetap dapat dilakukan secara bebas.
-   Ketersediaan stok, jika perlu diperiksa, dilakukan secara manual di
    luar sistem inventaris penuh.
-   Backup harian dan salinan berkala di lokasi berbeda diinginkan.

### 5.2 Prinsip desain

-   Sederhana dan meminimalkan langkah untuk pemohon.
-   Antarmuka lebih lengkap bagi Purchasing dan Admin sesuai kebutuhan
    kerja.
-   Status dan tindakan berikutnya harus jelas.
-   Data transaksi tidak dihapus permanen melalui penggunaan biasa.
-   Setiap perubahan penting harus terlacak.
-   Hak melihat, mengubah, menyetujui, dan mengunduh dokumen dipisahkan.
-   Sistem harus mencegah perpindahan tahap jika dokumen wajib belum
    lengkap.
-   Gangguan jaringan tidak boleh membuat pengguna kehilangan isian yang
    sedang dikerjakan.
-   Aturan yang belum diputuskan tidak boleh dikodekan sebagai kebijakan
    tetap tanpa persetujuan pemilik proses.

## 6. Alur Bisnis Utama

### 6.1 Alur tingkat tinggi

1.  Pegawai membuat pengajuan barang.
2.  Pegawai melengkapi item, spesifikasi, jumlah, alasan, tanggal
    dibutuhkan, estimasi harga, urgensi, dan lampiran.
3.  Pengajuan disimpan sebagai draf atau dikirim.
4.  Sistem memvalidasi kelengkapan dan menentukan jalur persetujuan
    berdasarkan matriks yang dikonfigurasi.
5.  Pengajuan menunggu seluruh persetujuan yang diwajibkan.
6.  Jika ditolak, pengajuan kembali kepada pemohon untuk revisi;
    keputusan sebelumnya tetap disimpan.
7.  Setelah disetujui, pengajuan otomatis masuk antrean Purchasing.
8.  Purchasing memproses penawaran, memilih penawaran sesuai aturan
    kantor, mencatat vendor, dan menyimpan bukti pemesanan.
9.  Jika harga aktual berbeda dari estimasi atau kuantitas berubah,
    proses terkait memerlukan persetujuan ulang.
10. Purchasing memantau pesanan, vendor, estimasi kedatangan, dan tindak
    lanjut.
11. Purchasing mencatat penerimaan barang dari vendor; penerimaan dapat
    parsial.
12. Jika barang rusak/tidak sesuai, pesanan ditahan sampai masalah
    diselesaikan.
13. Setelah semua barang lengkap atau pengecualian diselesaikan secara
    resmi, dokumen lengkap, dan masalah tuntas, Purchasing menandai
    pesanan siap diserahterimakan.
14. Pemohon mengonfirmasi penerimaan akhir.
15. Purchasing menutup transaksi setelah semua syarat penyelesaian
    terpenuhi.

### 6.2 Status transaksi yang disarankan

Status final perlu diselaraskan saat desain teknis. Set awal yang
disarankan:

-   Draf
-   Diajukan
-   Menunggu persetujuan
-   Perlu revisi
-   Disetujui
-   Dalam antrean Purchasing
-   Dalam proses pengadaan
-   Menunggu persetujuan perubahan
-   Dipesan ke vendor
-   Menunggu pengiriman
-   Diterima sebagian
-   Ditahan karena masalah barang
-   Siap diserahterimakan
-   Menunggu konfirmasi pemohon
-   Selesai
-   Dibatalkan
-   Ditandai untuk peninjauan

Status bukan pengganti riwayat aktivitas. Perubahan status harus
mencatat waktu, pelaku, dan alasan bila relevan.

## 7. Persyaratan Fungsional

### 7.1 Akun dan autentikasi

**FR-AUTH-01** Sistem menyediakan login menggunakan username dan
password.\
**FR-AUTH-02** Registrasi mandiri diperbolehkan, tetapi akun harus
diverifikasi/diaktifkan sebelum dapat digunakan.\
**FR-AUTH-03** Admin dapat mengaktifkan, menonaktifkan, dan mengelola
peran akun.\
**FR-AUTH-04** Admin memperbarui informasi bagian/jabatan ketika ada
perubahan kepegawaian.\
**FR-AUTH-05** Akun pegawai yang tidak aktif dinonaktifkan manual oleh
Admin pada rilis awal.\
**FR-AUTH-06** Reset password dilakukan melalui email terdaftar; Admin
dapat membantu jika mekanisme tersebut tidak dapat digunakan.\
**FR-AUTH-07** Rilis awal tidak mewajibkan OTP. Password tetap harus
disimpan menggunakan mekanisme hashing yang aman, bukan teks biasa.\
**FR-AUTH-08** Perubahan peran dan status akun dicatat dalam audit log.

### 7.2 Pengajuan

**FR-REQ-01** Pegawai dapat membuat pengajuan barang yang berisi satu
atau lebih item.\
**FR-REQ-02** Setiap item setidaknya memiliki nama barang, spesifikasi,
jumlah, alasan, tanggal dibutuhkan, dan estimasi harga.\
**FR-REQ-03** Pemohon dapat memilih kategori seperti IT, operasional,
perlengkapan/peralatan, proyek, dan lainnya. Daftar kategori dikelola
Admin/Purchasing.\
**FR-REQ-04** Pemohon boleh mengetik nama barang dan spesifikasi secara
bebas. Item baru tidak otomatis menjadi katalog; Admin menambahkannya
secara manual bila diperlukan.\
**FR-REQ-05** Pemohon dapat mengisi urgensi yang diusulkan. Prioritas
final ditentukan Supervisor sesuai aturan kantor.\
**FR-REQ-06** Pemohon dapat menyimpan pengajuan sebagai draf.\
**FR-REQ-07** Lampiran pemohon wajib ada, dengan jenis dokumen sesuai
kebutuhan pengajuan. Jenis dan jumlah lampiran yang diwajibkan perlu
dikonfigurasi.\
**FR-REQ-08** Sistem menghasilkan nomor pengajuan yang unik.\
**FR-REQ-09** Sebelum persetujuan, pemohon harus menarik pengajuan,
mengeditnya, lalu mengirim ulang; pengeditan langsung pada pengajuan
aktif tidak diperbolehkan.\
**FR-REQ-10** Pemohon dapat melihat status, riwayat perubahan,
keputusan, dan catatan tindak lanjut untuk pengajuan miliknya.\
**FR-REQ-11** Pemohon dapat mengusulkan pembatalan jika barang tidak
lagi diperlukan, tetapi pembatalan setelah tahap tertentu harus
dijalankan oleh Admin/Purchasing sesuai kewenangan dan tahap transaksi.\
**FR-REQ-12** Sistem menyimpan transaksi yang dibatalkan sebagai data
historis dan tidak menghapusnya permanen.

### 7.3 Kategori dan pencarian barang

**FR-CAT-01** Admin dan Purchasing dapat mengelola kategori barang.\
**FR-CAT-02** Input nama dan spesifikasi bebas tetap tersedia.\
**FR-CAT-03** Pemeriksaan duplikasi atau kemiripan item dilakukan manual
oleh Purchasing pada rilis awal.\
**FR-CAT-04** Sistem menyediakan pencarian cepat dan filter lanjutan.\
**FR-CAT-05** Filter mencakup nomor pengajuan, pemohon, bagian, item,
status, tanggal, vendor, urgensi, dan petugas Purchasing sesuai hak
akses.\
**FR-CAT-06** Daftar transaksi menggunakan tabel yang dapat difilter dan
diurutkan. Tampilan harus tetap dapat digunakan di layar HP.

### 7.4 Persetujuan

**FR-APR-01** Jalur persetujuan ditentukan oleh matriks berdasarkan
nilai, jenis pengajuan, dan bagian pemohon.\
**FR-APR-02** Atasan ditentukan dengan mempertimbangkan struktur
organisasi dan hierarki; approver dan kondisi aktual dikonfigurasi
manual oleh Admin berdasarkan arahan pimpinan.\
**FR-APR-03** Jalur dasar persetujuan berlaku untuk seluruh kategori
barang, dengan variasi berdasarkan matriks, bukan alur terpisah otomatis
untuk setiap kategori.\
**FR-APR-04** Semua approver yang diwajibkan pada level yang ditetapkan
harus menyetujui. Persetujuan paralel memerlukan persetujuan seluruh
approver yang ditugaskan.\
**FR-APR-05** Rancangan brainstorming menyatakan semua level persetujuan
diberi tugas secara bersamaan. Interpretasi akhir mengenai
ketergantungan antarlevel harus dikonfirmasi sebelum implementasi karena
dapat berbeda dari pola persetujuan berjenjang biasa.\
**FR-APR-06** Jika salah satu approver menolak, pengajuan kembali kepada
pemohon untuk revisi. Alasan penolakan dicatat.\
**FR-APR-07** Jika approver tidak merespons, sistem mengirim pengingat
dan melakukan eskalasi kepada supervisor; sistem tidak menyetujui atau
menolak otomatis.\
**FR-APR-08** Jika approver tidak tersedia atau nonaktif, transaksi
ditahan sampai konfigurasi diperbaiki. Tidak ada delegasi otomatis.\
**FR-APR-09** Pengajuan mendesak tetap mengikuti jalur persetujuan
normal.\
**FR-APR-10** Revisi hanya memicu persetujuan ulang dari approver yang
terdampak, sesuai aturan perubahan.\
**FR-APR-11** Semua keputusan persetujuan dan versi pengajuan sebelumnya
disimpan.\
**FR-APR-12** Admin dapat memperbarui matriks persetujuan berdasarkan
arahan/otorisasi pimpinan; perubahan konfigurasi dicatat.\
**FR-APR-13** Detail ambang nilai, kondisi, jumlah level, daftar
approver, dan kewenangan Keuangan masih TBD dan wajib disahkan sebelum
produksi.

### 7.5 Perubahan setelah pengajuan

**FR-CHG-01** Sebelum persetujuan, pengajuan ditarik, diedit, dan
dikirim ulang oleh pemohon.\
**FR-CHG-02** Perubahan harga aktual---baik naik maupun turun dari
estimasi---memerlukan persetujuan pemohon dan Supervisor pemohon sebelum
dilanjutkan.\
**FR-CHG-03** Perubahan jumlah memerlukan persetujuan ulang. Approver
yang tepat perlu ditetapkan dalam aturan perubahan.\
**FR-CHG-04** Perubahan spesifikasi tanpa perubahan harga memerlukan
persetujuan ulang dari approver yang terdampak.\
**FR-CHG-05** Perubahan tanggal dibutuhkan atau keterlambatan harus
mencatat alasan dan tanggal baru, serta memberi tahu pihak terkait.\
**FR-CHG-06** Setiap perubahan penting menyimpan nilai lama, nilai baru,
pelaku, waktu, alasan, dan keputusan persetujuan terkait.\
**FR-CHG-07** Sistem tidak menimpa histori transaksi secara diam-diam.

### 7.6 Antrean dan proses Purchasing

**FR-PUR-01** Pengajuan yang telah disetujui otomatis masuk antrean
Purchasing.\
**FR-PUR-02** Purchasing bertanggung jawab atas proses pembelian.\
**FR-PUR-03** Urutan kerja mempertimbangkan urgensi, tanggal dibutuhkan,
dan posisi antrean. Prioritas final ditentukan Supervisor.\
**FR-PUR-04** Purchasing dapat mencatat data pembelian dasar, vendor,
penawaran, dan dokumen pendukung.\
**FR-PUR-05** Purchasing menyimpan penawaran yang dipertimbangkan,
termasuk penawaran pembanding.\
**FR-PUR-06** Bukti pemesanan kepada vendor wajib tersedia sebelum
transaksi maju ke tahap yang ditetapkan.\
**FR-PUR-07** Jumlah penawaran yang dibutuhkan mengikuti aturan kantor
berdasarkan jenis/nilai transaksi; nilai persis masih TBD.\
**FR-PUR-08** Purchasing dapat menggabungkan beberapa pengajuan secara
manual menjadi satu pembelian. Setiap pembelian gabungan tetap terhubung
ke seluruh pengajuan dan pemohon asal.\
**FR-PUR-09** Sistem mencatat nilai per item, nilai pesanan, dan total
transaksi. Rincian pajak, pengiriman, atau komponen biaya lainnya bukan
persyaratan awal.\
**FR-PUR-10** Jika harga aktual berbeda dari estimasi, pemohon dan
Supervisor pemohon harus menyetujui harga aktual sebelum pembelian
diteruskan.\
**FR-PUR-11** Jika nilai melampaui anggaran, sistem menampilkan
peringatan dan meminta persetujuan tambahan sesuai aturan; sistem tidak
memblokir secara mutlak hanya berdasarkan peringatan anggaran.\
**FR-PUR-12** Pelacakan vendor dan status pesanan tersedia tanpa
membangun modul manajemen vendor penuh.\
**FR-PUR-13** Jika transaksi terlambat, Purchasing wajib mencatat
alasan, perkiraan tanggal baru, tindakan tindak lanjut, tanggal
tindakan, penanggung jawab, respons vendor, dan target penyelesaian.\
**FR-PUR-14** Jika vendor tidak merespons, Purchasing mencatat upaya
tindak lanjut dan mengeskalasi kepada Supervisor.\
**FR-PUR-15** Jika vendor tidak dapat memenuhi seluruh kuantitas,
Purchasing mengajukan usulan penyelesaian kekurangan kepada pihak
berwenang untuk disetujui.\
**FR-PUR-16** Penggantian barang dicatat sebagai pesanan baru yang
terhubung dengan transaksi asal.\
**FR-PUR-17** Pembatalan setelah pemesanan harus mengikuti kewenangan
berdasarkan tahap transaksi, mencatat alasan dan dampak transaksi, serta
mempertahankan histori.\
**FR-PUR-18** Transaksi lama yang belum selesai ditandai untuk ditinjau
dan diminta memperbarui tindak lanjut; sistem tidak membatalkan
otomatis.\
**FR-PUR-19** Purchasing menutup transaksi setelah seluruh kriteria
penyelesaian terpenuhi. Admin tidak mengambil alih persetujuan
operasional hanya karena memiliki akses administratif.

### 7.7 Penerimaan barang dan serah terima

**FR-RCV-01** Penerimaan dari vendor dicatat oleh Purchasing sebagai
peristiwa terpisah dari serah terima kepada pemohon.\
**FR-RCV-02** Penerimaan mencatat jumlah diterima, kondisi barang,
waktu, petugas, status, dan bukti bila diperlukan.\
**FR-RCV-03** Untuk pengiriman parsial, sistem mencatat jumlah diterima
dan jumlah tersisa; transaksi tetap aktif sampai lengkap atau
pengecualian diselesaikan secara resmi.\
**FR-RCV-04** Jika barang rusak atau tidak sesuai, seluruh pesanan
ditahan sampai masalah terselesaikan.\
**FR-RCV-05** Barang pengganti dicatat sebagai pesanan baru yang terkait
dengan transaksi asal.\
**FR-RCV-06** Barang tidak boleh diserahterimakan kepada pemohon sebelum
seluruh pesanan lengkap atau penyelesaian resmi disetujui.\
**FR-RCV-07** Purchasing menandai pesanan siap diserahterimakan setelah
persyaratan terpenuhi.\
**FR-RCV-08** Pemohon mengonfirmasi penerimaan akhir di sistem; bukti
tambahan dapat dilampirkan bila diperlukan.\
**FR-RCV-09** Jika terdapat perbedaan jumlah, sistem mencatat jumlah
aktual, alasan, dan penyelesaian yang disetujui.\
**FR-RCV-10** Transaksi dapat dinyatakan selesai jika kuantitas
terpenuhi atau selisih diselesaikan secara resmi, dokumen wajib lengkap,
dan semua masalah terselesaikan.\
**FR-RCV-11** Dokumen wajib yang belum lengkap memblokir perpindahan ke
tahap berikutnya.

### 7.8 Dokumen dan arsip

**FR-DOC-01** Lampiran pengajuan pemohon wajib, tetapi jenisnya
mengikuti kebutuhan pengajuan.\
**FR-DOC-02** Penawaran vendor disimpan pada tingkat transaksi
pembelian, termasuk penawaran pembanding.\
**FR-DOC-03** Bukti pemesanan vendor wajib.\
**FR-DOC-04** Kebutuhan bukti penerimaan dari vendor masih TBD; harus
diputuskan berdasarkan proses kantor sebelum produksi.\
**FR-DOC-05** Bukti serah terima kepada pemohon terdiri dari konfirmasi
sistem dan bukti pendukung bila diperlukan.\
**FR-DOC-06** Jika dokumen wajib tidak ada, sistem mencegah perpindahan
ke tahap berikutnya.\
**FR-DOC-07** Arsip pusat dibatasi untuk Purchasing dan Admin pada
rancangan awal. Detail dokumen yang boleh dilihat pemohon/atasan pada
transaksi terkait harus ditetapkan dalam matriks akses.\
**FR-DOC-08** Dokumen terkait transaksi harus tertaut ke transaksi yang
benar, bukan hanya disimpan sebagai berkas lepas.\
**FR-DOC-09** Pengunduhan dokumen dibatasi sesuai peran dan dicatat bila
relevan.

### 7.9 Notifikasi, tugas, dan eskalasi

**FR-NTF-01** Sistem memiliki pusat tugas yang menampilkan tugas sesuai
peran pengguna.\
**FR-NTF-02** Email digunakan untuk perubahan status penting, tugas,
persetujuan, revisi, keterlambatan, dan eskalasi. Tidak setiap perubahan
kecil perlu dikirim lewat email.\
**FR-NTF-03** Pengingat diberikan sebelum dan sesudah tenggat sesuai
konfigurasi. Pengingat persetujuan nonrespons pernah ditetapkan harian
dalam brainstorming; frekuensi final harus dikonfirmasi bersama
kebijakan SLA.\
**FR-NTF-04** Notifikasi keterlambatan dikirim kepada pihak yang terkait
dengan transaksi.\
**FR-NTF-05** Status notifikasi cukup dibaca/belum dibaca. Status ini
berbeda dari status penyelesaian tugas.\
**FR-NTF-06** Admin menetapkan notifikasi bawaan. Notifikasi wajib tidak
dapat dinonaktifkan pengguna.\
**FR-NTF-07** Eskalasi tidak berarti persetujuan otomatis.\
**FR-NTF-08** Setiap notifikasi harus mengarahkan pengguna ke transaksi
atau tugas yang relevan, dengan pemeriksaan hak akses.

### 7.10 Dashboard dan laporan

**FR-RPT-01** Dashboard disesuaikan dengan peran.\
**FR-RPT-02** Dashboard pegawai menampilkan status pengajuan, histori
perubahan, dan catatan tindak lanjut.\
**FR-RPT-03** Dashboard Purchasing menampilkan antrean, jumlah transaksi
per status, keterlambatan, dan tugas yang perlu ditindaklanjuti.\
**FR-RPT-04** Dashboard pimpinan menampilkan ringkasan keseluruhan
pengajuan, status, anggaran, keterlambatan, urgensi, dan indikator
kinerja proses.\
**FR-RPT-05** Dashboard Admin menyediakan ringkasan operasional sistem
yang relevan.\
**FR-RPT-06** Laporan mencakup pengajuan tertunda, durasi proses,
anggaran, histori, urgensi, pembatalan, dan status.\
**FR-RPT-07** Filter laporan mencakup periode, bagian, jenis item,
status, urgensi, dan petugas Purchasing.\
**FR-RPT-08** Laporan dapat diekspor ke Excel dan PDF.\
**FR-RPT-09** Laporan tersedia untuk periode harian, mingguan, dan
bulanan.\
**FR-RPT-10** Laporan lintas bagian dapat diakses Admin, Pimpinan, dan
Purchasing sesuai hak akses.\
**FR-RPT-11** Durasi kalender dan durasi kerja aktif dicatat untuk
setiap tahap. Definisi jam kerja dan cara menghitung waktu tunggu pihak
lain perlu ditetapkan.\
**FR-RPT-12** Dashboard pimpinan menonjolkan keterlambatan kritis, bukan
membanjiri pengguna dengan semua detail.

### 7.11 Bantuan dan penanganan masalah

**FR-HLP-01** Pengguna dapat menghubungi Admin secara langsung untuk
bantuan.\
**FR-HLP-02** Admin dapat meneruskan laporan ke pihak yang sesuai.\
**FR-HLP-03** Laporan dapat dicatat sebagai tiket bila diperlukan,
dengan nomor, status, penanggung jawab, dan riwayat penanganan.\
**FR-HLP-04** Sistem menyediakan FAQ dan panduan penggunaan.\
**FR-HLP-05** Pengguna menyampaikan urgensi; Admin menetapkan prioritas
akhir.\
**FR-HLP-06** Penilaian kepuasan setelah penyelesaian tidak diperlukan
pada rilis awal.\
**FR-HLP-07** Prosedur dukungan sistem harus membedakan gangguan teknis
dari masalah proses bisnis.

### 7.12 Audit dan retensi

**FR-AUD-01** Aktivitas penting dicatat, termasuk perubahan hak akses
dan konfigurasi.\
**FR-AUD-02** Riwayat perubahan transaksi menyimpan nilai lama dan baru,
pelaku, waktu, alasan, dan persetujuan terkait.\
**FR-AUD-03** Keputusan persetujuan dan versi terdahulu tidak dihapus
ketika revisi dibuat.\
**FR-AUD-04** Transaksi selesai dan dibatalkan menggunakan soft delete
atau penanda status, bukan penghapusan permanen oleh pengguna biasa.\
**FR-AUD-05** Masa retensi data dan dokumen mengikuti kebijakan kantor
serta ketentuan yang berlaku; durasi pastinya TBD.\
**FR-AUD-06** Akses teknis terhadap data produksi harus dibatasi dan
dicatat sesuai kebutuhan keamanan.

## 8. Aturan Bisnis Utama

1.  Pengajuan tidak dapat dikirim jika data atau lampiran wajib belum
    lengkap.
2.  Pengajuan yang sudah disetujui masuk antrean Purchasing secara
    otomatis.
3.  Seluruh approver yang ditugaskan wajib menyetujui sesuai aturan yang
    disahkan.
4.  Tidak ada auto-approve atau auto-reject saat approver terlambat.
5.  Approver nonaktif atau belum terkonfigurasi menyebabkan transaksi
    ditahan sampai konfigurasi diperbaiki.
6.  Pengajuan mendesak tidak melewati jalur persetujuan normal.
7.  Perubahan harga aktual, baik naik maupun turun, memerlukan
    persetujuan pemohon dan Supervisor pemohon.
8.  Perubahan jumlah memerlukan persetujuan ulang.
9.  Perubahan spesifikasi tanpa perubahan harga memerlukan persetujuan
    ulang dari pihak yang terdampak.
10. Penerimaan parsial membuat transaksi tetap aktif.
11. Barang rusak/tidak sesuai menahan seluruh pesanan sampai masalah
    terselesaikan.
12. Tidak ada serah terima kepada pemohon sebelum seluruh pesanan
    lengkap atau penyelesaian resmi disetujui.
13. Dokumen wajib yang tidak tersedia memblokir perpindahan tahap.
14. Pembatalan dan penyelesaian pengecualian harus dilakukan pihak
    berwenang dan menyimpan alasan serta dampak transaksi.
15. Data historis dan jejak audit tidak dihapus melalui operasi normal.
16. Peringatan anggaran tidak otomatis memblokir transaksi, tetapi dapat
    memerlukan persetujuan tambahan.
17. Semua penggabungan pembelian harus mempertahankan tautan ke
    pengajuan asal.
18. Penggantian barang menjadi pesanan baru yang terhubung dengan
    transaksi asal.

## 9. Persyaratan Nonfungsional

### 9.1 Kemudahan penggunaan

-   Antarmuka berbahasa Indonesia.
-   Alur pemohon sesingkat mungkin tanpa mengurangi validasi penting.
-   Komputer menjadi pengalaman utama; HP mendukung pemeriksaan status
    dan persetujuan.
-   Formulir memberikan pesan kesalahan yang jelas dan menunjukkan isian
    yang perlu diperbaiki.
-   Tabel mendukung filter dan pengurutan.
-   FAQ/panduan tersedia di dalam aplikasi.

### 9.2 Performa

-   Perkiraan beban awal kurang dari 50 pengajuan per bulan.
-   Pencarian dan daftar transaksi harus tetap responsif pada volume
    awal dan dapat berkembang.
-   Target angka performa seperti waktu respons p95 belum ditetapkan dan
    perlu disepakati saat desain teknis.
-   Operasi berat seperti ekspor laporan dapat diproses tanpa mengunci
    penggunaan aplikasi lainnya bila diperlukan.

### 9.3 Keandalan dan jaringan

-   Ketika permintaan gagal, data formulir yang sudah diketik tidak
    boleh hilang.
-   Pengguna harus dapat mencoba kembali setelah kesalahan jaringan.
-   Sistem harus membedakan draf yang tersimpan di perangkat, draf yang
    tersimpan di server, dan transaksi yang benar-benar berhasil
    dikirim.
-   Pengiriman ulang harus aman dari duplikasi transaksi, misalnya
    menggunakan token/idempotensi atau mekanisme setara.
-   Sistem harus menampilkan konfirmasi jelas untuk tindakan yang
    berhasil atau gagal.

### 9.4 Keamanan

-   Password disimpan menggunakan hashing yang kuat dan praktik keamanan
    modern.
-   Pemeriksaan hak akses dilakukan di sisi server, bukan hanya
    menyembunyikan tombol di UI.
-   Dokumen dilindungi dari akses langsung tanpa otorisasi.
-   Penggunaan koneksi terenkripsi saat aplikasi diakses melalui
    jaringan.
-   Validasi tipe dan ukuran berkas serta pemindaian keamanan berkas
    dipertimbangkan.
-   Perlindungan terhadap brute force, session theft, CSRF, XSS, SQL
    injection, dan risiko web umum diterapkan sesuai arsitektur.
-   Akun dengan hak tinggi menggunakan prinsip least privilege.
-   Rahasia aplikasi dan kredensial database tidak disimpan di
    repositori kode.

### 9.5 Backup dan pemulihan

-   Backup harian.
-   Salinan berkala di lokasi berbeda dari server utama.
-   Backup database dan dokumen harus konsisten atau memiliki prosedur
    rekonsiliasi.
-   Jadwal, enkripsi, retensi backup, dan akses backup perlu ditetapkan.
-   Target RPO/RTO belum ditentukan.
-   Uji pemulihan berkala diperlukan; keberhasilan backup tidak dianggap
    terbukti sebelum data berhasil dipulihkan.

### 9.6 Auditabilitas dan pemeliharaan

-   Riwayat transaksi harus dapat ditelusuri.
-   Perubahan konfigurasi dan hak akses dicatat.
-   Pembaruan aplikasi dan database harus melalui prosedur yang
    terkendali.
-   Log aplikasi tidak boleh membocorkan password, token, atau isi
    dokumen sensitif.
-   Tersedia lingkungan uji sebelum perubahan penting diterapkan ke
    produksi.

### 9.7 Skalabilitas

-   Desain data memisahkan pengguna, bagian, pengajuan, item,
    persetujuan, pembelian, vendor, penerimaan, serah terima, dokumen,
    dan audit log.
-   Modul pengajuan jasa dapat ditambahkan kemudian tanpa mengacaukan
    alur pengadaan barang.
-   Hak akses dan matriks persetujuan harus dapat dikonfigurasi tanpa
    mengubah kode untuk setiap perubahan rutin, sepanjang aturan bisnis
    memungkinkan.
-   Desain tidak boleh mengunci kantor pada satu vendor aplikasi
    tertentu tanpa alasan yang jelas.

## 10. Model Data Konseptual

Ini adalah rancangan konseptual, bukan skema database final.
Normalisasi, tipe data, indeks, dan batasan relasi diputuskan pada tahap
desain teknis.

  -----------------------------------------------------------------------------------
  Entitas                 Data utama              Relasi/tujuan
  ----------------------- ----------------------- -----------------------------------
  User                    username, hash          Akun sistem
                          password, email,        
                          status, role            

  Role / Permission       nama peran, izin        Mengendalikan akses

  Employee                identitas pegawai,      Profil pegawai yang terkait akun
                          bagian, jabatan, status 

  Department              nama bagian, status     Struktur organisasi

  ApprovalRule            kondisi                 Matriks persetujuan
                          nilai/jenis/bagian,     
                          approver, aturan        

  Request                 nomor, pemohon, bagian, Pengajuan utama
                          status, urgensi,        
                          tanggal                 

  RequestItem             nama, spesifikasi,      Item pengajuan
                          jumlah, alasan, tanggal 
                          dibutuhkan, estimasi    
                          harga                   

  RequestVersion          versi, snapshot data,   Histori perubahan
                          alasan revisi, pelaku,  
                          waktu                   

  ApprovalTask            approver, keputusan,    Keputusan persetujuan
                          waktu, komentar,        
                          level/kelompok          

  Attachment              metadata berkas, lokasi Lampiran yang terkait
                          penyimpanan, kategori,  
                          pemilik                 

  Purchase                nomor pembelian,        Proses pembelian
                          status, nilai, petugas  

  PurchaseRequestLink     purchase_id,            Mendukung penggabungan pengajuan
                          request_id,             
                          item/kuantitas terkait  

  Vendor                  nama dan informasi      Referensi vendor sederhana
                          dasar vendor            

  Quote                   vendor, nilai, tanggal, Penawaran pembanding
                          berkas, status pilihan  

  PurchaseOrder           referensi vendor, nomor Pemesanan ke vendor
                          pesanan, tanggal, ETA,  
                          bukti                   

  FollowUp                tanggal, petugas,       Tindak lanjut vendor
                          tindakan, respons       
                          vendor, target          
                          penyelesaian            

  Receipt                 tanggal, petugas,       Penerimaan dari vendor
                          jumlah diterima,        
                          kondisi, bukti          

  Discrepancy             jenis masalah, jumlah   Selisih/kerusakan/ketidaksesuaian
                          terdampak, alasan,      
                          status, penyelesaian    

  Handover                tanggal, pemohon,       Serah terima kepada pemohon
                          jumlah, konfirmasi,     
                          bukti                   

  Notification            penerima, jenis, pesan, Notifikasi
                          status dibaca, waktu    

  Task                    penerima, tindakan,     Pusat tugas
                          tenggat, status         

  AuditLog                pelaku, aksi, entitas,  Jejak audit
                          nilai lama/baru, waktu, 
                          alasan                  

  SupportIssue            pelapor, uraian,        Tiket bantuan opsional
                          prioritas, penanggung   
                          jawab, status           

  SystemConfig            kunci konfigurasi,      Pengaturan aplikasi
                          nilai, pengubah, waktu  
  -----------------------------------------------------------------------------------

### 10.1 Catatan desain data

-   Harga, kuantitas, dan total perlu menyimpan nilai yang digunakan
    pada versi pengajuan serta nilai akhir yang disetujui.
-   Mata uang dan aturan pembulatan harus ditetapkan; asumsi awal adalah
    mata uang transaksi kantor yang berlaku.
-   Pembelian gabungan harus bisa ditelusuri kembali ke beberapa
    pengajuan.
-   Penerimaan parsial harus mencatat banyak kejadian penerimaan untuk
    satu pesanan.
-   Penggantian barang harus memiliki hubungan eksplisit ke
    pesanan/masalah asal.
-   Data historis persetujuan tidak boleh hanya mengacu pada konfigurasi
    approver terbaru.
-   Berkas sebaiknya disimpan di object/file storage atau direktori
    terlindungi; database menyimpan metadata dan referensinya, bukan
    harus menyimpan berkas biner secara langsung.
-   Data pegawai dapat diimpor dari sumber HRIS bila kemudian
    disepakati, tetapi sinkronisasi otomatis bukan bagian dari cakupan
    yang sudah disetujui.

## 11. Matriks Akses Awal

Matriks berikut adalah dasar diskusi. Hak final harus diuji terhadap
struktur kewenangan kantor.

  --------------------------------------------------------------------------------------------------------------------------------
  Fitur         Pegawai      Pengelola Bagian   Supervisor               Purchasing   Keuangan      Pimpinan      Admin
  ------------- ------------ ------------------ ------------------------ ------------ ------------- ------------- ----------------
  Membuat       Ya           Ya, sesuai         Ya, bila sebagai pemohon Jika         Jika          Jika          Jika berwenang
  pengajuan                  kebutuhan                                   berwenang    berwenang     berwenang     sebagai pemohon
                                                                         sebagai      sebagai       sebagai       
                                                                         pemohon      pemohon       pemohon       

  Melihat       Ya           Ya                 Sesuai kewenangan        Ya           Sesuai        Ya            Ya
  ringkasan                                                                           kewenangan                  
  lintas bagian                                                                                                   

  Melihat       Ya           Ya                 Ya                       Ya           Ya            Sesuai        Sesuai kebutuhan
  detail                                                                                            kewenangan    administrasi
  pengajuan                                                                                                       
  sendiri                                                                                                         

  Melihat       Terbatas     Bagian/otorisasi   Yang                     Untuk proses Yang          Yang          Sesuai kebutuhan
  detail                                        ditugaskan/diotorisasi   pengadaan    diotorisasi   diotorisasi   dan kebijakan
  pengajuan                                                                                                       
  pihak lain                                                                                                      

  Menyetujui    Jika         Jika ditugaskan    Jika ditugaskan          Tidak        Jika          Jika          Tidak karena
  pengajuan     ditugaskan                                               otomatis     ditugaskan    ditugaskan    status admin
                                                                                                                  semata

  Mengelola     Tidak        Tidak              Tidak kecuali berwenang  Ya           Sesuai        Tidak         Tidak otomatis
  pembelian                                                                           kewenangan    otomatis      
                                                                                      keuangan                    

  Mengelola     Tidak        Belum ditetapkan   Belum ditetapkan         Ya           Belum         Belum         Ya
  arsip pusat                                                                         ditetapkan    ditetapkan    

  Mengelola     Tidak        Tidak              Tidak                    Tidak        Tidak         Tidak         Ya
  akun/peran                                                                                                      

  Mengubah      Tidak        Tidak              Tidak                    Tidak        Tidak         Memberi       Admin
  matriks                                                                                           otorisasi     mengonfigurasi
  persetujuan                                                                                       kebijakan     setelah
                                                                                                                  otorisasi

  Melihat audit Tidak        Terbatas           Terbatas                 Sesuai       Sesuai        Sesuai        Ya, sesuai
  log                                                                    kebutuhan    kebutuhan     kebijakan     kebutuhan
  --------------------------------------------------------------------------------------------------------------------------------

**Penting:** Admin tidak boleh otomatis memiliki kewenangan bisnis untuk
menyetujui transaksi hanya karena memiliki akses administrasi. Hak
teknis dan kewenangan operasional harus dipisahkan.

## 12. SLA, Prioritas, dan Eskalasi

### 12.1 Yang sudah disepakati

-   SLA akan ditentukan kemudian.
-   Pengingat persetujuan nonrespons pernah dipilih harian.
-   Pengingat juga diharapkan diberikan sebelum dan setelah tenggat.
-   Eskalasi persetujuan terlambat diarahkan ke Supervisor.
-   Pengingat tugas Purchasing mengikuti tenggat.
-   Prioritas final ditentukan Supervisor.
-   Pengguna dapat menyampaikan urgensi; Admin menetapkan prioritas
    laporan bantuan.
-   Durasi kalender dan durasi kerja aktif perlu dicatat.
-   Transaksi lama ditandai untuk peninjauan, bukan dibatalkan otomatis.

### 12.2 Yang perlu dikonfigurasi

-   Durasi target per tahap.
-   Kalender kerja, akhir pekan, hari libur, dan zona waktu.
-   Jarak pengingat sebelum tenggat.
-   Frekuensi pengingat setelah tenggat.
-   Ambang eskalasi ke Supervisor dan pimpinan.
-   Definisi keterlambatan kritis.
-   Cara menghitung waktu ketika transaksi menunggu pemohon, approver,
    vendor, atau pihak lain.

Tidak boleh ada angka SLA yang dianggap kebijakan final sebelum
disetujui kantor.

## 13. Pelaporan dan KPI

### 13.1 Laporan minimum

-   Pengajuan berdasarkan status.
-   Pengajuan tertunda.
-   Pengajuan berdasarkan bagian, pemohon, kategori, urgensi, dan
    periode.
-   Lama proses per tahap.
-   Riwayat persetujuan dan revisi.
-   Daftar pembelian, vendor, dan status pesanan.
-   Keterlambatan serta tindak lanjut vendor.
-   Penerimaan parsial, kerusakan, ketidaksesuaian, dan penyelesaian.
-   Pembatalan beserta alasan.
-   Ringkasan anggaran dan peringatan anggaran.
-   Aktivitas Purchasing.

### 13.2 KPI awal

-   Jumlah pengajuan per status.
-   Jumlah pengajuan tertunda.
-   Jumlah transaksi terlambat.
-   Lama kalender dan lama kerja aktif per tahap.
-   Jumlah revisi dan pembatalan.
-   Jumlah pesanan yang diterima parsial atau mengalami masalah.

KPI Purchasing yang secara eksplisit diprioritaskan pada brainstorming
adalah **jumlah permintaan per status**. Rata-rata waktu penyelesaian
tidak dipilih sebagai KPI utama, tetapi data durasi tetap dicatat untuk
analisis.

## 14. Arsitektur dan Pendekatan Teknologi

Bagian ini merupakan rekomendasi awal untuk divalidasi, bukan keputusan
teknologi yang sudah disahkan.

### 14.1 Bentuk aplikasi

-   Aplikasi web responsif.
-   Satu backend/API untuk validasi bisnis, autentikasi, hak akses,
    persetujuan, dan audit.
-   Database relasional.
-   Penyimpanan berkas terpisah dan terlindungi.
-   Layanan pengiriman email.
-   Proses terjadwal untuk notifikasi, pengingat, dan backup.
-   Lingkungan development, testing/staging, dan production bila sumber
    daya memungkinkan.

### 14.2 Kandidat teknologi

  -----------------------------------------------------------------------
  Lapisan                 Kandidat awal           Pertimbangan
  ----------------------- ----------------------- -----------------------
  Frontend                React/Next.js atau      Antarmuka responsif dan
                          framework web setara    komponen yang dapat
                                                  dipakai ulang

  Backend                 Node.js dengan          Validasi server, API,
                          framework terstruktur   autentikasi, workflow
                          atau Django             

  Database                PostgreSQL              Relasi transaksi,
                                                  konsistensi data, query
                                                  laporan, dan dukungan
                                                  transaksi

  Penyimpanan dokumen     Penyimpanan berkas      Dokumen tidak diakses
                          terlindungi atau object melalui URL publik
                          storage kompatibel S3   tanpa kontrol

  Reverse proxy/HTTPS     Nginx atau setara       Terminasi TLS dan
                                                  routing

  Deployment              Linux server/container  Reproduksibilitas
                          bila sesuai kapasitas   deployment dan
                          tim                     pemeliharaan

  Email                   SMTP layanan organisasi Notifikasi dan reset
                          yang disetujui          password

  Backup                  Dump/backup database    Pemulihan dari
                          plus backup dokumen ke  kerusakan server
                          lokasi terpisah         
  -----------------------------------------------------------------------

Pemilihan akhir harus mempertimbangkan keahlian pengembang, dukungan
jangka panjang, biaya, kemudahan pemeliharaan, keamanan, dan kemampuan
kantor mengelola sistem sendiri. Jangan memilih beberapa framework
sekaligus; tentukan satu stack yang dikuasai tim.

### 14.3 Pola arsitektur

Rancangan awal yang disarankan adalah **monolit modular**, bukan
microservices. Volume awal relatif rendah dan sistem akan lebih mudah
dikembangkan, diuji, dicadangkan, serta dipelihara oleh tim internal.
Modul seperti pengajuan, persetujuan, purchasing, penerimaan,
notifikasi, laporan, dan administrasi dipisahkan secara logis dalam satu
aplikasi.

### 14.4 Prinsip integritas transaksi

-   Perubahan status dan pembuatan audit log harus konsisten.
-   Transaksi penting memakai database transaction.
-   Pengiriman email dilakukan melalui antrean/proses yang tidak
    menggagalkan transaksi bisnis jika email sementara gagal.
-   Proses pengiriman ulang tidak membuat pengajuan/pesanan duplikat.
-   Perubahan matriks persetujuan tidak mengubah keputusan historis.
-   File upload menggunakan nama internal acak dan validasi, bukan
    mempercayai nama berkas pengguna.

## 15. Rencana Deployment dan Operasional

### 15.1 Lingkungan

1.  **Development:** untuk pembuatan fitur.
2.  **Testing/Staging:** untuk pengujian alur, hak akses, dan penerimaan
    pengguna.
3.  **Production:** digunakan pegawai untuk transaksi nyata.

Data sensitif produksi sebaiknya tidak disalin ke development tanpa
masking dan otorisasi.

### 15.2 Checklist sebelum produksi

-   Server dan sistem operasi diperbarui serta diamankan.
-   Domain atau alamat akses dan HTTPS ditetapkan.
-   Firewall hanya membuka port yang dibutuhkan.
-   Database tidak diekspos langsung ke internet.
-   Kredensial dan secret disimpan aman.
-   Backup otomatis dan salinan terpisah berjalan.
-   Pemulihan backup diuji.
-   Email notifikasi dan reset password diuji.
-   Akun Admin awal diamankan.
-   Hak akses per peran diuji.
-   Pengujian penerimaan pengguna selesai.
-   Prosedur insiden dan kontak pengelola ditetapkan.
-   Monitoring disk, CPU, RAM, database, dan ruang penyimpanan dokumen
    tersedia.

### 15.3 Operasional setelah live

-   Memantau kesehatan server dan kapasitas penyimpanan.
-   Memeriksa keberhasilan backup setiap hari.
-   Menguji pemulihan secara berkala.
-   Memperbarui sistem operasi, dependency, dan aplikasi secara
    terencana.
-   Meninjau akun tidak aktif dan hak akses secara berkala.
-   Meninjau log keamanan dan aktivitas administratif.
-   Menyediakan prosedur rollback untuk rilis bermasalah.
-   Mengelola perubahan matriks persetujuan melalui proses yang
    disetujui.
-   Mendokumentasikan konfigurasi, deployment, pemulihan, dan
    troubleshooting agar sistem tidak bergantung pada satu orang.

## 16. Pengujian dan Kriteria Penerimaan

### 16.1 Pengajuan

-   Pemohon dapat membuat draf dengan satu atau banyak item.
-   Pengajuan tidak dapat dikirim jika kolom atau lampiran wajib belum
    lengkap.
-   Nomor pengajuan unik.
-   Pemohon dapat menarik, mengubah, dan mengirim ulang sesuai aturan.
-   Isian tidak hilang saat permintaan gagal dan dapat dicoba kembali.
-   Percobaan ulang tidak membuat transaksi duplikat.

### 16.2 Persetujuan

-   Jalur approver sesuai matriks yang disahkan.
-   Semua approver yang diwajibkan harus menyetujui.
-   Penolakan mengembalikan pengajuan untuk revisi.
-   Tidak ada auto-approve saat tenggat lewat.
-   Approver tidak aktif membuat transaksi tertahan dan terlihat untuk
    diperbaiki.
-   Riwayat keputusan lama tetap tersedia.
-   Perubahan hanya meminta persetujuan ulang dari pihak yang terdampak
    sesuai aturan.

### 16.3 Purchasing

-   Pengajuan yang disetujui masuk antrean secara otomatis.
-   Purchasing dapat menyimpan penawaran dan bukti pemesanan.
-   Perubahan harga aktual memicu persetujuan pemohon dan Supervisor.
-   Penggabungan pembelian mempertahankan hubungan ke pengajuan asal.
-   Keterlambatan dapat mencatat alasan, ETA baru, tindakan, respons
    vendor, dan target penyelesaian.
-   Transaksi lama tidak dibatalkan otomatis.

### 16.4 Penerimaan dan serah terima

-   Penerimaan parsial menyimpan jumlah diterima dan sisa.
-   Barang rusak/tidak sesuai menahan seluruh pesanan sesuai aturan.
-   Penggantian terhubung ke transaksi asal.
-   Tidak dapat serah terima sebelum semua barang lengkap atau
    pengecualian resmi diselesaikan.
-   Dokumen wajib yang belum lengkap memblokir penutupan.
-   Konfirmasi pemohon dan bukti serah terima dapat ditelusuri.

### 16.5 Akses dan audit

-   Pegawai hanya melihat detail dan dokumen sesuai hak akses.
-   Ringkasan lintas bagian tidak membuka dokumen yang dibatasi.
-   Admin tidak otomatis dapat menyetujui transaksi.
-   Perubahan sensitif mencatat pelaku, waktu, alasan, nilai lama/baru,
    dan persetujuan.
-   Transaksi selesai/batal tidak dapat dihapus permanen melalui UI
    biasa.
-   Backup dapat dipulihkan dalam uji pemulihan.

### 16.6 Dashboard dan laporan

-   Filter laporan berfungsi dan menghormati hak akses.
-   Ekspor Excel dan PDF berisi data sesuai filter.
-   Data durasi per tahap dapat dihitung dengan definisi yang disetujui.
-   Dashboard pimpinan menyoroti keterlambatan kritis.
-   Notifikasi penting terkirim atau tercatat untuk percobaan ulang jika
    email gagal.

## 17. Risiko dan Mitigasi

  -----------------------------------------------------------------------
  Risiko                  Dampak                  Mitigasi
  ----------------------- ----------------------- -----------------------
  Matriks persetujuan     Pengajuan salah jalur   Sahkan matriks sebelum
  belum jelas             atau tertahan           go-live; uji dengan
                                                  contoh nyata

  Hak akses terlalu luas  Kebocoran dokumen atau  RBAC/permission di
                          harga                   server; uji skenario
                                                  lintas peran

  Perubahan harga tidak   Pembelian tanpa         Blokir tahap berikutnya
  disetujui               otorisasi               sampai persetujuan
                                                  perubahan selesai

  Backup tidak dapat      Kehilangan data         Uji restore terjadwal
  dipulihkan                                      dan simpan salinan
                                                  terpisah

  Gangguan jaringan       Pengguna mengulang      Simpan isian lokal/draf
  menyebabkan data hilang pengisian               sesuai desain dan
                                                  tampilkan status
                                                  penyimpanan

  Vendor terlambat atau   Pengadaan tertunda      Catatan tindak lanjut,
  tidak merespons                                 ETA, pengingat, dan
                                                  eskalasi

  Kebutuhan berkembang    Ruang lingkup membesar  Pertahankan batas rilis
  menjadi ERP penuh                               awal dan kelola
                                                  perubahan melalui
                                                  backlog

  Sistem bergantung pada  Sulit dipelihara        Dokumentasi, standar
  satu pengembang                                 kode, repositori
                                                  internal, dan prosedur
                                                  deployment

  Arsip dan lampiran      Dokumen hilang atau     Relasi dokumen ke
  tidak konsisten         salah transaksi         transaksi, validasi,
                                                  backup, dan uji
                                                  integritas

  Email gagal             Pengguna tidak          Pusat tugas dalam
                          mengetahui perubahan    aplikasi, log
                                                  pengiriman, retry, dan
                                                  monitoring
  -----------------------------------------------------------------------

## 18. Backlog dan Tahapan Implementasi

Tahapan ini bersifat rekomendasi dan harus disesuaikan setelah keputusan
TBD ditutup.

### Tahap 0 --- Validasi kebijakan

-   Sahkan matriks persetujuan.
-   Tetapkan kewenangan Admin, Purchasing, Keuangan, Supervisor, dan
    Pimpinan.
-   Putuskan akses detail dan dokumen per peran.
-   Tentukan dokumen wajib per tahap.
-   Tentukan aturan harga, jumlah, pembatalan, dan penyelesaian
    pengecualian.
-   Tentukan SLA, eskalasi, retensi, RPO/RTO, dan backup.

### Tahap 1 --- Fondasi sistem

-   Struktur pengguna, pegawai, bagian, peran, dan permission.
-   Login, reset password, aktivasi/penonaktifan akun.
-   Audit log dasar.
-   Struktur kategori dan konfigurasi.
-   Deployment awal dan backup.

### Tahap 2 --- Pengajuan dan persetujuan

-   Formulir pengajuan multi-item dan draf.
-   Lampiran dan validasi.
-   Nomor transaksi.
-   Workflow persetujuan dan histori versi.
-   Dashboard pemohon dan pusat tugas.

### Tahap 3 --- Purchasing dan pemesanan

-   Antrean Purchasing dan prioritas.
-   Penawaran dan dokumen.
-   Vendor dan bukti pemesanan.
-   Penggabungan pembelian.
-   Perubahan harga/kuantitas dan persetujuan ulang.
-   Catatan tindak lanjut vendor.

### Tahap 4 --- Penerimaan, masalah, dan serah terima

-   Penerimaan parsial.
-   Kerusakan/ketidaksesuaian dan penahanan pesanan.
-   Penggantian barang.
-   Penyelesaian pengecualian.
-   Konfirmasi serah terima dan penutupan.

### Tahap 5 --- Laporan, notifikasi, dan hardening

-   Dashboard per peran.
-   Laporan dan ekspor Excel/PDF.
-   Pengingat, eskalasi, dan email.
-   FAQ/panduan.
-   Uji keamanan, beban, backup, pemulihan, dan penerimaan pengguna.
-   Pelatihan dan go-live bertahap.

## 19. Daftar Keputusan yang Masih TBD

Daftar ini merupakan prasyarat atau keputusan penting sebelum produksi:

1.  **Matriks persetujuan:** ambang nilai, jenis pengajuan, bagian,
    approver, jumlah level, serta peran Keuangan.
2.  **Semantik persetujuan paralel:** apakah seluruh level memang aktif
    serentak atau hanya semua approver pada level yang sama.
    Brainstorming memilih seluruh level menerima tugas bersamaan; ini
    perlu konfirmasi eksplisit.
3.  **Kewenangan perubahan jumlah:** siapa yang menyetujui dan apakah
    perubahan naik/turun diperlakukan sama.
4.  **Aturan penawaran:** jumlah minimum penawaran menurut jenis dan
    nilai transaksi.
5.  **Dokumen wajib:** jenis dokumen per tahap, khususnya bukti
    penerimaan vendor dan dokumen yang boleh dilihat pemohon.
6.  **Akses detail:** detail transaksi lintas bagian untuk Supervisor,
    Pengelola Bagian, Keuangan, dan Pimpinan.
7.  **Anggaran:** sumber data anggaran, pemilik data, aturan persetujuan
    tambahan, dan bagaimana saldo diperbarui.
8.  **SLA:** durasi tiap tahap, kalender kerja, frekuensi pengingat, dan
    ambang keterlambatan kritis.
9.  **Retensi:** masa simpan transaksi, dokumen, audit log, dan backup.
10. **Backup:** jadwal salinan berkala, enkripsi, lokasi, RPO/RTO, dan
    frekuensi uji pemulihan.
11. **Penyimpanan berkas:** lokasi dan kebijakan akses, kapasitas, batas
    ukuran, dan tipe berkas yang diizinkan.
12. **Sumber data pegawai:** apakah data diimpor manual dari HRIS,
    frekuensi pembaruan, dan siapa yang bertanggung jawab.
13. **Mata uang dan biaya:** mata uang resmi serta apakah
    pajak/pengiriman perlu dicatat pada fase berikutnya.
14. **Identitas sistem:** nama aplikasi, domain/alamat akses, dan metode
    akses dari jaringan kantor/luar kantor.
15. **Dukungan:** siapa Admin utama/cadangan, jam dukungan, dan proses
    pencatatan tiket saat dibutuhkan.
16. **Kriteria go-live:** siapa yang menyetujui penerimaan sistem dan
    siapa yang berwenang mengizinkan penggunaan transaksi nyata.

## 20. Pertanyaan yang Perlu Dijawab Pemilik Proses

Sebelum pengembangan, lakukan sesi validasi singkat dengan perwakilan
pemohon, Supervisor, Purchasing, Keuangan, Pimpinan, dan Admin:

-   Apakah setiap persyaratan mencerminkan proses kantor yang
    sebenarnya?
-   Apa contoh pengajuan dengan nilai kecil, sedang, besar, mendesak,
    dan lintas bagian?
-   Siapa approver untuk masing-masing contoh dan apakah persetujuannya
    paralel?
-   Dokumen apa yang wajib ada pada setiap tahap?
-   Siapa yang berwenang menerima pengecualian kekurangan kuantitas,
    pembatalan, atau barang tidak sesuai?
-   Informasi apa yang boleh dilihat semua pegawai, pimpinan,
    Purchasing, dan Keuangan?
-   Bagaimana sistem harus berperilaku saat approver tidak aktif, email
    gagal, server mati, atau vendor tidak merespons?
-   Apa bukti bahwa suatu transaksi boleh dinyatakan selesai?

Hasil validasi harus disimpan sebagai keputusan tertulis, bukan hanya
percakapan lisan.

## 21. Definisi Selesai untuk Rilis Awal

Rilis awal dapat dinyatakan siap digunakan ketika:

-   Seluruh alur pengajuan sampai serah terima dapat dijalankan pada
    lingkungan uji.
-   Matriks persetujuan dan kewenangan telah disahkan.
-   Pengujian hak akses lintas peran lulus.
-   Histori perubahan dan keputusan dapat ditelusuri.
-   Dokumen wajib memblokir perpindahan tahap jika belum tersedia.
-   Kasus penerimaan parsial, barang rusak, keterlambatan, penggantian,
    pembatalan, dan penggabungan pembelian telah diuji.
-   Laporan utama dan ekspor berfungsi.
-   Email, pusat tugas, pengingat, dan eskalasi telah diuji.
-   Backup harian dan salinan di lokasi berbeda berjalan, serta
    pemulihan berhasil diuji.
-   Dokumentasi deployment, pemeliharaan, backup, pemulihan, dan
    troubleshooting tersedia.
-   Pengguna perwakilan menyetujui hasil UAT.
-   Ada penanggung jawab operasional dan jalur pelaporan masalah.

## 22. Glosarium

-   **Pengajuan:** Permintaan barang yang dibuat pemohon.
-   **Pemohon:** Pegawai yang mengajukan barang.
-   **Approver:** Orang yang memiliki kewenangan menyetujui atau
    menolak.
-   **Matriks persetujuan:** Aturan yang menentukan siapa menyetujui
    transaksi berdasarkan kondisi tertentu.
-   **Purchasing:** Tim yang menjalankan proses pengadaan/pembelian.
-   **Penerimaan vendor:** Pencatatan barang yang diterima dari vendor.
-   **Serah terima:** Penyerahan barang kepada pemohon dan konfirmasi
    penerimaan.
-   **Penerimaan parsial:** Barang diterima hanya sebagian dari
    kuantitas yang dipesan.
-   **Soft delete:** Menandai data sebagai tidak aktif/dibatalkan tanpa
    menghapus catatan permanen.
-   **Audit log:** Catatan siapa melakukan apa, kapan, dan perubahan
    yang terjadi.
-   **SLA:** Target waktu penyelesaian atau respons.
-   **RPO:** Batas kehilangan data yang dapat diterima jika terjadi
    gangguan.
-   **RTO:** Target waktu untuk memulihkan layanan setelah gangguan.
-   **UAT:** User Acceptance Testing, pengujian penerimaan oleh
    pengguna/perwakilan proses.

------------------------------------------------------------------------

## Penutup

PRD ini adalah konsolidasi menyeluruh dari hasil brainstorming sampai
Sesi 27. Dokumen ini cukup sebagai dasar untuk validasi pemilik proses
dan perencanaan desain teknis, tetapi belum berarti semua aturan kantor
telah final. Semua butir TBD harus diputuskan dan disetujui sebelum
implementasi yang memengaruhi transaksi nyata.

Perubahan kebutuhan setelah validasi sebaiknya dicatat sebagai perubahan
PRD/backlog, termasuk alasan, dampak terhadap proses, dan pihak yang
menyetujui.
