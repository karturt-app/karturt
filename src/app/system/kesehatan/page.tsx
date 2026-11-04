import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Activity, ArrowLeft, Database, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { SiteFooter } from "@/components/site-footer";
import { canPerform } from "@/lib/auth/permissions";
import {
  getCurrentPrincipal,
  MfaEnrollmentRequiredError,
  UnauthenticatedError,
} from "@/lib/auth/principal";
import { checkSystemHealth, type SafeIncidentCategory } from "@/lib/system-health";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Kesehatan sistem",
  alternates: { canonical: "/system/kesehatan" },
  robots: { index: false, follow: false },
};

const incidentLabels: Record<SafeIncidentCategory, string> = {
  none: "Tidak ada gangguan terdeteksi",
  connection: "Gangguan koneksi database",
  capacity: "Batas koneksi database",
  timeout: "Waktu respons database terlampaui",
  configuration: "Gangguan konfigurasi akses database",
  security: "Gangguan keamanan koneksi database",
  unknown: "Gangguan belum terklasifikasi",
};

export default async function SystemHealthPage() {
  let principal;
  try {
    principal = await getCurrentPrincipal();
  } catch (error) {
    if (error instanceof MfaEnrollmentRequiredError) redirect("/system/2fa/setup");
    if (error instanceof UnauthenticatedError) redirect("/system/login");
    throw error;
  }
  if (principal.role !== "system_admin" || !canPerform(principal, "system:health:read")) notFound();

  const health = await checkSystemHealth();
  const databaseHealthy = health.database === "connected";
  const checkedAt = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "medium",
  }).format(new Date(health.checkedAt));

  return (
    <main className="page-shell system-health-page">
      <header className="topbar">
        <Brand compact />
        <SignOutButton />
      </header>
      <nav className="breadcrumb" aria-label="Jejak halaman">
        <Link href="/app"><ArrowLeft size={16} aria-hidden="true" />Kembali ke ruang akun</Link>
        <span aria-hidden="true">/</span>
        <span>Kesehatan sistem</span>
      </nav>
      <section className="app-card system-health-area" aria-labelledby="system-health-title">
        <p className="eyebrow"><ShieldCheck size={16} aria-hidden="true" /> KHUSUS SYSTEM ADMIN</p>
        <h1 id="system-health-title">Kesehatan sistem</h1>
        <p>Pemeriksaan ringan dan baca-saja. Tidak mengubah data, akun, atau transaksi.</p>

        <div className="system-health-grid">
          <section className="system-health-item" aria-labelledby="system-health-app-title">
            <Activity size={22} aria-hidden="true" />
            <h2 id="system-health-app-title">Layanan aplikasi</h2>
            <strong className="system-health-state is-healthy">Merespons</strong>
            <p>Halaman pemeriksaan dapat diproses oleh server.</p>
          </section>
          <section className="system-health-item" aria-labelledby="system-health-db-title">
            <Database size={22} aria-hidden="true" />
            <h2 id="system-health-db-title">Koneksi database</h2>
            <strong className={databaseHealthy ? "system-health-state is-healthy" : "system-health-state is-unavailable"}>
              {databaseHealthy ? "Terhubung" : "Terganggu"}
            </strong>
            <p>{databaseHealthy
              ? "Pemeriksaan koneksi baca-saja berhasil."
              : "Pemeriksaan koneksi belum berhasil. Jangan ulangi transaksi sampai layanan pulih."}</p>
          </section>
        </div>

        <dl className="system-health-facts">
          <div><dt>Waktu pemeriksaan</dt><dd><time dateTime={health.checkedAt}>{checkedAt} WIB</time></dd></div>
          <div><dt>Kategori gangguan</dt><dd>{incidentLabels[health.category]}</dd></div>
        </dl>

        <form className="system-health-actions" action="/system/kesehatan" method="get">
          <button className="button button--secondary" type="submit">Periksa ulang</button>
        </form>
        <p className="system-health-note">
          Status ini hanya menggambarkan respons halaman dan satu pemeriksaan koneksi database pada waktu di atas;
          bukan jaminan semua fungsi berjalan. Bila autentikasi atau database gagal sebelum sesi Admin dapat
          diverifikasi, halaman ini tidak dapat menampilkan diagnostik dan akses tetap ditutup.
          Untuk gangguan lebih lanjut, gunakan log penyedia infrastruktur.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
