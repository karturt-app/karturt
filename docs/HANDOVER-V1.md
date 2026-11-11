# KartuRT V1 — Dokumen Serah Terima

- **Tanggal acuan:** 4 November 2026
- **Status serah terima:** checklist penerimaan klien belum diverifikasi.
- **Untuk:** pengelola RT dan klien nonteknis.

Dokumen ini merangkum fungsi KartuRT V1, cara masuk, alur pembayaran, tanggung jawab tiap peran, dan batas layanan. Dokumen ini tidak memuat PIN, kata sandi, kode autentikator, data warga, ataupun rincian teknis pemulihan.

## Ringkasan produk

KartuRT membantu satu RT mencatat kewajiban iuran, mengajukan dan memeriksa pembayaran, melihat riwayat/kuitansi, serta menyiapkan laporan. Pengguna masuk sesuai peran: Warga, Bendahara, Ketua RT, atau System Admin.

**Alamat Production:** [https://karturt.vercel.app](https://karturt.vercel.app)

**Mode V1:** operasional untuk satu RT. Fondasi isolasi data antar-RT tetap ada, tetapi pemilih RT, onboarding multi-RT, dan pengelolaan beberapa RT belum tersedia bagi pengguna.

### Referensi rilis dan keadaan saat diperiksa

- Rilis GitHub yang terverifikasi: **v1.0.0**, diterbitkan 4 November 2026.
- Commit rilis: **392ef9db5e717d2d862ef2862d05f0ab0f7283b0**.
- Vercel melaporkan proyek **karturt-production** pada target Production berstatus **READY**, dengan alamat **karturt.vercel.app** mengarah ke commit tersebut.
- PR **#139** (instruksi transfer BANK JATIM), **#140** (tombol salin nomor rekening), dan **#141** (pembaruan sapaan pesan WhatsApp pembayaran) tercatat merged.
- GitHub Actions Test Gate A pada commit rilis melaporkan **success**. Hasil build/CI dan status Production bukan bukti persetujuan serah terima klien. Dokumen ini tidak menyatakan UAT akun nyata, pengujian perangkat fisik, atau penerimaan formal klien telah dilakukan.

## Peran dan kewenangan

Semua izin pengurus dibatasi pada RT tempat mereka sedang menjabat. System Admin menjalankan fungsi operasional sistem dan tidak menggantikan pengurus dalam mengelola transaksi keuangan.

| Peran | Yang dapat dilakukan | Batas penting |
| --- | --- | --- |
| **Warga** | Melihat kewajiban iuran rumah tangganya sendiri, mengajukan konfirmasi pembayaran, membatalkan pengajuan yang masih menunggu, melihat status/riwayat, dan membuka kuitansi untuk pembayaran yang telah diverifikasi. | Tidak dapat melihat rumah tangga lain atau menyatakan pembayaran lunas sendiri. |
| **Bendahara** | Melihat antrean pembayaran dan informasi yang diperlukan untuk RT-nya; memeriksa lalu menerima atau menolak pengajuan transfer; mencatat pembayaran tunai; membalikkan catatan transaksi melalui alur koreksi yang tercatat; membaca laporan RT. | Tidak mengelola tarif, data rumah tangga, penugasan pengurus, atau audit. |
| **Ketua RT** | Mengelola data rumah dan warga dalam RT, kewajiban/tarif dan penyesuaiannya, pemutihan, penugasan masa jabatan pengurus, laporan, serta ringkasan aktivitas RT. | Tidak memverifikasi, menolak, mencatat, atau membalikkan pembayaran. |
| **System Admin** | Memantau kesehatan sistem, mencari akun untuk pemulihan yang diizinkan, dan membaca ringkasan aktivitas sistem sesuai kewenangannya. | Tidak mengelola iuran atau melakukan verifikasi pembayaran. Pemulihan akses mengikuti pengamanan yang berlaku dan dicatat. |

## Cara masuk

Akun disediakan oleh pengelola yang berwenang; aplikasi tidak menyediakan pendaftaran publik.

- **Warga:** masukkan nomor rumah dan PIN enam digit yang diberikan pengurus RT.
- **Ketua RT dan Bendahara:** masukkan username dan PIN enam digit khusus akun pengurus. Jika lupa PIN, pengurus dapat memakai username dan kata sandi pemulihan akun pengurus pada alur pemulihan yang tersedia.
- **System Admin:** masuk dengan kata sandi akun dan kode autentikator dua langkah (2FA/TOTP) yang sudah terverifikasi.

PIN dan kata sandi dibagikan langsung kepada pemilik akun melalui saluran yang disepakati, bukan di dokumen handover atau grup WhatsApp. Jangan meminta atau mengirim kode autentikator maupun kode cadangan melalui chat.

## Panduan pembayaran transfer

KartuRT tidak memindahkan uang dan tidak tersambung otomatis ke rekening bank. Transfer dilakukan sendiri oleh Warga melalui layanan bank, lalu Bendahara memeriksa penerimaannya.

1. Masuk sebagai Warga dan pilih bulan iuran yang akan diajukan.
2. Tekan **Periksa jumlah**. Aplikasi menampilkan nominal serta instruksi rekening sebelum pengajuan. Tombol **Salin** menyalin nomor rekening.
3. Lakukan transfer secara mandiri sesuai nominal yang tampil. Rincian rekening yang saat ini tercantum di alur aplikasi adalah:

   **BANK JATIM**<br />
   **Nomor rekening: 0122754561**<br />
   **a.n. SRI WINARSIH**

4. Kembali ke KartuRT, periksa rincian, lalu tekan **Konfirmasi dan ajukan**. Jika perlu, gunakan **Buka WhatsApp Bendahara** untuk mengirim pesan pengajuan; periksa isi pesan sebelum mengirim.
5. Setelah diajukan, statusnya **Menunggu konfirmasi Bendahara**. Pengajuan tersebut belum berarti pembayaran lunas.
6. Bendahara mencocokkan dana yang diterima lalu menerima atau menolak pengajuan di aplikasi. Status baru menjadi terverifikasi setelah Bendahara menyelesaikan pemeriksaan.
7. Warga dapat melihat perubahan status pada akun dan riwayat. Untuk pembayaran yang sudah diverifikasi, rincian kuitansi dapat dibuka dari riwayat iuran.

Periksa kembali nama bank dan penerima yang ditampilkan sebelum transfer. Bila status belum berubah, hubungi Bendahara melalui tautan WhatsApp di aplikasi. KartuRT tidak mengonfirmasi transfer secara otomatis.

## Riwayat, pemberitahuan, dan laporan

Warga dapat memeriksa status pembayaran dan riwayat iuran; Bendahara melihat antrean pengajuan yang menunggu. Tampilan status dalam aplikasi diperbarui saat aplikasi terhubung ke internet. WhatsApp dibuka melalui tindakan pengguna; KartuRT tidak menjamin pesan terkirim atau dibaca.

Ketua RT dan Bendahara dapat membuka laporan iuran bulanan/tahunan, mencetak atau menyimpan laporan bulanan sebagai PDF, serta mengunduh CSV bulanan dan tahunan. Laporan menunjukkan posisi data saat dibaca dan bukan buku kas pengeluaran. File CSV dapat memuat nama warga dan informasi keuangan, sehingga hanya boleh disimpan atau dibagikan kepada pihak yang berwenang.

## Aktivitas dan pemulihan akses

Halaman riwayat aktivitas tersedia bagi Ketua RT untuk aktivitas RT-nya dan bagi System Admin sesuai cakupan sistem. Warga dan Bendahara tidak memiliki akses ke halaman audit tersebut. Ringkasan aktivitas membantu peninjauan, tetapi bukan pengganti pemeriksaan operasional khusus.

System Admin memiliki alat pemulihan akun yang terbatas; sebagian perubahan akses dapat mencabut sesi sehingga pengguna perlu masuk kembali. Pemulihan 2FA System Admin mengikuti prosedur terlindungi dan memerlukan verifikasi ulang sebelum akses admin digunakan kembali. Rincian langkah teknis dan kredensial pemulihan tidak dicantumkan di sini.

Bukti latihan backup/restore yang tercatat di repositori menggunakan **lingkungan staging**, bukan Production. Kemampuan pemulihan database Production **belum diverifikasi dalam serah terima ini** dan perlu dikonfirmasi terpisah dengan operator layanan.

## Batas V1 dan kemungkinan V2

KartuRT V1 harus dipakai dengan koneksi internet. Aplikasi tidak menyediakan mode offline untuk data keuangan, antrean transaksi offline, pengiriman ulang otomatis saat koneksi kembali, ataupun push notification. Instalasi sebagai PWA hanya memudahkan akses aplikasi; jangan mengandalkannya sebagai bukti bahwa transaksi tersimpan tanpa koneksi.

Dokumen rilis dan scope yang ditinjau belum menetapkan daftar fitur, jadwal, atau biaya V2 yang disetujui. Operasional multi-RT, push notification, dan penggunaan offline berada di luar V1; bila dibutuhkan, ruang lingkup dan kriteria penerimaannya perlu disepakati terpisah sebelum dijanjikan.

## Operasional dan dukungan

- **Alamat pengguna:** [https://karturt.vercel.app](https://karturt.vercel.app)
- **Pemeriksaan status rilis saat acuan dibuat:** Vercel Production READY pada commit rilis yang dicantumkan di atas.
- **Tanggung jawab operasional:** Ketua RT mengelola data RT dan pengurus; Bendahara memeriksa transaksi; System Admin menangani fungsi sistem serta pemulihan akses sesuai kewenangan.
- **Kontak dukungan dan jam layanan:** belum ditetapkan dalam sumber yang ditinjau; cantumkan atau sampaikan terpisah pada saat serah terima.
- Jika meminta bantuan, sampaikan waktu kejadian dan uraian masalah. Jangan mengirim PIN, kata sandi, kode autentikator, atau data warga melalui chat.

## Checklist serah terima klien

Seluruh butir berikut **belum diverifikasi pada saat dokumen ini dibuat**. Centang hanya setelah dilakukan dan disepakati bersama klien.

- [ ] **Belum diverifikasi** — Klien membuka alamat Production dan memastikan halaman masuk dapat dijangkau dari perangkat/jaringan yang akan dipakai.
- [ ] **Belum diverifikasi** — Pengelola mengonfirmasi unit RT operasional dan data rumah/warga yang akan dipakai.
- [ ] **Belum diverifikasi** — Akun untuk masing-masing peran disediakan dan pemilik akun mengonfirmasi dapat masuk; kredensial diserahkan terpisah.
- [ ] **Belum diverifikasi** — Klien menyetujui rincian rekening yang tampil di aplikasi.
- [ ] **Belum diverifikasi** — Klien memahami alur pengajuan, status menunggu Bendahara, verifikasi, dan tampilan kuitansi.
- [ ] **Belum diverifikasi** — Ketua RT dan Bendahara memahami akses laporan serta cara menjaga kerahasiaan file CSV.
- [ ] **Belum diverifikasi** — Kontak dukungan, penanggung jawab operasional, dan jalur eskalasi disepakati.
- [ ] **Belum diverifikasi** — Penerimaan formal V1, tanggal, penanggung jawab, dan kebutuhan V2 dicatat oleh klien.

Status Production READY dan hasil CI yang disebut di atas hanya menggambarkan status teknis yang tercatat. Keduanya tidak menandai butir checklist ini sebagai selesai.

## Rujukan

- [README teknis dan setup](../README.md)
- [Pembekuan scope Single-RT](mvp-single-rt-scope-freeze.md)
- [Penyelesaian backlog V1 dan batas bukti](v1-backlog-completion.md)
- [Laporan bulanan dan ekspor CSV](treasurer-monthly-report.md)
- [Pemberitahuan status pembayaran dalam aplikasi](v1-payment-notifications.md)
- [Operasi online-only](v1-online-only-acceptance.md)
- [Alat pemulihan akun V1](v1-admin-recovery-tools.md)
- [Latihan backup/restore staging](backup-restore-drill.md)
- [Rilis GitHub v1.0.0](https://github.com/karturt-app/karturt/releases/tag/v1.0.0)
- [PR #139](https://github.com/karturt-app/karturt/pull/139), [PR #140](https://github.com/karturt-app/karturt/pull/140), [PR #141](https://github.com/karturt-app/karturt/pull/141)

## Contoh pesan pengenalan untuk warga

Assalamu’alaikum Bapak/Ibu warga,

KartuRT V1 dapat digunakan untuk:
- melihat jumlah dan status iuran rumah sendiri;
- mengajukan konfirmasi pembayaran;
- memantau pengajuan yang masih menunggu atau sudah diperiksa Bendahara;
- menghubungi Bendahara melalui WhatsApp dari halaman pengajuan;
- melihat riwayat iuran dan kuitansi untuk pembayaran yang telah diverifikasi;
- membatalkan pengajuan yang masih menunggu.

Untuk pembayaran transfer, rekening tujuan yang tercantum di aplikasi adalah:

**BANK JATIM**<br />
**0122754561**<br />
**a.n. SRI WINARSIH**

Silakan cek nominal di aplikasi, lakukan transfer, lalu kembali ke KartuRT untuk mengajukan konfirmasi. Status pengajuan akan **Menunggu konfirmasi Bendahara** sampai Bendahara memeriksa dan memverifikasi pembayaran. Pengajuan saja belum berarti lunas.

Buka KartuRT di [https://karturt.vercel.app](https://karturt.vercel.app). Terima kasih.
