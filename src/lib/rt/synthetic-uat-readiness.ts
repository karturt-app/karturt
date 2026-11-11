/**
 * Non-secret readiness signals for the canonical isolated Preview/UAT fixture.
 * READY_TO_TEST means the prerequisites exist, NOT that a live login succeeded.
 */
export const syntheticUatRoles = ["resident", "rt_chairman", "treasurer", "system_admin"] as const;
export type SyntheticUatRole = (typeof syntheticUatRoles)[number];

export type SyntheticUatAccountEvidence = {
  found: boolean;
  active: boolean;
  credentialHashPresent: boolean;
  pinHashPresent: boolean;
  residentPinMatchesCredential: boolean;
  officialAssignmentActive: boolean;
  householdActive: boolean;
  totpVerified: boolean;
  locked: boolean;
};

export type SyntheticUatBlocker =
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_INACTIVE"
  | "ACCOUNT_LOCKED"
  | "CREDENTIAL_NOT_CONFIGURED"
  | "PIN_NOT_CONFIGURED"
  | "RESIDENT_PIN_MISMATCH"
  | "ASSIGNMENT_NOT_ACTIVE"
  | "HOUSEHOLD_NOT_ACTIVE"
  | "TOTP_NOT_VERIFIED";

export function assessSyntheticUatAccount(
  role: SyntheticUatRole,
  evidence: SyntheticUatAccountEvidence,
): { role: SyntheticUatRole; status: "READY_TO_TEST" | "BLOCKED"; blockers: SyntheticUatBlocker[] } {
  const blockers: SyntheticUatBlocker[] = [];
  if (!evidence.found) {
    return { role, status: "BLOCKED", blockers: ["ACCOUNT_NOT_FOUND"] };
  }
  if (!evidence.active) blockers.push("ACCOUNT_INACTIVE");
  if (evidence.locked) blockers.push("ACCOUNT_LOCKED");
  if (!evidence.credentialHashPresent) blockers.push("CREDENTIAL_NOT_CONFIGURED");

  if (role === "resident") {
    if (!evidence.pinHashPresent) blockers.push("PIN_NOT_CONFIGURED");
    else if (!evidence.residentPinMatchesCredential) blockers.push("RESIDENT_PIN_MISMATCH");
    if (!evidence.householdActive) blockers.push("HOUSEHOLD_NOT_ACTIVE");
  } else if (role === "system_admin") {
    if (!evidence.totpVerified) blockers.push("TOTP_NOT_VERIFIED");
  } else {
    if (!evidence.pinHashPresent) blockers.push("PIN_NOT_CONFIGURED");
    if (!evidence.officialAssignmentActive) blockers.push("ASSIGNMENT_NOT_ACTIVE");
  }
  return { role, status: blockers.length === 0 ? "READY_TO_TEST" : "BLOCKED", blockers };
}
