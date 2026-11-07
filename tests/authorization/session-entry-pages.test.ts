import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentPrincipal: vi.fn() }));
vi.mock("@/lib/auth/principal", () => ({
  getCurrentPrincipal: mocks.getCurrentPrincipal,
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  MfaEnrollmentRequiredError: class MfaEnrollmentRequiredError extends Error {},
}));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => { throw new Error(`NEXT_REDIRECT:${destination}`); },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children),
}));
vi.mock("@/components/login-page", () => ({
  LoginPage: (props: { kind: string; sessionCheckUnavailable?: boolean }) => createElement("div", {
    "data-kind": props.kind,
    "data-unavailable": String(props.sessionCheckUnavailable),
  }),
}));

import Home, { dynamic as homeDynamic } from "@/app/page";
import ResidentLoginPage, { dynamic as residentDynamic } from "@/app/login/warga/page";
import OfficialLoginPage, { dynamic as officialDynamic } from "@/app/login/pengurus/page";
import SystemAdminLoginPage, { dynamic as systemAdminDynamic } from "@/app/system/login/page";
import { SessionCheckNotice } from "@/components/session-check-notice";
import { MfaEnrollmentRequiredError, UnauthenticatedError } from "@/lib/auth/principal";
import { LoginPage } from "@/components/login-page";

const routes = [
  { path: "/", render: Home },
  { path: "/login/warga", render: ResidentLoginPage },
  { path: "/login/pengurus", render: OfficialLoginPage },
  { path: "/system/login", render: SystemAdminLoginPage },
];

function findElement(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = findElement(child, predicate);
      if (result) return result;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (predicate(node)) return node;
  const props = node.props as { children?: ReactNode };
  return findElement(props.children, predicate);
}

describe("public session entry authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders entry pages dynamically so session redirects are never shared from cache", () => {
    expect([homeDynamic, residentDynamic, officialDynamic, systemAdminDynamic])
      .toEqual(["force-dynamic", "force-dynamic", "force-dynamic", "force-dynamic"]);
  });

  it.each(["resident", "treasurer", "rt_chairman", "system_admin"])(
    "sends a validated %s session from every entry route to the role-aware app",
    async (role) => {
      for (const route of routes) {
        mocks.getCurrentPrincipal.mockResolvedValue({ role });
        await expect(route.render()).rejects.toThrow("NEXT_REDIRECT:/app");
      }
    },
  );

  it.each(routes)("keeps $path available for missing, expired, or inactive sessions", async (route) => {
    mocks.getCurrentPrincipal.mockRejectedValue(new UnauthenticatedError("account is not active"));
    const page = await route.render();
    const props = page.props as { children?: ReactNode; sessionCheckUnavailable?: boolean };

    if (route.path === "/") {
      expect(findElement(props.children, (element) => element.type === SessionCheckNotice)).toBeNull();
    } else {
      expect(page.type).toBe(LoginPage);
      expect(props.sessionCheckUnavailable).toBe(false);
    }
  });

  it.each(routes)("sends $path to the protected MFA setup when enrollment is incomplete", async (route) => {
    mocks.getCurrentPrincipal.mockRejectedValue(new MfaEnrollmentRequiredError());
    await expect(route.render()).rejects.toThrow("NEXT_REDIRECT:/system/2fa/setup");
  });

  it.each(routes)("shows a safe retry fallback on $path when the database cannot verify a session", async (route) => {
    mocks.getCurrentPrincipal.mockRejectedValue(new Error("private database diagnostic"));
    const page = await route.render();
    const props = page.props as { children?: ReactNode; retryHref?: string; sessionCheckUnavailable?: boolean };

    if (route.path === "/") {
      const notice = findElement(props.children, (element) => element.type === SessionCheckNotice);
      expect((notice?.props as { retryHref?: string } | undefined)?.retryHref).toBe("/");
    } else {
      expect(page.type).toBe(LoginPage);
      expect(props.sessionCheckUnavailable).toBe(true);
    }
  });
});
