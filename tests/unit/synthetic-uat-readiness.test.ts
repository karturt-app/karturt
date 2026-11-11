import { describe, expect, it } from "vitest";
import {
  assessSyntheticUatAccount,
  syntheticUatRoles,
  type SyntheticUatAccountEvidence,
} from "@/lib/rt/synthetic-uat-readiness";

const complete: SyntheticUatAccountEvidence = {
  found: true,
  active: true,
  credentialHashPresent: true,
  pinHashPresent: true,
  residentPinMatchesCredential: true,
  officialAssignmentActive: true,
  householdActive: true,
  totpVerified: true,
  locked: false,
};

describe("isolated synthetic UAT login readiness", () => {
  it("accepts complete prerequisites for all four roles without claiming a browser login", () => {
    for (const role of syntheticUatRoles) {
      const result = assessSyntheticUatAccount(role, complete);
      expect(result).toEqual({ role, status: "READY_TO_TEST", blockers: [] });
    }
  });

  it("blocks the synthetic Chairman and Treasurer until their official PINs are provisioned", () => {
    for (const role of ["rt_chairman", "treasurer"] as const) {
      const result = assessSyntheticUatAccount(role, { ...complete, pinHashPresent: false });
      expect(result.status).toBe("BLOCKED");
      expect(result.blockers).toEqual(["PIN_NOT_CONFIGURED"]);
    }
  });

  it("requires a verified TOTP for synthetic System Admin access", () => {
    const result = assessSyntheticUatAccount("system_admin", { ...complete, totpVerified: false });
    expect(result).toEqual({
      role: "system_admin",
      status: "BLOCKED",
      blockers: ["TOTP_NOT_VERIFIED"],
    });
  });

  it("detects an out-of-sync resident PIN, inactive membership, or locked account", () => {
    const result = assessSyntheticUatAccount("resident", {
      ...complete,
      residentPinMatchesCredential: false,
      householdActive: false,
      locked: true,
    });
    expect(result.blockers).toEqual([
      "ACCOUNT_LOCKED",
      "RESIDENT_PIN_MISMATCH",
      "HOUSEHOLD_NOT_ACTIVE",
    ]);
  });

  it("requires an active official assignment, not only an active account", () => {
    const result = assessSyntheticUatAccount("rt_chairman", {
      ...complete,
      officialAssignmentActive: false,
    });
    expect(result.blockers).toContain("ASSIGNMENT_NOT_ACTIVE");
  });

  it("fails closed on missing accounts and missing password hashes", () => {
    expect(assessSyntheticUatAccount("resident", { ...complete, found: false }).blockers)
      .toEqual(["ACCOUNT_NOT_FOUND"]);
    expect(assessSyntheticUatAccount("treasurer", {
      ...complete,
      credentialHashPresent: false,
    }).blockers).toContain("CREDENTIAL_NOT_CONFIGURED");
  });

  it("does not require an official TOTP before the planned v1.2.0 change", () => {
    expect(assessSyntheticUatAccount("treasurer", {
      ...complete,
      totpVerified: false,
    }).status).toBe("READY_TO_TEST");
  });
});
