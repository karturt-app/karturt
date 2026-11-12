# Catatan status Preview/UAT dan uji autentikasi

Tanggal pemeriksaan: 2026-11-12 (Asia/Bangkok)

## Ruang lingkup

Catatan ini merekam penyelarasan Preview/UAT dan pemeriksaan halaman masuk. Pemeriksaan tetap pada Preview. Tidak ada kode aplikasi, akun, data Neon, konfigurasi Production, atau kredensial yang diubah. Tidak ada deployment atau promosi Production yang dijalankan.

## Baseline dan status

- **Production:** `main` berada pada `9b713bc38410227a601c144af3a0cd9451ccbcd6`. Pemeriksaan Vercel pada project Production yang benar mengonfirmasi deployment Production terbaru **READY** pada SHA tersebut.
- **Sumber Preview/UAT:** branch `codex/uat-preview-node24-9b713bc`, commit `25e99a8a4b16f11e45807ac49a70c59128dc1dd1`. Pemeriksaan commit dan `package.json` mengonfirmasi perubahan hanya mematok `engines.node` menjadi `24.x`; baseline aplikasinya `9b713bc`.
- **Deployment Preview:** pemeriksaan alias dan deployment Vercel mengonfirmasi URL Preview/UAT yang diberikan menunjuk ke deployment berstatus **READY** dari branch dan commit di atas.
- **URL Preview/UAT:** https://karturt-v1-uat-preview-git-main-rt-6.vercel.app/
- **Runtime dan akun Preview:** laporan sebelumnya menyebut Neon Preview pada PostgreSQL 18 dengan 19 migrasi dan lima akun uji (dua warga, satu Ketua RT, satu Bendahara, satu System Admin); tiga akun memiliki PIN. Tidak ada data warga yang disalin. Rincian tersebut tidak diperiksa ulang di sini.
- **Kesehatan layanan:** laporan sebelumnya menyebut endpoint kesehatan dan halaman masuk merespons 200 serta TLS database terverifikasi. Endpoint kesehatan tidak diperiksa ulang dalam sesi ini.
- **Build branch catatan:** commit dokumentasi pada branch ini memicu build Preview otomatis di project Preview. Build branch ini terpisah dari target Production; tidak ada promosi atau deployment Production dari perubahan ini.

## Pemeriksaan browser pada 2026-11-12

Beranda Preview dan halaman berikut berhasil dirender di browser:

| Peran | Halaman yang diperiksa | Hasil autentikasi |
|---|---|---|
| Warga | `/login/warga` — meminta nomor rumah dan PIN | Belum dicoba; formulir tidak dikirim |
| Ketua RT | `/login/pengurus` — formulir pengurus meminta username dan PIN enam digit | Belum dicoba; formulir tidak dikirim |
| Bendahara | `/login/pengurus` — menggunakan jalur masuk pengurus yang sama | Belum dicoba; formulir tidak dikirim |
| System Admin | `/system/login` | Belum dicoba; formulir tidak dikirim |

Halaman System Admin hanya dibuka pada URL Preview. Tautan pemulihan Production yang tampil di halaman itu tidak dibuka.

## Batas uji kredensial

Tidak ditemukan sumber kredensial uji per peran yang dapat dipakai dengan aman dari lingkungan pemeriksaan. Nama variabel lokal diperiksa tanpa membaca atau menampilkan nilainya; nilai rahasia dan `DATABASE_URL` tidak digunakan atau dicatat. Alur bootstrap, rekey, reset, dan perubahan database tidak dijalankan.

Karena kredensial yang sudah ada tidak tersedia melalui jalur aman tersebut, **belum ada login yang berhasil maupun gagal**. Hasil empat peran di atas berstatus **menunggu autentikasi manual**.

## Langkah lanjutan

Pemilik akun dapat memasukkan kredensial uji yang sudah ada langsung ke halaman Preview, tanpa mengirim PIN, kata sandi, atau kode OTP di chat. Uji satu peran pada satu waktu dan keluar dari sesi sebelum berpindah akun. Setelah itu, cukup laporkan hasil peran sebagai lulus/gagal/terblokir agar catatan ini dapat diperbarui tanpa data sensitif.

Branch catatan ini terpisah dari `main` dan belum digabungkan.