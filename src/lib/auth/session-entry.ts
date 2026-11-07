import type { Principal } from "@/lib/auth/permissions";
import {
  getCurrentPrincipal,
  MfaEnrollmentRequiredError,
  UnauthenticatedError,
} from "@/lib/auth/principal";

export type SessionEntryResolution =
  | { kind: "redirect"; destination: "/app" | "/system/2fa/setup" }
  | { kind: "entry" }
  | { kind: "unavailable" };

export async function resolveSessionEntry(
  getPrincipal: () => Promise<Principal> = getCurrentPrincipal,
): Promise<SessionEntryResolution> {
  try {
    await getPrincipal();
    return { kind: "redirect", destination: "/app" };
  } catch (error) {
    if (error instanceof MfaEnrollmentRequiredError) {
      return { kind: "redirect", destination: "/system/2fa/setup" };
    }
    if (error instanceof UnauthenticatedError) return { kind: "entry" };
    return { kind: "unavailable" };
  }
}
