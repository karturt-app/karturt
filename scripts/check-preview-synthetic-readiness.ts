import { loadEnvConfig } from "@next/env";
import { and, count, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { assertPreviewConnectionTarget } from "@/db/preview-target";
import {
  appAccounts,
  authAccount,
  authTwoFactor,
  authUser,
  households,
  monthlyDues,
  officialAssignments,
  people,
  rtUnits,
} from "@/db/schema";
import { requireDatabaseEnvironment } from "@/lib/env";
import { jakartaBusinessDate } from "@/lib/officials/lifecycle";
import { canonicalR2SyntheticFixture } from "@/lib/rt/r2-staging-fixture";
import {
  assessSyntheticUatAccount,
  syntheticUatRoles,
  type SyntheticUatAccountEvidence,
  type SyntheticUatRole,
} from "@/lib/rt/synthetic-uat-readiness";

const fixtureLogins: Record<SyntheticUatRole, string> = {
  resident: canonicalR2SyntheticFixture.residentLogin,
  rt_chairman: canonicalR2SyntheticFixture.chairmanLogin,
  treasurer: canonicalR2SyntheticFixture.treasurerLogin,
  system_admin: canonicalR2SyntheticFixture.systemAdminLogin,
};

async function main() {
  loadEnvConfig(process.cwd(), true);
  const environment = requireDatabaseEnvironment();
  if (environment.appEnv !== "preview" || environment.databaseEnv !== "preview") {
    throw new Error("This command is restricted to an isolated Preview environment.");
  }
  const target = assertPreviewConnectionTarget(environment.databaseUrl, "runtime", process.env);
  if (target.projectId !== "quiet-credit-75135059") {
    throw new Error("This checker is bound to the verified isolated synthetic UAT project.");
  }

  const db = getDb();
  const [accounts, assignments, householdRows, personRows, rtRows, dueRows] = await Promise.all([
    db.select({
      id: appAccounts.id,
      accountType: appAccounts.accountType,
      status: appAccounts.status,
      loginIdentifier: appAccounts.loginIdentifier,
      pinHash: appAccounts.pinHash,
      lockedUntil: appAccounts.lockedUntil,
      personId: appAccounts.personId,
      householdId: appAccounts.householdId,
      rtUnitId: appAccounts.rtUnitId,
      credentialHash: authAccount.password,
      totpEnabled: authUser.twoFactorEnabled,
      totpVerified: authTwoFactor.verified,
    }).from(appAccounts)
      .innerJoin(authUser, eq(authUser.id, appAccounts.authUserId))
      .leftJoin(authAccount, and(
        eq(authAccount.userId, appAccounts.authUserId),
        eq(authAccount.providerId, "credential"),
      ))
      .leftJoin(authTwoFactor, eq(authTwoFactor.userId, appAccounts.authUserId))
      .limit(8),
    db.select({
      appAccountId: officialAssignments.appAccountId,
      role: officialAssignments.role,
      startsOn: officialAssignments.startsOn,
      endsOn: officialAssignments.endsOn,
    }).from(officialAssignments).limit(8),
    db.select({
      id: households.id,
      rtUnitId: households.rtUnitId,
      status: households.status,
      startsOn: households.startsOn,
      endsOn: households.endsOn,
    }).from(households).limit(8),
    db.select({
      id: people.id,
      rtUnitId: people.rtUnitId,
      householdId: people.householdId,
      isActive: people.isActive,
    }).from(people).limit(8),
    db.select({ id: rtUnits.id }).from(rtUnits).limit(2),
    db.select({ total: count() }).from(monthlyDues),
  ]);

  const today = jakartaBusinessDate();
  const now = new Date();
  const expectedAccountType = {
    resident: "resident",
    rt_chairman: "official",
    treasurer: "official",
    system_admin: "system_admin",
  } as const;
  const isCanonicalFixture = rtRows.length === 1 && accounts.length === 4 &&
    syntheticUatRoles.every((role) =>
      accounts.filter((account) =>
        account.loginIdentifier === fixtureLogins[role] &&
        account.accountType === expectedAccountType[role] &&
        (role === "system_admin" ? account.rtUnitId === null : account.rtUnitId === rtRows[0]?.id),
      ).length === 1,
    );

  const results = syntheticUatRoles.map((role) => {
    const matches = accounts.filter((account) => account.loginIdentifier === fixtureLogins[role]);
    const account = matches.length === 1 && matches[0]?.accountType === expectedAccountType[role]
      ? matches[0]
      : undefined;
    const officialAssignments = account ? assignments.filter((assignment) =>
      assignment.appAccountId === account.id && assignment.role === role &&
      assignment.startsOn <= today &&
      (assignment.endsOn === null || assignment.endsOn >= today),
    ) : [];
    const household = account ? householdRows.find((entry) =>
      entry.id === account.householdId &&
      entry.rtUnitId === account.rtUnitId &&
      entry.status === "active" &&
      entry.startsOn <= today &&
      entry.endsOn === null,
    ) : undefined;
    const person = account ? personRows.find((entry) =>
      entry.id === account.personId &&
      entry.rtUnitId === account.rtUnitId &&
      entry.householdId === account.householdId &&
      entry.isActive,
    ) : undefined;
    const evidence: SyntheticUatAccountEvidence = {
      found: Boolean(account),
      active: account?.status === "active",
      credentialHashPresent: Boolean(account?.credentialHash),
      pinHashPresent: Boolean(account?.pinHash),
      residentPinMatchesCredential: Boolean(
        account?.pinHash && account.credentialHash && account.pinHash === account.credentialHash,
      ),
      officialAssignmentActive: officialAssignments.length === 1,
      householdActive: Boolean(household && person),
      totpVerified: account?.totpEnabled === true && account?.totpVerified === true,
      locked: Boolean(account?.lockedUntil && account.lockedUntil > now),
    };
    return assessSyntheticUatAccount(role, evidence);
  });

  const hasTwelveDuePeriods = Number(dueRows[0]?.total ?? 0) === 12;
  const status = isCanonicalFixture && hasTwelveDuePeriods &&
    results.every((result) => result.status === "READY_TO_TEST") ? "READY_FOR_BROWSER_UAT" : "BLOCKED";
  // This report contains only fixed role labels, aggregate counts, and controlled reason codes.
  // It intentionally never prints account identities, credential values/hashes, or database endpoints.
  console.info(JSON.stringify({
    event: "preview.synthetic_uat.readiness",
    status,
    canonicalFixture: isCanonicalFixture,
    twelveDuePeriods: hasTwelveDuePeriods,
    roles: results,
    actualBrowserLogin: "NOT_RUN",
    businessFlowScenarios: "NOT_RUN",
  }));
  if (status === "BLOCKED") process.exitCode = 1;
}

main()
  .catch(() => {
    console.error("Preview synthetic readiness check could not complete safely.");
    process.exitCode = 1;
  })
  .finally(closeDb);
