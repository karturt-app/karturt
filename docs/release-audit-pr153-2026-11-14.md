# Audit rilis KartuRT PR #153

Rilis 14 November 2026. [PR #153](https://github.com/karturt-app/karturt/pull/153) digabung ke `main` setelah persetujuan eksplisit pemilik untuk merge dan deployment Production.

| Tahap | Commit |
| --- | --- |
| Baseline main | `9b713bc38410227a601c144af3a0cd9451ccbcd6` |
| Laporan sebelum perbaikan fixture | `1606d983e74439911182be11b450bc52d2c61705` |
| UAT yang dikonfirmasi pemilik | `9de67f58ad66ccc1e439bd84f6cfa93f73795c7d` |
| Fixture terpisah, PR #154 | `280f6a041b04ada7e404d407149b57a550a70475` |
| Kandidat gabungan yang disetujui | `3e0f78b23f264c6f89f63da2591e6619c4150ee9` |
| Merge Production | `59591e23378019fd0aa46fd88807e5ca70d52600` |

## Perubahan yang dirilis

- `src/lib/reports/rt-financial-report.ts` meneruskan target penagihan sebelum penyesuaian ke agregasi laporan, berdasarkan target saldo dikurangi total penyesuaian.
- `src/lib/reports/aggregation.ts` memakai target tersebut jika tersedia, dengan nominal awal sebagai fallback. Laporan dapat merekonsiliasi iuran yang dilunasi setelah koreksi target.
- `tests/unit/reports-aggregation.test.ts` mencakup regresi iuran lunas pada target yang sudah dikoreksi.
- `tests/integration/household-lifecycle-domain.test.ts` dan `tests/integration/phase12-household-history.test.ts` memakai tahun mendatang yang dihitung dinamis untuk skenario transisi yang membutuhkan iuran belum jatuh tempo.

Diff rilis mencakup lima file tersebut. Tidak ada migrasi, perubahan skema, perubahan proteksi snapshot, atau pembaruan data iuran dan transaksi sebagai bagian rilis.

## Gate A

Empat kegagalan [run #510](https://github.com/karturt-app/karturt/actions/runs/43431673213) juga terjadi pada baseline main (20 lulus, 4 gagal pada dua file terdampak). Fixture memakai tanggal bisnis Oktober 2026, sementara tanggal jatuh tempo November sudah lewat menurut waktu database. Proteksi snapshot menolak transisi iuran tersebut.

Perbaikan fixture lulus 24/24 tes lokal dan [Gate A #511](https://github.com/karturt-app/karturt/actions/runs/43539512891) di [PR #154](https://github.com/karturt-app/karturt/pull/154). Commit fixture kemudian dibawa ke branch PR #153 atas arahan pemilik. PR #154 tetap Draft sebagai dokumentasi terpisah. Dua branch tambahan sempat dibuat karena kesalahan tujuan push dan dibiarkan tanpa penghapusan.

[Gate A #512](https://github.com/karturt-app/karturt/actions/runs/43543199144/attempts/2) lulus pada percobaan kedua untuk SHA kandidat yang sama. Percobaan pertama gagal karena Chrome DevTools tidak berhasil dimulai pada satu tes browser.

## UAT dan Production

- **UAT:** Kedua file logika laporan sama dengan versi UAT. Pemilik mengonfirmasi login `r2-chairman` dan Laporan Keuangan 2026 pada [UAT Preview](https://karturt-v1-uat-preview-git-main-rt-6.vercel.app/) saat deployment `dpl_3Sqd9rJ1JYVtMA3Ph3Fn8xystXHD` aktif.
- **Production:** [Deployment Vercel](https://vercel.com/rt-6/karturt-production/GGxdKJdeCotv6k83mTD9g7VsGvxs) berstatus READY untuk SHA merge. Resolusi [domain Production](https://karturt.vercel.app/) dikonfirmasi mengarah ke deployment tersebut.
- **Batas verifikasi:** Login dan pembukaan laporan setelah login di Production belum dikonfirmasi. Akses Production dikelola klien. Bila diperlukan, pengguna klien yang berwenang dapat memeriksa dengan akun sendiri dan melaporkan hasil tanpa membagikan kredensial.
