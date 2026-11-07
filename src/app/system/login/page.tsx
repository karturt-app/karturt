import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginPage } from "@/components/login-page";
import { resolveSessionEntry } from "@/lib/auth/session-entry";

export const metadata: Metadata = {
  title: "Pemulihan sistem",
  alternates: { canonical: "/system/login" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SystemAdminLoginPage() {
  const sessionEntry = await resolveSessionEntry();
  if (sessionEntry.kind === "redirect") redirect(sessionEntry.destination);
  return <LoginPage kind="system_admin" sessionCheckUnavailable={sessionEntry.kind === "unavailable"} />;
}
