import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginPage } from "@/components/login-page";
import { resolveSessionEntry } from "@/lib/auth/session-entry";

export const metadata: Metadata = {
  title: "Masuk warga",
  alternates: { canonical: "/login/warga" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ResidentLoginPage() {
  const sessionEntry = await resolveSessionEntry();
  if (sessionEntry.kind === "redirect") redirect(sessionEntry.destination);
  return <LoginPage kind="resident" sessionCheckUnavailable={sessionEntry.kind === "unavailable"} />;
}
