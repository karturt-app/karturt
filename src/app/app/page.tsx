import { ResidentCard } from "@/components/resident-card";
import { PaymentNotifications } from "@/components/payment-notifications";
import { getResidentProfile } from "@/lib/billing/resident-profile";
import { jakartaBusinessDate } from "@/lib/officials/lifecycle";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SiteFooter } from "@/components/site-footer";
import { SignOutButton } from "@/components/sign-out-button";
import { TreasurerDashboard } from "@/components/treasurer-dashboard";
import Link from "next/link";
import { getDb } from "@/db/client";
import {
  getCurrentPrincipal,
  UnauthenticatedError,
  MfaEnrollmentRequiredError,
} from "@/lib/auth/principal";
import { getTreasurerPaymentRequestQueue } from "@/lib/billing/treasurer-payment-requests";

export const metadata: Metadata = {
  title: "Ruang akun",
  alternates: { canonical: "/app" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const roleNames = {
  resident: "Warga",
  treasurer: "Bendahara",
  rt_chairman: "Ketua RT",
  system_admin: "System Admin",
} as const;

export default async function AccountHomePage() {
  let principal;
  try {
    principal = await getCurrentPrincipal();
  } catch (error) {
    if (error instanceof MfaEnrollmentRequiredError)
      redirect("/system/2fa/setup");
    if (error instanceof UnauthenticatedError) redirect("/login/warga");
    throw error;
  }
  const profile =
    principal.role === "resident"
      ? await getResidentProfile(getDb(), principal)
      : null;
  const treasurerRequests = principal.role === "treasurer"
    ? await getTreasurerPaymentRequestQueue(getDb(), principal)
    : null;
  return (
    <main className="page-shell">
      <header className="topbar">
        <Brand compact />
        <SignOutButton />
      </header>
      <details className="account-tools">
        <summary>Pengaturan akun</summary>
        <nav className="account-tools-links" aria-label="Pengaturan akun">
          {(principal.role === "rt_chairman" || principal.role === "system_admin") && (
            <Link href="/app/aktivitas">Riwayat aktivitas</Link>
          )}
          <Link href="/app/keamanan">Keamanan akun</Link>
        </nav>
      </details>
      {profile ? (
        <>
          <PaymentNotifications accountId={principal.appAccountId} role="resident" />
          <ResidentCard profile={profile} businessDate={jakartaBusinessDate()} />
        </>
      ) : principal.role === "treasurer" ? (
        <>
          <TreasurerDashboard requests={treasurerRequests ?? []} />
          <PaymentNotifications accountId={principal.appAccountId} role="treasurer" />
        </>
      ) : principal.role === "rt_chairman" ? (
        <section className="app-card role-overview" aria-labelledby="chairman-overview-title">
          <span className="account-badge">{roleNames[principal.role]}</span>
          <h1 id="chairman-overview-title">Kelola RT</h1>
          <p>Pilih tugas yang ingin dikerjakan.</p>
          <div className="role-overview-grid">
            <section className="role-overview-group" aria-labelledby="chairman-people-title">
              <h2 id="chairman-people-title">Warga &amp; pengurus</h2>
              <nav aria-label="Kelola warga dan pengurus">
                <Link href="/app/rumah">Rumah dan warga</Link>
                <Link href="/app/pengurus">Jabatan pengurus</Link>
              </nav>
            </section>
            <section className="role-overview-group" aria-labelledby="chairman-report-title">
              <h2 id="chairman-report-title">Laporan</h2>
              <nav aria-label="Laporan RT">
                <Link href="/app/laporan">Laporan iuran</Link>
              </nav>
            </section>
          </div>
          <details className="role-settings">
            <summary>Pengaturan iuran</summary>
            <nav aria-label="Pengaturan iuran RT">
              <Link href="/app/tarif">Tarif iuran</Link>
              <Link href="/app/penyesuaian">Penyesuaian kewajiban</Link>
              <Link href="/app/pemutihan">Pemutihan iuran</Link>
            </nav>
          </details>
        </section>
      ) : (
        <section className="app-card role-overview" aria-labelledby="admin-overview-title">
          <span className="account-badge">{roleNames[principal.role]}</span>
          <h1 id="admin-overview-title">Operasional sistem</h1>
          <p>Pantau kondisi aplikasi, pulihkan akses akun, dan tinjau audit. Transaksi keuangan tetap dikelola pengurus RT.</p>
          <nav className="role-overview-actions" aria-label="Tindakan System Admin">
            <Link className="button button--primary" href="/system/kesehatan">Kesehatan sistem</Link>
            <Link className="button button--secondary" href="/system/akun">Cari dan pulihkan akun</Link>
            <Link className="button button--secondary" href="/app/aktivitas">Riwayat aktivitas</Link>
          </nav>
        </section>
      )}
      <SiteFooter />
    </main>
  );
}
