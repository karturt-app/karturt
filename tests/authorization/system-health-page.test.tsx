import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ principal: vi.fn(), health: vi.fn() }));
vi.mock("@/lib/auth/principal", () => ({
  getCurrentPrincipal: mocks.principal,
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  MfaEnrollmentRequiredError: class MfaEnrollmentRequiredError extends Error {},
}));
vi.mock("@/lib/system-health", () => ({ checkSystemHealth: mocks.health }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
}));

import SystemHealthPage from "@/app/system/kesehatan/page";
import { MfaEnrollmentRequiredError, UnauthenticatedError } from "@/lib/auth/principal";

const admin = {
  authUserId: "system-admin-user",
  appAccountId: "system-admin-account",
  role: "system_admin",
  rtUnitId: null,
  householdId: null,
  personId: null,
};

describe("System Admin health dashboard authorization and redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principal.mockResolvedValue(admin);
    mocks.health.mockResolvedValue({
      app: "responding",
      database: "connected",
      category: "none",
      checkedAt: "2026-11-04T03:00:00.000Z",
    });
  });

  it.each(["resident", "treasurer", "rt_chairman"])("denies %s before executing a probe", async (role) => {
    mocks.principal.mockResolvedValue({ ...admin, role, rtUnitId: "rt-one" });
    await expect(SystemHealthPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.health).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated and MFA-unverified requests without executing a probe", async () => {
    mocks.principal.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(SystemHealthPage()).rejects.toThrow("NEXT_REDIRECT:/system/login");
    mocks.principal.mockRejectedValueOnce(new MfaEnrollmentRequiredError());
    await expect(SystemHealthPage()).rejects.toThrow("NEXT_REDIRECT:/system/2fa/setup");
    expect(mocks.health).not.toHaveBeenCalled();
  });

  it("renders a minimal healthy response for a verified System Admin", async () => {
    const page = await SystemHealthPage();
    const html = renderToStaticMarkup(createElement(() => page));
    expect(mocks.health).toHaveBeenCalledOnce();
    expect(html).toContain("Kesehatan sistem");
    expect(html).toContain("Layanan aplikasi");
    expect(html).toContain("Koneksi database");
    expect(html).toContain("Terhubung");
    expect(html).toContain("10.00");
    expect(html).toContain("Periksa ulang");
    expect(html).not.toContain("postgresql://");
  });

  it("shows a safe incident category without exposing database errors", async () => {
    mocks.health.mockResolvedValue({
      app: "responding",
      database: "unavailable",
      category: "connection",
      checkedAt: "2026-11-04T03:00:00.000Z",
    });
    const page = await SystemHealthPage();
    const html = renderToStaticMarkup(createElement(() => page));
    expect(html).toContain("Terganggu");
    expect(html).toContain("Gangguan koneksi database");
    expect(html).not.toContain("host");
    expect(html).not.toContain("SQLSTATE");
  });
});
