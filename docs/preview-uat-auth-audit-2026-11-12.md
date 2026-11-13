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

## Update pemeriksaan 2026-11-13: persiapan rekey khusus

- **Persetujuan dan cakupan:** pemilik meminta rekey khusus untuk melanjutkan uji akun sintetis Preview. Helper yang disiapkan membatasi perubahan pada empat akun sintetis kanonis di Preview.
- **SHA dan deployment Preview:** branch `codex/uat-preview-node24-9b713bc` tetap pada `25e99a8a4b16f11e45807ac49a70c59128dc1dd1`. Checkout terpisah terverifikasi bersih pada SHA tersebut. Deployment Preview berstatus **READY** pada SHA yang sama; status Vercel untuk commit berhasil. Tidak ada GitHub Actions check-run terpisah yang terpasang pada commit.
- **Target database yang dipatok source:** project Preview `quiet-credit-75135059`, branch `br-weathered-base-aodwvapx`, endpoint `ep-tiny-base-aocoa7m9`, database `karturt_preview`. Branch Neon terverifikasi **ready**.
- **Dampak helper yang ditinjau:** hanya mengubah password hash Better Auth untuk empat akun kanonis, mencabut sesi aktifnya, dan mencatat audit tanpa nilai kredensial. Helper tidak mengubah PIN resmi pada `app_accounts.pin_hash`, peran, penghitung lockout, data bisnis, maupun TOTP System Admin. Formulir pemulihan PIN pengurus memerlukan password kuat akun dan PIN baru enam digit.
- **Status tindakan:** rekey **belum dijalankan**; tidak ada kredensial atau sesi akun yang diubah dan belum ada login yang dicoba. Konektor Vercel mengembalikan metadata saja untuk `DATABASE_URL` dan `BETTER_AUTH_SECRET` yang ditandai sensitif. CLI Vercel dan sesi autentikasi lokal tidak tersedia; percobaan menjalankan CLI tidak selesai dan tidak menghasilkan file environment. Tanpa nilai Preview runtime lokal yang diambil aman, helper tidak dijalankan.
- **Production:** pemeriksaan baca-saja terbaru mengonfirmasi deployment Production **READY** pada `main` / `9b713bc38410227a601c144af3a0cd9451ccbcd6`. Tidak ada konfigurasi, data, deployment, atau promosi Production yang diubah.
- **Langkah untuk melanjutkan:** autentikasi Vercel CLI secara lokal pada checkout terpisah ini, lalu tarik hanya environment Preview ke file lokal terabaikan dengan `vercel env pull .env.local --environment=preview`. Nilai file tidak perlu dikirim ke chat. Setelah itu helper dapat dijalankan ulang pada SHA dan target yang sama; proses ini tetap tidak mengubah Production. Pemilik dapat memasukkan kode TOTP System Admin langsung di browser bila uji peran itu dilanjutkan; TOTP tidak di-reset oleh helper.


## Update pemeriksaan 2026-11-13: status kredensial dan insiden CLI

Update ini menggantikan status operasional sebelumnya yang menyebut CLI belum terautentikasi. Pemilik menyatakan Vercel CLI sudah login. Tidak ada nilai kredensial, PIN, OTP, token, hash, atau URL koneksi database yang dicatat di GitHub.

