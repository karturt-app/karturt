# KartuRT — Kesiapan login dan UAT sintetis (6 November 2026)

**Status: BLOCKED untuk UAT browser empat peran.** Pemeriksaan ini bukan hasil login langsung dan bukan izin melakukan perubahan Production.

## Identitas dan isolasi target

- GitHub baseline: `ff848f0cc2a4eb99eb085c22c240f37aca3ae165` (sesudah PR #144).
- Vercel UAT: proyek `karturt-v1-uat-preview`, terpisah dari `karturt-production`. Deployment branch PR #144 `dc764bf01f65ef2a55fb337cf02dff9f18b1a15d` berstatus READY. Deployment `main` terbaru pada proyek UAT tercatat CANCELED; ini **bukan** bukti bahwa Preview branch gagal.
- Neon sintetis: proyek `quiet-credit-75135059`, branch `br-weathered-base-aodwvapx`, database `karturt_preview`. Ini proyek berbeda dari Production (`holy-term-22410117`).
- Environment Vercel target Preview, APP_ENV/DATABASE_ENV dan runtime connection string tersedia. Pemeriksaan dilakukan tanpa mendekripsi atau menampilkan secret.
- SSO Vercel Preview aktif. Akun sintetis aplikasi tidak menggantikan login SSO Vercel.

## Bukti agregat baca-saja dari Neon sintetis

| Pemeriksaan | Hasil |
| --- | --- |
| RT / rumah / household aktif | 1 / 1 / 1 |
| Akun resident | 1 aktif; hash PIN dan credential ada; tidak terkunci |
| Akun Ketua RT & Bendahara | 2 aktif; credential hash ada; **keduanya belum memiliki `pin_hash`** |
| Penugasan pengurus aktif | 2 |
| Akun System Admin | 1 aktif; credential hash ada; **TOTP belum terverifikasi** |
| Tahun tagihan terbuka / tarif | 1 / 1 |
| Tagihan bulanan | 12 (semua unpaid) |
| Pengajuan pembayaran / pembayaran / reversal | 0 / 0 / 0 |
| Waiver / penyesuaian | 0 / 0 |
| Catatan migrasi Drizzle | 16 |

**Konsekuensi:** login pengurus melalui username + PIN tidak bisa berhasil tanpa PIN; akun System Admin tidak bisa mendapat principal yang dilindungi sebelum TOTP terverifikasi. Login Warga baru memenuhi prasyarat database, belum teruji lewat aplikasi. Tidak ada alasan menghapus/reseed fixture atau menyalin data Production.

## Perbaikan aman (non-Production)

1. **Ketua RT sintetis:** gunakan alur `/login/pengurus` → pemulihan PIN memakai password kuat akun sintetis yang sudah dimiliki operator. Tetapkan PIN enam digit **unik** dan simpan di password manager. Alur server yang ada memvalidasi password, menulis audit, dan mencabut sesi lama. Ulangi untuk **Bendahara sintetis** dengan PIN berbeda. Jangan mengubah akun Production dan jangan menyimpan PIN/password di GitHub atau chat.
2. **System Admin sintetis:** masuk melalui `/system/login` dengan password sintetis, lalu selesaikan aktivasi dan verifikasi TOTP melalui alur aplikasi; simpan recovery codes secara aman. Jangan menandai verified langsung lewat SQL atau mengatur faktor tanpa verifikasi nyata.
3. Setelah setup kredensial, jalankan pemeriksaan baca-saja dengan `npx tsx scripts/check-preview-synthetic-readiness.ts` dari checkout bersih dan `.env.local` **khusus Preview**. Skrip menolak target non-Preview dan tidak mencetak identifier, hash, PIN, password, TOTP, atau connection string. Hasil `READY_FOR_BROWSER_UAT` berarti prasyarat tersedia, **bukan** login telah berhasil.
4. Lakukan login browser nyata dengan tiap akun pada deployment Preview yang berasal dari **SHA PR yang diuji**, di browser/profil terpisah setelah melewati SSO Vercel. Jangan melakukan tes pada domain Production.

Skrip baca-saja mendeteksi blocker, **tidak** mengubah password, PIN, factor, sesi, data transaksi, atau database. Aktivasi kredensial tetap memerlukan password yang benar dan alur yang sah; jangan melewati mekanisme autentikasi.

## Matriks skenario UAT yang perlu dijalankan

| ID | Akun | Skenario | Hasil yang wajib |
| --- | --- | --- | --- |
| AUTH-01 | Warga | Login nomor rumah + PIN yang benar, lalu PIN salah | Hanya PIN benar masuk; PIN salah ditolak tanpa membocorkan identitas |
| AUTH-02 | Warga | Kartu iuran 12 bulan, masa depan, dan riwayat | Tagihan benar; bulan depan tidak menjadi tunggakan |
| AUTH-03 | Ketua RT | Login username + PIN, pemulihan PIN kuat, sesi lama | Login benar; setelah reset sesi lama dicabut |
| AUTH-04 | Bendahara | Login username + PIN, PIN salah/lockout | Hanya PIN benar masuk; batas kegagalan dan lockout aman |
| AUTH-05 | System Admin | Password, enrollment TOTP, challenge, backup code | Tidak memperoleh akses penuh sebelum TOTP verified; backup code sekali pakai |
| AUTH-06 | Semua | Logout, sesi habis, akses langsung endpoint terlarang | Sesi dicabut, akses gagal aman, tidak ada perubahan data |
| PAY-01 | Warga | Ajukan pembayaran bulan yang eligible, WhatsApp, batalkan | Permintaan pending/cancelled sesuai aturan; tidak otomatis lunas |
| PAY-02 | Bendahara | Verifikasi dan tolak pengajuan yang terpisah | Warga melihat hasil; nilai ledger benar; tidak duplikat |
| PAY-03 | Bendahara | Pembayaran tunai dan reversal | Alokasi aktif dan pembalikan konsisten; audit tersimpan |
| HOUSE-01 | Ketua RT | Tambah rumah baru bernomor unik | Berhasil, akun dan kewajiban awal terbentuk sesuai tarif |
| HOUSE-02 | Ketua RT | Nomor duplikat, benturan login/masa huni, tarif kurang | Pesan konflik spesifik, transaksi rollback tanpa merusak riwayat |
| HOUSE-03 | Ketua RT | Ganti warga / tutup masa huni, reset PIN | Riwayat dan tunggakan lama tetap melekat; scope RT terjaga |
| REPORT-01 | Ketua RT, Bendahara | Matriks 12 bulan, cari/filter/sort, laporan CSV | Status dan angka sesuai ledger; akses read-only sesuai peran |
| RBAC-01 | Seluruh peran | Akses silang Warga/RT, verifikasi oleh Ketua, tindakan keuangan oleh Admin | Semua tindakan yang tidak berizin ditolak server dan tanpa side effect |
| ADMIN-01 | System Admin | Health, audit, recovery terotorisasi | Tidak memiliki wewenang verifikasi pembayaran; recovery terkontrol |
| ADMIN-02 | Dua System Admin | Pemulihan TOTP oleh admin lain | **BLOCKED oleh fixture saat ini:** hanya satu System Admin. Gunakan fixture disposable tambahan jika skenario ini wajib, jangan ubah akun Production |

### Bukti dan batasan

- Saat audit 6 November: **belum ada bukti eksekusi login browser** keempat peran pada target sintetis terkini.
- Fixture hanya memuat **1 rumah / 12 bulan unpaid**, sehingga status paid, pending, reversed, waiver, dan adjustment **belum ada sebagai data awal**. Skenario PAY/HOUSE perlu dijalankan berurutan pada fixture terisolasi/disposable dengan hasil dan rollback yang terencana; jangan menyatakan PASS hanya karena tes unit/integrasi sudah tersedia.
- Gate A menguji unit, integrasi, constraints, authorization, security closure, migration journal, dan build menggunakan database pengujian terisolasi; Gate A bukan pengganti UAT browser.
- Tes PostgreSQL concurrency independen dan PG18 recovery dalam gate terakhir dilaporkan **SKIPPED**, bukan PASS.
- Jangan melakukan perubahan schema, reseed, reset, atau pembersihan fixture kanonis tanpa persetujuan target dan operasi yang eksplisit. Hindari duplikasi pengajuan pembayaran sintetis ketika mengulang UAT.
- Catat hasil tiap skenario sebagai `PASS`, `FAIL`, `BLOCKED`, atau `NOT RUN`, dengan SHA, deployment ID, waktu, role alias, dan bukti tanpa PII atau rahasia.

**Batas rilis:** Perubahan dokumentasi/skrip readiness ini tidak memerlukan rilis Production. Perbaikan akun dan pengujian nyata dilakukan **hanya di Preview**, lalu PR dinilai terpisah sebelum merge.
