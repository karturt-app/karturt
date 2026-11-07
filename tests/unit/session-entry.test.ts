import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth/permissions";
import { MfaEnrollmentRequiredError, UnauthenticatedError } from "@/lib/auth/principal";
import { resolveSessionEntry } from "@/lib/auth/session-entry";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode; [key: string]: unknown }) =>
    createElement("a", { href, ...props }, children),
}));
vi.mock("@/components/brand", () => ({ Brand: () => createElement("span", null, "KartuRT") }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => createElement("footer") }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => createElement("button", null, "Tema") }));
vi.mock("@/components/login-form", () => ({ LoginForm: () => createElement("form", { "data-login-form": "true" }) }));
vi.mock("@/components/official-pin-recovery-form", () => ({ OfficialPinRecoveryForm: () => createElement("div") }));

import { LoginPage } from "@/components/login-page";

const activeRoles: Principal["role"][] = ["resident", "treasurer", "rt_chairman", "system_admin"];

describe("session-aware entry resolution", () => {
  it.each(activeRoles)("sends a valid %s principal to the shared role-aware app", async (role) => {
    await expect(resolveSessionEntry(async () => ({ role } as Principal)))
      .resolves.toEqual({ kind: "redirect", destination: "/app" });
  });

  it.each([
    "expired or missing Better Auth session",
    "inactive account",
    "inactive household membership",
    "missing official assignment",
  ])("keeps an unauthenticated entry available for %s", async (reason) => {
    const getPrincipal = vi.fn(async (): Promise<Principal> => {
      throw new UnauthenticatedError(reason);
    });

    await expect(resolveSessionEntry(getPrincipal)).resolves.toEqual({ kind: "entry" });
    expect(getPrincipal).toHaveBeenCalledOnce();
  });

  it("routes an admin who still needs MFA enrollment to the setup flow", async () => {
    await expect(resolveSessionEntry(async () => { throw new MfaEnrollmentRequiredError(); }))
      .resolves.toEqual({ kind: "redirect", destination: "/system/2fa/setup" });
  });

  it("keeps database and other transient errors distinct from logout", async () => {
    const result = await resolveSessionEntry(async () => {
      throw new Error("private database diagnostic");
    });

    expect(result).toEqual({ kind: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("private database diagnostic");
  });

  it("shows a retry notice without rendering a fresh login form when session lookup is unavailable", () => {
    const html = renderToStaticMarkup(createElement(LoginPage, {
      kind: "resident",
      sessionCheckUnavailable: true,
    }));

    expect(html).toContain("Sesi belum dapat diperiksa");
    expect(html).toContain("Kami tidak mengubah sesi Anda");
    expect(html).toContain('href="/login/warga"');
    expect(html).not.toContain("data-login-form");
  });
});
