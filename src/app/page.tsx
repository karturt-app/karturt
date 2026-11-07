import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, House, UsersRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { SiteFooter } from "@/components/site-footer";
import { SessionCheckNotice } from "@/components/session-check-notice";
import { ThemeToggle } from "@/components/theme-toggle";
import { redirect } from "next/navigation";
import { resolveSessionEntry } from "@/lib/auth/session-entry";

export const metadata: Metadata = {
  title: "Administrasi iuran RT yang lebih jelas",
  description: "KartuRT membantu warga dan pengurus melihat administrasi iuran RT dengan alur yang mudah dipahami.",
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

const entryPoints = [
  { href: "/login/warga", icon: House, title: "Saya warga", description: "Lihat kartu iuran dan informasi akun warga." },
  { href: "/login/pengurus", icon: UsersRound, title: "Saya pengurus", description: "Masuk dengan akun Bendahara atau Ketua RT." },
];

export default async function Home() {
  const sessionEntry = await resolveSessionEntry();
  if (sessionEntry.kind === "redirect") redirect(sessionEntry.destination);

  return (
    <main className="page-shell home-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <ThemeToggle />
        </div>
      </header>

      {sessionEntry.kind === "unavailable" && <SessionCheckNotice retryHref="/" />}

      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <h1 id="home-title">Iuran RT, <span>tercatat rapi.</span></h1>
          <p className="hero-description">Satu tempat untuk melihat informasi iuran dan mengelola administrasi lingkungan dengan lebih mudah.</p>
        </div>

        <div className="entry-panel">
          <div className="entry-panel-head">
            <div>
              <span className="step-label">MULAI DARI SINI</span>
              <h2>Pilih jenis akun</h2>
            </div>
          </div>
          <div className="entry-list">
            {entryPoints.map(({ href, icon: Icon, title, description }, index) => (
              <Link className="entry-link" href={href} key={href} style={{ animationDelay: `${index * 90}ms` }}>
                <span className="entry-icon"><Icon size={21} aria-hidden="true" /></span>
                <span className="entry-text"><strong>{title}</strong><span>{description}</span></span>
                <ArrowUpRight className="entry-arrow" size={19} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <p className="entry-help">Belum mendapat akses? Hubungi pengurus di lingkungan Anda.</p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
