import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../../src/db/client";
import { billingYears, feeRates, households, monthlyDueRecordingCorrections, monthlyDues } from "../../src/db/schema";
import { activateBillingYear } from "../../src/lib/billing/activation";
import { generateHouseholdDues } from "../../src/lib/billing/generator";
import { listChairmanFeeRates } from "../../src/lib/billing/chairman-fee-rates";
import { getDueFinancialBalances } from "../../src/lib/billing/due-balance";
import { createFeeRateFixture, createHousehold, createRt, createTestDatabase, ensureTestChairman } from "../helpers/database";
import type { Principal } from "../../src/lib/auth/permissions";

function chairmanFor(rtUnitId: string): Principal {
  return { authUserId: "chair-user", appAccountId: "chair-account", role: "rt_chairman", rtUnitId, householdId: null, personId: "chair-person" };
}

describe("monthly-dues database integration", () => {
  let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => { testDatabase = await createTestDatabase(); });
  afterAll(async () => { if (testDatabase) await testDatabase.close(); });

  it("writes twelve rows once, snapshots fee changes, and keeps pre-residency months not due", async () => {
    const { db } = testDatabase;
    const rtUnitId = await createRt(db);
    const chairman = chairmanFor(rtUnitId);
    const household = await createHousehold(db, rtUnitId, { number: "C-01", startsOn: "2026-05-15" });
    const [year] = await db.insert(billingYears).values({ rtUnitId, year: 2026 }).returning({ id: billingYears.id });
    const [firstRate] = await createFeeRateFixture(db, { rtUnitId, billingYearId: year.id, effectiveMonth: 1, monthlyAmount: 40_000 });
    await createFeeRateFixture(db, { rtUnitId, billingYearId: year.id, effectiveMonth: 7, monthlyAmount: 50_000 });

    await expect(generateHouseholdDues(db as unknown as AppDatabase, chairman, { householdId: household.householdId, billingYearId: year.id })).rejects.toThrow("open billing year");
    await expect(activateBillingYear(db as unknown as AppDatabase, chairman, { billingYearId: year.id })).resolves.toMatchObject({ id: year.id, status: "open" });
    await expect(activateBillingYear(db as unknown as AppDatabase, chairman, { billingYearId: year.id })).resolves.toMatchObject({ id: year.id, status: "open" });

    const result = await generateHouseholdDues(db as unknown as AppDatabase, chairman, { householdId: household.householdId, billingYearId: year.id });
    const concurrentRetries = await Promise.all([
      generateHouseholdDues(db as unknown as AppDatabase, chairman, { householdId: household.householdId, billingYearId: year.id }),
      generateHouseholdDues(db as unknown as AppDatabase, chairman, { householdId: household.householdId, billingYearId: year.id }),
    ]);
    const rows = await db.select().from(monthlyDues).where(eq(monthlyDues.householdId, household.householdId)).orderBy(monthlyDues.month);

    expect(result.insertedCount).toBe(12);
    expect(concurrentRetries.reduce((total, retry) => total + retry.insertedCount, 0)).toBe(0);
    expect(rows).toHaveLength(12);
    expect(rows.slice(0, 4).every((row) => row.status === "not_due" && row.amount === 0 && row.feeRateId === null && row.waivedReason === null)).toBe(true);
    expect(rows.slice(4).every((row) => row.status === "unpaid")).toBe(true);
    expect(rows[4]?.feeRateId).toBe(firstRate.id);
    expect(rows[4]?.amount).toBe(40_000);
    expect(rows[6]?.amount).toBe(50_000);
    expect(rows.every((row) => row.dueDate.endsWith("-10"))).toBe(true);
  });

  it("requires a January rate and prevents two billing years from being active in one RT", async () => {
    const { db } = testDatabase;
    const rtUnitId = await createRt(db);
    const chairman = chairmanFor(rtUnitId);
    const [firstYear] = await db.insert(billingYears).values({ rtUnitId, year: 2026 }).returning({ id: billingYears.id });
    const [secondYear] = await db.insert(billingYears).values({ rtUnitId, year: 2027 }).returning({ id: billingYears.id });
    await createFeeRateFixture(db, { rtUnitId, billingYearId: firstYear.id, effectiveMonth: 2, monthlyAmount: 40_000 });
    await createFeeRateFixture(db, { rtUnitId, billingYearId: secondYear.id, effectiveMonth: 1, monthlyAmount: 45_000 });

    await expect(activateBillingYear(db as unknown as AppDatabase, chairman, { billingYearId: firstYear.id })).rejects.toThrow("January fee rate");
    await createFeeRateFixture(db, { rtUnitId, billingYearId: firstYear.id, effectiveMonth: 1, monthlyAmount: 40_000 });
    const activationAttempts = await Promise.allSettled([
      activateBillingYear(db as unknown as AppDatabase, chairman, { billingYearId: firstYear.id }),
      activateBillingYear(db as unknown as AppDatabase, chairman, { billingYearId: secondYear.id }),
    ]);
    expect(activationAttempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(activationAttempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);

    const years = await db.select({ id: billingYears.id, status: billingYears.status }).from(billingYears).where(eq(billingYears.rtUnitId, rtUnitId));
    expect(years.filter((year) => year.status === "open")).toHaveLength(1);
    expect(years.filter((year) => year.status === "draft")).toHaveLength(1);
  });

  it("keeps ended-household arrears in the active months and marks later months not due", async () => {
    const { db } = testDatabase;
    const rtUnitId = await createRt(db);
    const chairman = chairmanFor(rtUnitId);
    const household = await createHousehold(db, rtUnitId);
    await db.update(households).set({ status: "inactive", endsOn: "2026-06-30" }).where(eq(households.id, household.householdId));

    const [year] = await db.insert(billingYears).values({ rtUnitId, year: 2026 }).returning({ id: billingYears.id });
    await createFeeRateFixture(db, { rtUnitId, billingYearId: year.id, effectiveMonth: 1, monthlyAmount: 40_000 });
    await activateBillingYear(db as unknown as AppDatabase, chairman, { billingYearId: year.id });

    const result = await generateHouseholdDues(db as unknown as AppDatabase, chairman, {
      householdId: household.householdId,
      billingYearId: year.id,
    });
    const rows = await db.select().from(monthlyDues).where(eq(monthlyDues.householdId, household.householdId)).orderBy(monthlyDues.month);

    expect(result.insertedCount).toBe(12);
    expect(rows.slice(0, 6).every((row) => row.status === "unpaid" && row.amount === 40_000)).toBe(true);
    expect(rows.slice(6).every((row) => row.status === "not_due" && row.amount === 0 && row.feeRateId === null)).toBe(true);
    expect(rows.every((row) => row.waivedReason === null)).toBe(true);
  });

  it("keeps all months not due when the household starts after the billing year", async () => {
    const { db } = testDatabase;
    const rtUnitId = await createRt(db);
    const chairman = chairmanFor(rtUnitId);
    const household = await createHousehold(db, rtUnitId, { startsOn: "2027-03-01" });
    const [year] = await db.insert(billingYears).values({ rtUnitId, year: 2026 }).returning({ id: billingYears.id });
    await createFeeRateFixture(db, { rtUnitId, billingYearId: year.id, effectiveMonth: 1, monthlyAmount: 40_000 });
    await activateBillingYear(db as unknown as AppDatabase, chairman, { billingYearId: year.id });

    await expect(generateHouseholdDues(db as unknown as AppDatabase, chairman, {
      householdId: household.householdId,
      billingYearId: year.id,
    })).resolves.toMatchObject({ insertedCount: 12 });
    const rows = await db.select().from(monthlyDues).where(eq(monthlyDues.householdId, household.householdId));
    expect(rows.every((row) => row.status === "not_due")).toBe(true);
  });

  it("blocks billing activation and generation for other roles and another RT", async () => {
    const { db } = testDatabase;
    const rtUnitId = await createRt(db);
    const otherRtUnitId = await createRt(db);
    const household = await createHousehold(db, rtUnitId);
    const [year] = await db.insert(billingYears).values({ rtUnitId, year: 2026 }).returning({ id: billingYears.id });
    await createFeeRateFixture(db, { rtUnitId, billingYearId: year.id, effectiveMonth: 1, monthlyAmount: 40_000 });
    const forbiddenPrincipals: Principal[] = [
      { ...chairmanFor(rtUnitId), role: "treasurer" },
      { ...chairmanFor(rtUnitId), role: "resident", householdId: household.householdId },
      { ...chairmanFor(rtUnitId), role: "system_admin", rtUnitId: null, householdId: null, personId: null },
    ];

    for (const principal of forbiddenPrincipals) {
      await expect(activateBillingYear(db as unknown as AppDatabase, principal, { billingYearId: year.id })).rejects.toThrow("Forbidden");
      await expect(generateHouseholdDues(db as unknown as AppDatabase, principal, {
        householdId: household.householdId,
        billingYearId: year.id,
      })).rejects.toThrow("Forbidden");
    }
    const otherRtChairman = chairmanFor(otherRtUnitId);
    await expect(activateBillingYear(db as unknown as AppDatabase, otherRtChairman, { billingYearId: year.id }))
      .rejects.toThrow("not found in this RT");
    await expect(generateHouseholdDues(db as unknown as AppDatabase, otherRtChairman, {
      householdId: household.householdId,
      billingYearId: year.id,
    })).rejects.toThrow("not found in this RT");
    const [unchanged] = await db.select({ status: billingYears.status }).from(billingYears).where(eq(billingYears.id, year.id));
    expect(unchanged?.status).toBe("draft");
  });

  it("keeps corrected recording separate from the original snapshot and carries the tariff forward once", async () => {
    const { db } = testDatabase;
    const rtUnitId = await createRt(db);
    const appAccountId = await ensureTestChairman(db, rtUnitId);
    const chairman: Principal = { ...chairmanFor(rtUnitId), appAccountId };
    const correctedHouse = await createHousehold(db, rtUnitId, { number: "BLOKD1", startsOn: "2026-01-01" });
    const otherHouse = await createHousehold(db, rtUnitId, { number: "BLOKD2", startsOn: "2026-01-01" });
    const [priorYear] = await db.insert(billingYears).values({ rtUnitId, year: 2026 }).returning({ id: billingYears.id });
    await createFeeRateFixture(db, { rtUnitId, billingYearId: priorYear!.id, effectiveMonth: 1, monthlyAmount: 40_000 });
    await activateBillingYear(db as unknown as AppDatabase, chairman, { billingYearId: priorYear!.id });
    await generateHouseholdDues(db as unknown as AppDatabase, chairman, { householdId: correctedHouse.householdId, billingYearId: priorYear!.id });
    await generateHouseholdDues(db as unknown as AppDatabase, chairman, { householdId: otherHouse.householdId, billingYearId: priorYear!.id });

    const [correctedDue] = await db.select({ id: monthlyDues.id })
      .from(monthlyDues)
      .where(and(eq(monthlyDues.householdId, correctedHouse.householdId), eq(monthlyDues.month, 12)));
    await db.insert(monthlyDueRecordingCorrections).values({
      rtUnitId,
      householdId: correctedHouse.householdId,
      monthlyDueId: correctedDue!.id,
      recordedAmount: 50_000,
      collectionTargetAmount: 50_000,
      correctionCode: "2026_household_tariff_recording_v1",
    });

    const [correctedBalance, untouchedBalance] = await Promise.all([
      db.select({ id: monthlyDues.id }).from(monthlyDues).where(and(
        eq(monthlyDues.householdId, correctedHouse.householdId),
        eq(monthlyDues.month, 12),
      )).then((rows) => getDueFinancialBalances(db as unknown as AppDatabase, [rows[0]!.id])),
      db.select({ id: monthlyDues.id }).from(monthlyDues).where(and(
        eq(monthlyDues.householdId, otherHouse.householdId),
        eq(monthlyDues.month, 12),
      )).then((rows) => getDueFinancialBalances(db as unknown as AppDatabase, [rows[0]!.id])),
    ]).then(([corrected, untouched]) => [corrected[0]!, untouched[0]!] as const);
    expect(correctedBalance).toMatchObject({ originalAmount: 40_000, effectiveTarget: 40_000, recordedAmount: 50_000, collectionTarget: 50_000, outstanding: 50_000 });
    expect(untouchedBalance).toMatchObject({ originalAmount: 40_000, effectiveTarget: 40_000, recordedAmount: null, collectionTarget: 40_000, outstanding: 40_000 });
    await expect(db.update(monthlyDueRecordingCorrections)
      .set({ recordedAmount: 60_000 })
      .where(eq(monthlyDueRecordingCorrections.monthlyDueId, correctedDue!.id)))
      .rejects.toThrow();
    const [unchangedCorrection] = await db.select({ recordedAmount: monthlyDueRecordingCorrections.recordedAmount })
      .from(monthlyDueRecordingCorrections)
      .where(eq(monthlyDueRecordingCorrections.monthlyDueId, correctedDue!.id));
    expect(unchangedCorrection?.recordedAmount).toBe(50_000);

    const [targetYear] = await db.insert(billingYears).values({ rtUnitId, year: 2027 }).returning({ id: billingYears.id });
    await createFeeRateFixture(db, { rtUnitId, billingYearId: targetYear!.id, effectiveMonth: 1, monthlyAmount: 40_000 });
    await db.update(billingYears).set({ status: "closed" }).where(eq(billingYears.id, priorYear!.id));

    const unverifiedChairman: Principal = { ...chairman, appAccountId: "missing-chairman-account" };
    await expect(activateBillingYear(db as unknown as AppDatabase, unverifiedChairman, { billingYearId: targetYear!.id }))
      .rejects.toThrow("Ketua RT aktif");
    const [rolledBackYear] = await db.select({ status: billingYears.status }).from(billingYears)
      .where(eq(billingYears.id, targetYear!.id));
    expect(rolledBackYear?.status).toBe("draft");

    await activateBillingYear(db as unknown as AppDatabase, chairman, { billingYearId: targetYear!.id });
    await activateBillingYear(db as unknown as AppDatabase, chairman, { billingYearId: targetYear!.id });
    const carriedRates = await db.select({ householdId: feeRates.householdId, monthlyAmount: feeRates.monthlyAmount })
      .from(feeRates)
      .where(and(eq(feeRates.billingYearId, targetYear!.id), eq(feeRates.effectiveMonth, 1)));
    expect(carriedRates).toHaveLength(2);
    expect(carriedRates.find((rate) => rate.householdId === correctedHouse.householdId)?.monthlyAmount).toBe(50_000);
    expect(carriedRates.find((rate) => rate.householdId === otherHouse.householdId)).toBeUndefined();
    const visibleRates = await listChairmanFeeRates(db as unknown as AppDatabase, chairman, targetYear!.id);
    expect(visibleRates.rates).toContainEqual(expect.objectContaining({
      householdNumber: "BLOKD1",
      effectiveMonth: 1,
      monthlyAmount: 50_000,
    }));
  });
});
