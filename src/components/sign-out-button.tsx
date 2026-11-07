"use client";

import { LogOut, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function signOut() {
    setBusy(true);
    setError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      router.replace("/");
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }
  return (
    <div className="sign-out-wrap">
      <button
        className="icon-button sign-out-button"
        type="button"
        onClick={signOut}
        disabled={busy}
        title="Keluar dari akun"
        aria-label="Keluar dari akun"
      >
        {busy ? (
          <LoaderCircle className="spinner" size={16} />
        ) : (
          <LogOut size={16} aria-hidden="true" />
        )}
        <span className="sign-out-label">Keluar</span>
      </button>
      {error && (
        <p className="resident-note" role="alert">
          Belum berhasil keluar. Silakan coba lagi.
        </p>
      )}
    </div>
  );
}
