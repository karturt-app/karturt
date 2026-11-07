import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginPage } from "@/components/login-page";
import { resolveSessionEntry } from "@/lib/auth/session-entry";

export const metadata: Metadata = {
  title: "Masuk pengurus",
  alternates: { canonical: "/login/pengurus" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OfficialLoginPage() {
  const sessionEntry = await resolveSessionEntry();
  if (sessionEntry.kind === "redirect") redirect(sessionEntry.destination);
  return <LoginPage kind="official" sessionCheckUnavailable={sessionEntry.kind === "unavailable"} />;
}
