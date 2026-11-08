import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  billingYears,
  feeRates,
  households,
  monthlyDueRecordingCorrections,
  monthlyDues,
} from "@/db/schema";
import { assertCanPerform, type Principal } from "@/lib/auth/permissions";
import { appendAuditEvent } from "@/lib/audit/writer";
import { assertActiveChairman } from "@/lib/billing/chairman-fee-rates";
import { jakartaBusinessDate } from "@/lib/officials/lifecycle";

type BillingTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

async function carryForwardRecordedHouseholdTariffs(
  transaction: BillingTransaction,
  principal: Principal,
  year: { id: string; year: number },
  rtUnitId: string,
) {
  const correctedHouseholds = await transaction
    .selectDistinct({ householdId: monthlyDueRecordingCorrections.householdId })
    .from(monthlyDueRecordingCorrections)
    .where(eq(monthlyDueRecordingCorrections.rtUnitId, rtUnitId));
  if (correctedHouseholds.length === 0) return;
  const correctedHouseholdIds = correctedHouseholds.map(({ householdId }) => householdId);

  const targetHouseholds = await transaction
    .select({ id: households.id })
    .from(households)
    .where(and(
      eq(households.rtUnitId, rtUnitId),
      eq(households.status, "active"),
      inArray(households.id, correctedHouseholdIds),
      // An open household that starts later in the target year still carries its tariff.
      lte(households.startsOn, `${year.year}-12-31`),
      or(isNull(households.endsOn), gte(households.endsOn, `${year.year}-01-01`)),
    ));
  if (targetHouseholds.length === 0) return;
  const targetHouseholdIds = targetHouseholds.map(({ id }) => id);

  const priorYearRows = await transaction
    .select({
      householdId: monthlyDues.householdId,
      month: monthlyDues.month,
      amount: monthlyDues.amount,
      recordedAmount: monthlyDueRecordingCorrections.recordedAmount,
      monthlyDueId: monthlyDues.id,
    })
    .from(monthlyDues)
    .innerJoin(billingYears, and(
      eq(billingYears.id, monthlyDues.billingYearId),
      eq(billingYears.rtUnitId, monthlyDues.rtUnitId),
      eq(billingYears.year, year.year - 1),
    ))
    .leftJoin(monthlyDueRecordingCorrections, and(
      eq(monthlyDueRecordingCorrections.monthlyDueId, monthlyDues.id),
      eq(monthlyDueRecordingCorrections.rtUnitId, monthlyDues.rtUnitId),
      eq(monthlyDueRecordingCorrections.householdId, monthlyDues.householdId),
    ))
    .where(and(
      eq(monthlyDues.rtUnitId, rtUnitId),
      inArray(monthlyDues.householdId, targetHouseholdIds),
    ))
    .orderBy(asc(monthlyDues.householdId), desc(monthlyDues.month));

  const latestByHousehold = new Map<string, typeof priorYearRows[number]>();
  for (const row of priorYearRows) {
    if (!latestByHousehold.has(row.householdId)) latestByHousehold.set(row.householdId, row);
  }
  const missingPriorYear = targetHouseholdIds.filter((householdId) => !latestByHousehold.has(householdId));
  if (missingPriorYear.length > 0) {
    throw new Error("A previous-year tariff snapshot is required before carrying a corrected household tariff forward.");
  }

  const januaryRates = await transaction
    .select({ householdId: feeRates.householdId })
    .from(feeRates)
    .where(and(
      eq(feeRates.rtUnitId, rtUnitId),
      eq(feeRates.billingYearId, year.id),
      eq(feeRates.effectiveMonth, 1),
      inArray(feeRates.householdId, targetHouseholdIds),
    ));
  const scheduledHouseholds = new Set(januaryRates.flatMap(({ householdId }) => householdId ? [householdId] : []));
  const ratesToCarry = targetHouseholdIds
    .filter((householdId) => !scheduledHouseholds.has(householdId))
    .map((householdId) => {
      const prior = latestByHousehold.get(householdId)!;
      return {
        householdId,
        sourceDueId: prior.monthlyDueId,
        monthlyAmount: prior.recordedAmount ?? prior.amount,
      };
    });
  if (ratesToCarry.length === 0) return;

  const businessDate = jakartaBusinessDate();
  if (`${year.year}-01` <= businessDate.slice(0, 7)) {
    throw new Error("A corrected household tariff must be carried forward before January begins; add a future effective tariff instead.");
  }
  const { appAccountId } = await assertActiveChairman(
    transaction as unknown as AppDatabase,
    principal,
    businessDate,
  );
  for (const rate of ratesToCarry) {
    const requestFingerprint = createHash("sha256").update(JSON.stringify({
      version: 1,
      purpose: "corrected-household-tariff-carry-forward",
      billingYearId: year.id,
      sourceDueId: rate.sourceDueId,
      householdId: rate.householdId,
      monthlyAmount: rate.monthlyAmount,
    })).digest("hex");
    const [created] = await transaction
      .insert(feeRates)
      .values({
        rtUnitId,
        billingYearId: year.id,
        householdId: rate.householdId,
        effectiveMonth: 1,
        monthlyAmount: rate.monthlyAmount,
        createdByAccountId: appAccountId,
        createdByAccountType: "official",
        idempotencyKey: randomUUID(),
        requestFingerprint,
      })
      .returning({ id: feeRates.id });
    if (!created) throw new Error("Corrected household tariff carry-forward returned no row.");
    await appendAuditEvent(transaction, {
      actorAppAccountId: appAccountId,
      action: "fee_rate.created",
      entityType: "fee_rate",
      entityId: created.id,
      reason: null,
      context: { period: `${year.year}-01`, monthlyAmount: rate.monthlyAmount },
    });
  }
}

export async function activateBillingYear(
  database: AppDatabase,
  principal: Principal,
  input: { billingYearId: string },
) {
  const rtUnitId = principal.rtUnitId;
  if (!rtUnitId) throw new Error("Forbidden: billing actions require an RT principal.");
  assertCanPerform(principal, "billing:generate", { rtUnitId });
  return database.transaction(async (transaction) => {
    const [year] = await transaction
      .select({ id: billingYears.id, year: billingYears.year, status: billingYears.status })
      .from(billingYears)
      .where(and(eq(billingYears.id, input.billingYearId), eq(billingYears.rtUnitId, rtUnitId)))
      .limit(1)
      .for("update");
    if (!year) throw new Error("Billing year was not found in this RT.");
    if (year.status === "closed") throw new Error("A closed billing year cannot be activated again.");

    const [januaryRate] = await transaction
      .select({ id: feeRates.id })
      .from(feeRates)
      .where(and(
        eq(feeRates.rtUnitId, rtUnitId),
        eq(feeRates.billingYearId, year.id),
        eq(feeRates.effectiveMonth, 1),
      ))
      .limit(1);
    if (!januaryRate) throw new Error("A January fee rate is required before activating a billing year.");
    if (year.status === "draft") {
      const [activated] = await transaction
        .update(billingYears)
        .set({ status: "open" })
        .where(and(eq(billingYears.id, year.id), eq(billingYears.status, "draft")))
        .returning({ id: billingYears.id });
      if (!activated) throw new Error("Billing year state changed before activation completed.");
    }
    await carryForwardRecordedHouseholdTariffs(
      transaction,
      principal,
      { id: year.id, year: year.year },
      rtUnitId,
    );
    return { id: year.id, status: "open" as const };
  });
}
