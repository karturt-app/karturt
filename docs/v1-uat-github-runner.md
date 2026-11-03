# GitHub Actions runner migrasi KartuRT V1 UAT — 3 November 2026

**Status: usulan workflow, BELUM DI-MERGE dan BELUM DIJALANKAN.**
Hanya untuk UAT Single-RT sintetis; tidak mengubah Production, tidak membuka akses V2.
Pemilik menyetujui pembuatan workflow sebagai alternatif instalasi CLI manual.

## Target tetap dan bukti keamanan

- Kode aplikasi: PR ini berasal dari baseline `main` `ff9b992bd3154d2cfb65dd14bcb0f1de452b29f1`. Setelah workflow di-review/merge, selalu gunakan **SHA baru yang sedang berada pada `main`** sebagai `candidate_sha`. Jangan memakai SHA baseline lama untuk dispatch yang baru: workflow menolak SHA yang tidak sama persis dengan event pada main.
- Neon UAT project `quiet-credit-75135059`, branch `br-weathered-base-aodwvapx`, endpoint `ep-tiny-base-aocoa7m9`, DB `karturt_preview` (PG18 Free).
- Neon Production reference hanya sebagai guard pemisahan: project `holy-term-22410117`, branch `br-jolly-bonus-azzd71cl`, endpoint `ep-empty-rain-azwe3eb3`, DB `karturt_production`. **Jangan pernah hubungkan rahasia Production ke environment UAT.**
- Role login terpisah, tanpa membership/superuser/admin: `karturt_preview_runtime_f4` (DML runtime setelah migrasi) dan `karturt_preview_migrator_f4` (DDL untuk migrasi resmi saja).
- Workflow hanya dipicu `workflow_dispatch` pada `main`, `permissions: contents: read, actions: read`, checkout exact-SHA, `npm ci --ignore-scripts`, pinned checkout/setup-node, static concurrency dan tidak auto-deploy/auto-merge.
- Read-only preflight memverifikasi koneksi kedua role, identitas TLS Node socket plus SSL PostgreSQL, hostname, database kosong, role flags dan privilege, larangan TEMP/CREATE untuk runtime, dan journal resmi 16 migrasi. Jalur apply memakai aplikasi sendiri `npm run db:migrate:preview` dengan guard internalnya.
- `migrate` memerlukan satu run `preflight` terpisah yang SUCCESS pada SHA sama, ID run sah, dan input konfirmasi tepat `APPLY_16_UAT_MIGRATIONS`. Preflight diulang read-only pada run migrasi sebelum app CLI apply. **Jangan jalankan migrate dua kali**.

## Penyiapan GitHub Environment (oleh pemilik melalui UI, tanpa membagikan secrets)

**Saat ini workflow ada di draft PR, BELUM dapat dipakai dari Actions sampai digabung ke default branch.** Sebelum menggabungkannya, evaluasi dampak pada auto-deploy Production karena repository terhubung ke proyek Production Vercel. Merge memerlukan persetujuan tersendiri.