- **Pemeriksaan autentikasi yang telah berlangsung:** catatan baca-saja menemukan empat event audit lama `preview.synthetic_credential.rekeyed` untuk peran warga, Ketua RT, Bendahara, dan System Admin pada 2026-11-06 14:42:55 UTC. Rekey helper adalah one-shot dan guard jumlah fixture mendeteksi event lama itu, sehingga percobaan ulang berhenti sebelum transaksi. Tidak ada rekey baru, PIN baru, pencabutan sesi, atau perubahan akun pada pemeriksaan 2026-11-13 ini.
- **Handoff lokal:** file `UAT-LOGIN-CREDENTIALS.local.txt` berada di checkout lokal terpisah dan dikecualikan dari Git. Nilainya tidak ditampilkan atau dimasukkan ke catatan ini. Berkas ini hanya untuk penggunaan lokal pemilik.
- **Hasil login:** belum ada permintaan login warga, pengurus, atau System Admin yang dikirim. Akses browser menolak pembacaan berkas lokal `file://`; pemeriksaan dihentikan sebelum kredensial dimasukkan. Tidak ada PIN, kata sandi, TOTP, cookie, atau sesi yang terungkap atau dibuat.
- **Kebutuhan akun pengurus:** helper rekey mengganti password Better Auth, tetapi tidak mengatur PIN pengurus. Untuk melanjutkan, pemilik dapat memakai formulir **“Lupa atau belum punya PIN?”** di halaman Preview `/login/pengurus`, memilih PIN enam digit sendiri, lalu menguji login Ketua RT dan Bendahara. Alur resmi akan mencatat pemulihan PIN dan mencabut sesi akun yang ada.
- **Kebutuhan System Admin:** password saja belum menyelesaikan login bila tantangan TOTP aktif. Pemilik perlu memasukkan TOTP langsung di halaman Preview `/system/login`; tidak ada reset TOTP yang dilakukan.
- **Pemeriksaan Preview dan perubahan perlindungan:** GET `/api/health` melalui Vercel CLI mengembalikan `status=ok` dan `databaseTlsVerified=true`. CLI otomatis menambahkan satu secret Protection Bypass for Automation pada project Preview. Dashboard mengonfirmasi secret itu baru dibuat pada sesi ini dan kemudian menampilkan sukses setelah secret tersebut dicabut. Shareable link Preview yang lebih lama tidak diubah. Tidak ada login API yang dikirim melalui CLI.
- **Project Vercel tambahan yang tidak disengaja:** pemanggilan `vercel env run` justru membuat project terpisah `check-token` di tim `rt-6`, dengan deployment `dpl_9ERmWxKizkM8f1KazanLGyC53zKt` berstatus READY dan target Vercel `production`. Ini bukan project atau deployment KartuRT; tidak mengandung perubahan kode KartuRT atau data Neon. Project dan deployment tersebut belum dihapus. Vercel menyediakan tautan penghapusan yang mengharuskan pemilik meninjau dan mengonfirmasi di dashboard.
- **Kondisi KartuRT:** Preview/UAT tetap pada URL dan SHA `25e99a8a4b16f11e45807ac49a70c59128dc1dd1`; Production KartuRT tetap READY pada `main` / `9b713bc38410227a601c144af3a0cd9451ccbcd6`. Tidak ada kode KartuRT, akun/Neon, deployment KartuRT, atau konfigurasi project Production KartuRT yang diubah.
- **Langkah manual:** pemilik dapat login warga memakai berkas lokal, menyiapkan PIN baru untuk dua akun pengurus melalui form Preview, dan menyelesaikan TOTP System Admin sendiri. Setelah setiap uji, cukup laporkan peran dan hasil lulus/gagal/terblokir agar audit diperbarui tanpa nilai sensitif. Project `check-token` dapat dihapus dari tautan Vercel yang diberikan di chat setelah pemilik meninjau dampaknya.


## Addendum pemeriksaan 2026-11-13: status deployment dan file lokal

- **UAT terkini:** pemeriksaan Vercel baca-saja mengonfirmasi deployment `dpl_99zAUWmrcEWfY5SEhPVQZgbrNvkZ` **READY** pada SHA `25e99a8a4b16f11e45807ac49a70c59128dc1dd1`; alias kanonis Preview/UAT tetap menunjuk ke deployment tersebut.
- **Production KartuRT:** pemeriksaan Vercel baca-saja mengonfirmasi deployment Production terbaru **READY** pada `main` / `9b713bc38410227a601c144af3a0cd9451ccbcd6`.
- **Environment lokal:** `vercel env pull` membuat file lokal `.uat-smoke/preview.env` dengan 28 entri; CLI melaporkan satu nilai sensitif tidak dapat ditarik. File ini, log CLI, dan skrip pemeriksaan tetap lokal dan dikecualikan dari Git. Tidak ada nilai file yang ditampilkan atau dicatat di GitHub.
- **Pembersihan lokal:** folder `.uat-smoke` masih berada di checkout lokal. Upaya menghapus hanya file-file scratch tersebut ditolak oleh pemeriksaan keamanan lokal; isinya belum dihapus. Pemilik dapat menghapus folder ini sendiri setelah meninjaunya.
- **Perlindungan Preview:** dashboard menampilkan keberhasilan pencabutan secret bypass yang baru dibuat oleh CLI; entri bypass baru itu sudah tidak ada. Shareable link yang lebih lama tetap tidak berubah.