1. Buka [Settings → Environments](https://github.com/karturt-app/karturt/settings/environments) pada repository `karturt-app/karturt`.
2. Buat environment persis bernama `karturt-v1-uat`. Tetapkan **Deployment branches and tags** hanya untuk `main`. Jika opsi tersedia dan ada reviewer lain, aktifkan **Required reviewers** agar apply dapat disetujui manual. Jangan melemahkan proteksi branch utama.
3. Dalam environment ini (BUKAN Repository Secrets, dan bukan Production), buat dua **Environment Secrets**:
   - `KARTURT_UAT_PREVIEW_DATABASE_URL`: URL langsung (non-pooler) PG18 dengan user `karturt_preview_runtime_f4` dan password runtime privat.
   - `KARTURT_UAT_PREVIEW_DATABASE_MIGRATION_URL`: URL langsung dengan user `karturt_preview_migrator_f4` dan password migrator privat.
4. Kedua URL HARUS ke host `ep-tiny-base-aocoa7m9.c-2.ap-southeast-1.aws.neon.tech`, database `karturt_preview`, query `?sslmode=verify-full`. Periksa bahwa password dengan karakter khusus sudah di-URL-encode. Jangan menyalin URL role `karturt_preview_owner`, role Neon bawaan, atau Production. **Jangan** memasukkan URL migrator ke Vercel.
5. Jangan pernah memasukkan connection string/password ke issue, PR, CI log, komentar chat, atau file repository. `BETTER_AUTH_SECRET` di Vercel Preview tidak dibutuhkan runner migrasi; jangan pindahkan ke GitHub.

URL contoh (placeholder, **bukan** password nyata):

```text
postgresql://karturt_preview_runtime_f4:ENCODED_RUNTIME_PASSWORD@ep-tiny-base-aocoa7m9.c-2.ap-southeast-1.aws.neon.tech:5432/karturt_preview?sslmode=verify-full
postgresql://karturt_preview_migrator_f4:ENCODED_MIGRATOR_PASSWORD@ep-tiny-base-aocoa7m9.c-2.ap-southeast-1.aws.neon.tech:5432/karturt_preview?sslmode=verify-full
```

## Urutan operasi setelah workflow masuk main dan environment aman

**A. Preflight (tidak menulis database):**

1. Buka Actions → `KartuRT V1 UAT Preview migration` → `Run workflow`.
2. Branch: `main`. `operation`: `preflight`. `candidate_sha`: **full SHA main terbaru** saat itu.
3. Kosongkan `preflight_run_id` dan `migration_go`. Klik Run workflow.
4. Pastikan run **SUCCESS** dan dua event `uat-preview.role-preflight.pass`, serta `uat-preview.migration-preflight.pass`. Simpan ID run dari URL, cek dengan pembaca GitHub Actions. Jika gagal, **STOP**; tidak ada migrasi yang berjalan.

**B. Apply (mengubah hanya database UAT, terpisah dari preflight):**

1. Pastikan owner menerima hasil Preflight yang tepat.
2. Buka workflow yang sama → `Run workflow`, branch `main`.
3. `operation`: `migrate`; `candidate_sha`: SHA sama dengan preflight dan main; `preflight_run_id`: ID run PASS dari langkah A; `migration_go`: `APPLY_16_UAT_MIGRATIONS`.
4. Setelah diizinkan environment GitHub, workflow mengulangi plan dan read-only TLS preflight lalu menerapkan migrasi **0000–0015** melalui `npm run db:migrate:preview`. Jika target, role, TLS, journal, atau preflight berubah, workflow seharusnya berhenti.
5. Verifikasi di Neon (read-only) bahwa `drizzle.__drizzle_migrations` berisi **16 entri** dengan hash/journal resmi, aplikasi memiliki tabel sesuai schema, dan data user/pembayaran sintetis belum dibuat. Jangan menganggap migrasi lulus hanya karena job berhasil tanpa memeriksa hasil.

## Risiko dan batas tindakan

- **Merge PR ini dapat memicu pipeline/deployment Production** dari integrasi GitHub–Vercel walaupun perubahan hanya workflow, script preflight, dan dokumen. Karena itu PR dibiarkan **Draft; jangan merge** sebelum review dan izin owner terhadap efek otomatis ini.
- Runner tidak otomatis membuat akun, menjalankan UAT browser, menyalin data riil, mengubah Neon Production atau Vercel Production.
- Deployment Preview baru memerlukan konfigurasi `NEXT_PUBLIC_APP_URL` (HTTPS origin yang tepat), fixture sintetis dan tindakan terpisah.
- Jika GitHub Environment Secrets tidak tersedia atau salah target, jangan menurunkan pemeriksaan atau memakai role owner sebagai jalan pintas.
- Preflight baru memverifikasi kondisi **database kosong**; bila migrasi sudah diterapkan, preflight berikutnya memang akan gagal. Workflow ini bukan alat deploy umum ataupun upgrade otomatis.
- PR #132 (keamanan) dan PR #133 (bukti PostgreSQL) tetap tidak digabung.

## Checklist review sebelum menyetujui merge

- [ ] Pastikan branch PR hanya mengubah `.github/workflows/v1-uat-preview-migrate.yml`, `scripts/v1-uat-preview-migration-preflight.ts`, dan dokumen ini.
- [ ] Gate A workflow CI lulus pada head PR.
- [ ] Reviewer memeriksa bahwa tidak ada rahasia, artefak yang berisi credential, hak admin role, maupun jalur Production.
- [ ] Pastikan kesesuaian trigger `workflow_dispatch` dan GitHub Environment reviewer/branch restriction di tim.
- [ ] Owner menyetujui merge serta dampak otomatis Vercel/GitHub (jika ada), secara terpisah dari persetujuan persiapan workflow.
