import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import {
  appAccounts,
  auditEvents,
  authSession,
  authAccount,
  authUser,
  billingYears,
  dueAdjustments,
  feeRates,
  houses,
  households,
  monthlyDues,
  officialAssignments,
  paymentAllocations,
  payments,
  people,
  rtSettings,
} from "@/db/schema";
import { createResidentAuthRecords } from "@/lib/accounts/resident-auth-records";
import { findUniqueLoginAccount } from "@/lib/auth/login-account";
import { resolvePrincipalForUser, UnauthenticatedError } from "@/lib/auth/principal";
import type { Principal } from "@/lib/auth/permissions";
import { recordTreasurerCashPayment } from "@/lib/billing/treasurer-cash-payments";
import { jakartaBusinessDate } from "@/lib/officials/lifecycle";
import {
  createHouseholdResident,
  deactivateHousehold,
  HouseholdConflictError,
  HouseholdForbiddenError,
  HouseholdLifecycleInvariantError,
  InvalidHouseholdInputError,
  listHouseholdManagement,
  replaceHouseholdResident,
  updateHouseholdResident,
} from "@/lib/households/lifecycle";
import { createAuthUser, createFeeRateFixture, createHousehold, createRt, createTestDatabase } from "../helpers/database";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
const businessDate = "2026-10-03";

describe("F12 household lifecycle domain services", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.db as unknown as AppDatabase;
  });

  afterAll(async () => {
    await testDatabase?.close();
  });

  async function createChairmanFixture() {
    const rtUnitId = await createRt(testDatabase.db);
    const original = await createHousehold(testDatabase.db, rtUnitId, { number: `CHAIR-${randomUUID().slice(0, 8)}` });
    const auth = await createAuthUser(testDatabase.db, "F12 chairman");
    const [account] = await testDatabase.db.insert(appAccounts).values({
      rtUnitId,
      authUserId: auth.id,
      accountType: "official",
      loginIdentifier: `chair-${randomUUID()}`,
      personId: original.personId,
    }).returning({ id: appAccounts.id });
    await testDatabase.db.insert(officialAssignments).values({
      rtUnitId,
      appAccountId: account!.id,
      role: "rt_chairman",
      startsOn: "2020-01-01",
    });
    const chairman: Principal = {
      authUserId: auth.id,
      appAccountId: account!.id,
      role: "rt_chairman",
      rtUnitId,
      householdId: null,
      personId: original.personId,
    };
    return { rtUnitId, original, chairman };
  }

  async function openBillingYear(rtUnitId: string) {
    const [year] = await testDatabase.db.insert(billingYears).values({
      rtUnitId,
      year: 2026,
      status: "open",
    }).returning({ id: billingYears.id });
    await createFeeRateFixture(testDatabase.db, {
      rtUnitId,
      billingYearId: year!.id,
      effectiveMonth: 1,
      monthlyAmount: 40_000,
    });
    return year!.id;
  }

  async function addResidentAccount(input: {
    rtUnitId: string;
    houseId: string;
    householdId: string;
    personId: string;
  }) {
    const [house] = await testDatabase.db.select({ number: houses.number })
      .from(houses).where(eq(houses.id, input.houseId)).limit(1);
    return createResidentAuthRecords(testDatabase.db as unknown as Pick<AppDatabase, "insert">, {
      rtUnitId: input.rtUnitId,
      householdId: input.householdId,
      personId: input.personId,
      loginIdentifier: house!.number.trim().toUpperCase(),
      fullName: "Penghuni lama",
      pin: "123456",
    });
  }

  async function addOldAnnualDues(
    rtUnitId: string,
    householdId: string,
    billingYearId: string,
    notDueMonths: readonly number[] = [],
  ) {
    const [feeRate] = await testDatabase.db.select({ id: feeRates.id })
      .from(feeRates).where(eq(feeRates.billingYearId, billingYearId)).limit(1);
    return testDatabase.db.insert(monthlyDues).values(Array.from({ length: 12 }, (_, index) => ({
      rtUnitId,
      householdId,
      billingYearId,
      feeRateId: notDueMonths.includes(index + 1) ? null : feeRate!.id,
      month: index + 1,
      amount: notDueMonths.includes(index + 1) ? 0 : 40_000,
      dueDate: `2026-${String(index + 1).padStart(2, "0")}-10`,
      status: notDueMonths.includes(index + 1) ? "not_due" as const : "unpaid" as const,
    }))).returning({ id: monthlyDues.id, month: monthlyDues.month, status: monthlyDues.status });
  }

  async function addSession(authUserId: string) {
    const sessionId = randomUUID();
    await testDatabase.db.insert(authSession).values({
      id: sessionId,
      token: randomUUID(),
      userId: authUserId,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });
    return sessionId;
  }

  it("creates a resident in a new house, generates month-safe dues, and audits only IDs/counts", async () => {
    const { chairman, rtUnitId } = await createChairmanFixture();
    const billingYearId = await openBillingYear(rtUnitId);

    const created = await createHouseholdResident(database, chairman, {
      newHouse: { number: "A-01", label: "Blok A" },
      newHouseMonthlyAmount: 40_000,
      startsOn: "2026-11-15",
      fullName: "Warga Baru",
      phone: "+62 812-3456-7890",
      initialPin: "482913",
    }, businessDate);

    const dues = await testDatabase.db.select({ month: monthlyDues.month, status: monthlyDues.status })
      .from(monthlyDues).where(eq(monthlyDues.householdId, created.householdId)).orderBy(monthlyDues.month);
    const [account] = await testDatabase.db.select({
      id: appAccounts.id,
      loginIdentifier: appAccounts.loginIdentifier,
      status: appAccounts.status,
      authUserId: appAccounts.authUserId,
    }).from(appAccounts).where(eq(appAccounts.id, created.residentAccountId));
    const [credential] = await testDatabase.db.select({ password: authAccount.password })
      .from(authAccount).where(eq(authAccount.userId, account!.authUserId));
    const [audit] = await testDatabase.db.select().from(auditEvents).where(and(
      eq(auditEvents.action, "household.created"),
      eq(auditEvents.entityId, created.householdId),
    ));
    const [newHouseRate] = await testDatabase.db.select({
      id: feeRates.id,
      householdId: feeRates.householdId,
      effectiveMonth: feeRates.effectiveMonth,
      monthlyAmount: feeRates.monthlyAmount,
      idempotencyKey: feeRates.idempotencyKey,
      requestFingerprint: feeRates.requestFingerprint,
    }).from(feeRates).where(eq(feeRates.householdId, created.householdId));
    const managementList = await listHouseholdManagement(database, chairman, "A-01", businessDate);

    expect(created).toMatchObject({ startsOn: "2026-11-15", generatedDueCount: 12 });
    expect(dues.filter((due) => due.month <= 10).every((due) => due.status === "not_due")).toBe(true);
    expect(dues.filter((due) => due.month >= 11).every((due) => due.status === "unpaid")).toBe(true);
    expect(account).toMatchObject({ id: created.residentAccountId, loginIdentifier: "A-01", status: "active" });
    expect(newHouseRate).toMatchObject({
      householdId: created.householdId,
      effectiveMonth: 11,
      monthlyAmount: 40_000,
    });
    expect(newHouseRate?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(newHouseRate?.requestFingerprint).toBe(createHash("sha256").update(JSON.stringify({
      version: 1,
      billingYearId,
      householdId: created.householdId,
      effectiveMonth: 11,
      monthlyAmount: 40_000,
    })).digest("hex"));
    expect(credential?.password).not.toBe("482913");
    expect(credential?.password).toBeTruthy();
    await expect(resolvePrincipalForUser(database, account!.authUserId, businessDate))
      .rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(resolvePrincipalForUser(database, account!.authUserId, "2026-11-15"))
      .resolves.toMatchObject({ householdId: created.householdId, personId: created.personId, role: "resident" });
    expect(created).not.toHaveProperty("initialPin");
    expect(audit?.context).toEqual({
      createdResidentAccountId: created.residentAccountId,
      generatedDueCount: 12,
      startsOn: "2026-11-15",
    });
    expect(JSON.stringify(audit?.context)).not.toContain("482913");
    expect(await testDatabase.db.select().from(monthlyDues).where(eq(monthlyDues.billingYearId, billingYearId))).toHaveLength(12);
    expect(managementList.households).toHaveLength(1);
    expect(managementList.households[0]).toMatchObject({
      householdId: created.householdId,
      houseNumber: "A-01",
      status: "active",
      residents: [{ personId: created.personId, fullName: "Warga Baru", residentAccountId: created.residentAccountId }],
      financialHistory: { dueCount: 12, unpaidCount: 2, notDueCount: 10 },
    });
    expect(managementList.availableHouses.some((house) => house.houseId === created.houseId)).toBe(false);

    await expect(createHouseholdResident(database, chairman, {
      newHouse: { number: "A-01", label: "Blok A" },
      newHouseMonthlyAmount: 40_000,
      startsOn: "2026-11-15",
      fullName: "Warga Baru",
      phone: "+62 812-3456-7890",
      initialPin: "482913",
    }, businessDate)).rejects.toBeInstanceOf(HouseholdConflictError);
    expect(await testDatabase.db.select({ id: feeRates.id }).from(feeRates)
      .where(eq(feeRates.householdId, created.householdId))).toHaveLength(1);
    expect(await testDatabase.db.select({ id: monthlyDues.id }).from(monthlyDues)
      .where(eq(monthlyDues.householdId, created.householdId))).toHaveLength(12);
  });

  it("classifies a case-insensitive duplicate house number and rolls the new-house transaction back", async () => {
    const { chairman, rtUnitId, original } = await createChairmanFixture();
    await openBillingYear(rtUnitId);
    const [existingHouse] = await testDatabase.db.select({ number: houses.number })
      .from(houses).where(eq(houses.id, original.houseId));

    await expect(createHouseholdResident(database, chairman, {
      newHouse: { number: existingHouse!.number.toLowerCase() },
      newHouseMonthlyAmount: 40_000,
      startsOn: businessDate,
      fullName: "Penghuni Baru",
      initialPin: "482913",
    }, businessDate)).rejects.toMatchObject({ code: "DUPLICATE_HOUSE_NUMBER" });

    expect(await testDatabase.db.select({ id: houses.id }).from(houses)
      .where(eq(houses.rtUnitId, rtUnitId))).toHaveLength(1);
    expect(await testDatabase.db.select({ id: households.id }).from(households)
      .where(eq(households.houseId, original.houseId))).toHaveLength(1);
  });

  it("classifies an active resident login collision without retaining the newly inserted house", async () => {
    const { chairman, rtUnitId } = await createChairmanFixture();
    await openBillingYear(rtUnitId);
    const otherRtUnitId = await createRt(testDatabase.db);
    const otherHousehold = await createHousehold(testDatabase.db, otherRtUnitId, {
      number: `LOGIN-${randomUUID().slice(0, 8)}`,
    });
    const [otherHouse] = await testDatabase.db.select({ number: houses.number })
      .from(houses).where(eq(houses.id, otherHousehold.houseId));
    await addResidentAccount({
      rtUnitId: otherRtUnitId,
      houseId: otherHousehold.houseId,
      householdId: otherHousehold.householdId,
      personId: otherHousehold.personId,
    });

    await expect(createHouseholdResident(database, chairman, {
      newHouse: { number: otherHouse!.number },
      newHouseMonthlyAmount: 40_000,
      startsOn: businessDate,
      fullName: "Penghuni Baru",
      initialPin: "482913",
    }, businessDate)).rejects.toMatchObject({ code: "ACTIVE_LOGIN_COLLISION" });

    expect(await testDatabase.db.select({ id: houses.id }).from(houses).where(and(
      eq(houses.rtUnitId, rtUnitId),
      eq(houses.number, otherHouse!.number),
    ))).toHaveLength(0);
  });

  it("classifies overlapping occupancy as a household-period conflict", async () => {
    const { chairman, original } = await createChairmanFixture();

    await expect(createHouseholdResident(database, chairman, {
      houseId: original.houseId,
      startsOn: businessDate,
      fullName: "Penghuni Baru",
      initialPin: "482913",
    }, businessDate)).rejects.toMatchObject({ code: "HOUSEHOLD_PERIOD_OVERLAP" });

    expect(await testDatabase.db.select({ id: households.id }).from(households)
      .where(eq(households.houseId, original.houseId))).toHaveLength(1);
  });

  it("creates a new household at the selected tier when the open year has no general tariff", async () => {
    const { chairman, rtUnitId } = await createChairmanFixture();
    const currentDate = jakartaBusinessDate();
    const currentMonth = Number(currentDate.slice(5, 7));
    const currentYear = Number(currentDate.slice(0, 4));
    await testDatabase.db.insert(billingYears).values({
      rtUnitId,
      year: currentYear,
      status: "open",
    });

    const created = await createHouseholdResident(database, chairman, {
      newHouse: { number: "NO-RATE-01" },
      newHouseMonthlyAmount: 32_000,
      startsOn: currentDate,
      fullName: "Penghuni Baru",
      initialPin: "482913",
    }, currentDate);
    const rates = await testDatabase.db.select({ householdId: feeRates.householdId, effectiveMonth: feeRates.effectiveMonth, monthlyAmount: feeRates.monthlyAmount })
      .from(feeRates).where(eq(feeRates.householdId, created.householdId));
    const dues = await testDatabase.db.select({ month: monthlyDues.month, amount: monthlyDues.amount, status: monthlyDues.status, feeRateId: monthlyDues.feeRateId })
      .from(monthlyDues).where(eq(monthlyDues.householdId, created.householdId)).orderBy(monthlyDues.month);

    expect(rates).toEqual([{ householdId: created.householdId, effectiveMonth: currentMonth, monthlyAmount: 32_000 }]);
    expect(dues).toHaveLength(12);
    expect(dues.filter((due) => due.month < currentMonth).every((due) => due.status === "not_due" && due.amount === 0 && due.feeRateId === null)).toBe(true);
    expect(dues.filter((due) => due.month >= currentMonth).every((due) => due.status === "unpaid" && due.amount === 32_000 && typeof due.feeRateId === "string")).toBe(true);
  });

  it.skipIf(Number(jakartaBusinessDate().slice(5, 7)) === 12)("charges a future joining month only from that month using the selected tier", async () => {
    const currentDate = jakartaBusinessDate();
    const currentMonth = Number(currentDate.slice(5, 7));
    const nextMonth = currentMonth + 1;
    const currentYear = Number(currentDate.slice(0, 4));
    const { chairman, rtUnitId } = await createChairmanFixture();
    await testDatabase.db.insert(billingYears).values({ rtUnitId, year: currentYear, status: "open" });

    const created = await createHouseholdResident(database, chairman, {
      newHouse: { number: "FUTURE-MONTH-01" },
      newHouseMonthlyAmount: 40_000,
      startsOn: currentYear + "-" + String(nextMonth).padStart(2, "0") + "-01",
      fullName: "Penghuni Bulan Depan",
      initialPin: "482913",
    }, currentDate);
    const [rate] = await testDatabase.db.select({ effectiveMonth: feeRates.effectiveMonth, monthlyAmount: feeRates.monthlyAmount })
      .from(feeRates).where(eq(feeRates.householdId, created.householdId));
    const dues = await testDatabase.db.select({ month: monthlyDues.month, amount: monthlyDues.amount, status: monthlyDues.status })
      .from(monthlyDues).where(eq(monthlyDues.householdId, created.householdId)).orderBy(monthlyDues.month);

    expect(rate).toEqual({ effectiveMonth: nextMonth, monthlyAmount: 40_000 });
    expect(dues).toHaveLength(12);
    expect(dues.filter((due) => due.month < nextMonth).every((due) => due.status === "not_due" && due.amount === 0)).toBe(true);
    expect(dues.filter((due) => due.month >= nextMonth).every((due) => due.status === "unpaid" && due.amount === 40_000)).toBe(true);
  });

  it("keeps the existing-house flow free of a forced tariff selection", async () => {
    const currentDate = jakartaBusinessDate();
    const currentMonth = Number(currentDate.slice(5, 7));
    const currentYear = Number(currentDate.slice(0, 4));
    const { chairman, rtUnitId } = await createChairmanFixture();
    const [year] = await testDatabase.db.insert(billingYears).values({ rtUnitId, year: currentYear, status: "open" })
      .returning({ id: billingYears.id });
    await createFeeRateFixture(testDatabase.db, {
      rtUnitId,
      billingYearId: year!.id,
      effectiveMonth: currentMonth,
      monthlyAmount: 40_000,
    });
    const [house] = await testDatabase.db.insert(houses).values({ rtUnitId, number: "EXISTING-HOUSE-01" })
      .returning({ id: houses.id });

    const created = await createHouseholdResident(database, chairman, {
      houseId: house!.id,
      startsOn: currentDate,
      fullName: "Penghuni Rumah Terdaftar",
      initialPin: "482913",
    }, currentDate);

    expect(await testDatabase.db.select({ id: feeRates.id }).from(feeRates)
      .where(eq(feeRates.householdId, created.householdId))).toHaveLength(0);
    const dues = await testDatabase.db.select({ month: monthlyDues.month, amount: monthlyDues.amount, status: monthlyDues.status })
      .from(monthlyDues).where(eq(monthlyDues.householdId, created.householdId));
    expect(dues).toHaveLength(12);
    expect(dues.filter((due) => due.month < currentMonth).every((due) => due.status === "not_due" && due.amount === 0)).toBe(true);
    expect(dues.filter((due) => due.month >= currentMonth).every((due) => due.status === "unpaid" && due.amount === 40_000)).toBe(true);
  });

  it("rolls back house, household, resident account, tariff, audit, and dues together", async () => {
    const currentDate = jakartaBusinessDate();
    const currentYear = Number(currentDate.slice(0, 4));
    const { chairman, rtUnitId } = await createChairmanFixture();
    const [year] = await testDatabase.db.insert(billingYears).values({ rtUnitId, year: currentYear, status: "open" })
      .returning({ id: billingYears.id });
    await testDatabase.db.delete(rtSettings).where(eq(rtSettings.rtUnitId, rtUnitId));

    await expect(createHouseholdResident(database, chairman, {
      newHouse: { number: "ROLLBACK-01" },
      newHouseMonthlyAmount: 32_000,
      startsOn: currentDate,
      fullName: "Penghuni Rollback",
      initialPin: "482913",
    }, currentDate)).rejects.toBeInstanceOf(HouseholdLifecycleInvariantError);

    expect(await testDatabase.db.select({ id: houses.id }).from(houses).where(eq(houses.number, "ROLLBACK-01"))).toHaveLength(0);
    expect(await testDatabase.db.select({ id: households.id }).from(households).where(eq(households.rtUnitId, rtUnitId))).toHaveLength(1);
    expect(await testDatabase.db.select({ id: people.id }).from(people).where(eq(people.fullName, "Penghuni Rollback"))).toHaveLength(0);
    expect(await testDatabase.db.select({ id: appAccounts.id }).from(appAccounts).where(eq(appAccounts.loginIdentifier, "ROLLBACK-01"))).toHaveLength(0);
    expect(await testDatabase.db.select({ id: authUser.id }).from(authUser).where(eq(authUser.name, "Penghuni Rollback"))).toHaveLength(0);
    expect(await testDatabase.db.select({ id: feeRates.id }).from(feeRates).where(eq(feeRates.billingYearId, year!.id))).toHaveLength(0);
    expect(await testDatabase.db.select({ id: monthlyDues.id }).from(monthlyDues).where(eq(monthlyDues.billingYearId, year!.id))).toHaveLength(0);
    expect(await testDatabase.db.select({ id: auditEvents.id }).from(auditEvents).where(and(
      eq(auditEvents.action, "fee_rate.created"),
      eq(auditEvents.actorAppAccountId, chairman.appAccountId),
    ))).toHaveLength(0);
  });

  it("leaves old tariff, paid dues, payment ledger, and allocations unchanged", async () => {
    const currentDate = jakartaBusinessDate();
    const currentYear = Number(currentDate.slice(0, 4));
    const { chairman, rtUnitId, original } = await createChairmanFixture();
    const [year] = await testDatabase.db.insert(billingYears).values({ rtUnitId, year: currentYear, status: "open" })
      .returning({ id: billingYears.id });
    const [generalRate] = await createFeeRateFixture(testDatabase.db, {
      rtUnitId,
      billingYearId: year!.id,
      effectiveMonth: 1,
      monthlyAmount: 40_000,
    });
    await addOldAnnualDues(rtUnitId, original.householdId, year!.id);

    const treasurerAuth = await createAuthUser(testDatabase.db, "F12 history treasurer");
    const [treasurerAccount] = await testDatabase.db.insert(appAccounts).values({
      rtUnitId,
      authUserId: treasurerAuth.id,
      accountType: "official",
      loginIdentifier: "treasurer-" + randomUUID(),
      personId: original.personId,
    }).returning({ id: appAccounts.id });
    await testDatabase.db.insert(officialAssignments).values({
      rtUnitId,
      appAccountId: treasurerAccount!.id,
      role: "treasurer",
      startsOn: "2020-01-01",
    });
    const treasurer: Principal = {
      authUserId: treasurerAuth.id,
      appAccountId: treasurerAccount!.id,
      role: "treasurer",
      rtUnitId,
      householdId: null,
      personId: original.personId,
    };
    await recordTreasurerCashPayment(database, treasurer, {
      householdId: original.householdId,
      period: String(currentYear) + "-01",
      idempotencyKey: randomUUID(),
    }, currentDate);

    const oldDuesBefore = await testDatabase.db.select().from(monthlyDues).where(eq(monthlyDues.householdId, original.householdId));
    const oldRateBefore = await testDatabase.db.select().from(feeRates).where(eq(feeRates.id, generalRate!.id));
    const paymentsBefore = await testDatabase.db.select().from(payments).where(eq(payments.rtUnitId, rtUnitId));
    const allocationsBefore = await testDatabase.db.select().from(paymentAllocations).where(eq(paymentAllocations.rtUnitId, rtUnitId));

    await createHouseholdResident(database, chairman, {
      newHouse: { number: "NEW-HISTORY-01" },
      newHouseMonthlyAmount: 32_000,
      startsOn: currentDate,
      fullName: "Penghuni Baru Tanpa Ubah Riwayat",
      initialPin: "482913",
    }, currentDate);

    expect(await testDatabase.db.select().from(monthlyDues).where(eq(monthlyDues.householdId, original.householdId))).toEqual(oldDuesBefore);
    expect(await testDatabase.db.select().from(feeRates).where(eq(feeRates.id, generalRate!.id))).toEqual(oldRateBefore);
    expect(await testDatabase.db.select().from(payments).where(eq(payments.rtUnitId, rtUnitId))).toEqual(paymentsBefore);
    expect(await testDatabase.db.select().from(paymentAllocations).where(eq(paymentAllocations.rtUnitId, rtUnitId))).toEqual(allocationsBefore);
  });

  it("rejects a future-year tariff and leaves no partial new-house records", async () => {
    const { chairman, rtUnitId } = await createChairmanFixture();
    const currentDate = jakartaBusinessDate();
    const currentYear = Number(currentDate.slice(0, 4));
    await testDatabase.db.insert(billingYears).values({ rtUnitId, year: currentYear + 1, status: "open" });

    await expect(createHouseholdResident(database, chairman, {
      newHouse: { number: "FUTURE-YEAR-01" },
      newHouseMonthlyAmount: 40_000,
      startsOn: `${currentYear + 1}-01-01`,
      fullName: "Penghuni Masa Depan",
      initialPin: "482913",
    }, currentDate)).rejects.toBeInstanceOf(HouseholdConflictError);

    expect(await testDatabase.db.select({ id: houses.id }).from(houses).where(eq(houses.number, "FUTURE-YEAR-01"))).toHaveLength(0);
    expect(await testDatabase.db.select({ id: households.id }).from(households).innerJoin(houses, eq(houses.id, households.houseId)).where(eq(houses.number, "FUTURE-YEAR-01"))).toHaveLength(0);
    expect(await testDatabase.db.select({ id: people.id }).from(people).where(eq(people.fullName, "Penghuni Masa Depan"))).toHaveLength(0);
    expect(await testDatabase.db.select({ id: feeRates.id }).from(feeRates).where(eq(feeRates.rtUnitId, rtUnitId))).toHaveLength(0);
    expect(await testDatabase.db.select({ id: monthlyDues.id }).from(monthlyDues).where(eq(monthlyDues.rtUnitId, rtUnitId))).toHaveLength(0);

    await testDatabase.db.update(billingYears).set({ status: "closed" }).where(and(
      eq(billingYears.rtUnitId, rtUnitId), eq(billingYears.year, currentYear + 1),
    ));
    await testDatabase.db.insert(billingYears).values({ rtUnitId, year: currentYear, status: "closed" });
    await expect(createHouseholdResident(database, chairman, {
      newHouse: { number: "CLOSED-YEAR-01" },
      newHouseMonthlyAmount: 40_000,
      startsOn: currentDate,
      fullName: "Penghuni Tahun Tertutup",
      initialPin: "482913",
    }, currentDate)).rejects.toBeInstanceOf(HouseholdConflictError);
    expect(await testDatabase.db.select({ id: houses.id }).from(houses).where(eq(houses.number, "CLOSED-YEAR-01"))).toHaveLength(0);
  });

  it("uses a generic safe code for other wrapped unique violations and rolls the create back", async () => {
    const { chairman, rtUnitId } = await createChairmanFixture();
    const currentDate = jakartaBusinessDate();
    const currentYear = Number(currentDate.slice(0, 4));
    await testDatabase.db.insert(billingYears).values({ rtUnitId, year: currentYear, status: "open" });
    const functionName = `phase12_generic_conflict_${randomUUID().replaceAll("-", "")}`;
    const triggerName = `${functionName}_trigger`;
    await testDatabase.client.exec(`
      CREATE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'household.created' THEN
          RAISE EXCEPTION 'forced household conflict' USING ERRCODE = '23505', CONSTRAINT = 'private_constraint_marker';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION public.${functionName}();
    `);

    try {
      await expect(createHouseholdResident(database, chairman, {
        newHouse: { number: "GENERIC-CONFLICT" },
        newHouseMonthlyAmount: 32_000,
        startsOn: currentDate,
        fullName: "Penghuni Baru",
        initialPin: "482913",
      }, currentDate)).rejects.toMatchObject({ code: "GENERIC_CONFLICT" });
    } finally {
      await testDatabase.client.exec(`DROP TRIGGER ${triggerName} ON public.audit_events; DROP FUNCTION public.${functionName}();`);
    }

    expect(await testDatabase.db.select({ id: houses.id }).from(houses).where(and(
      eq(houses.rtUnitId, rtUnitId),
      eq(houses.number, "GENERIC-CONFLICT"),
    ))).toHaveLength(0);
  });

  it("edits only the resident profile and house label, and records changed field names", async () => {
    const { chairman, rtUnitId } = await createChairmanFixture();
    await openBillingYear(rtUnitId);
    const created = await createHouseholdResident(database, chairman, {
      newHouse: { number: "B-02" },
      newHouseMonthlyAmount: 40_000,
      startsOn: "2026-11-15",
      fullName: "Nama Sebelum",
      phone: "081234567890",
      initialPin: "543210",
    }, businessDate);
    const beforeDues = await testDatabase.db.select().from(monthlyDues).where(eq(monthlyDues.householdId, created.householdId));

    const edited = await updateHouseholdResident(database, chairman, {
      householdId: created.householdId,
      personId: created.personId,
      fullName: "Nama Sesudah",
      phone: "+62 812 3456 7890",
      houseLabel: "Blok B",
    }, businessDate);
    const [person] = await testDatabase.db.select().from(people).where(eq(people.id, created.personId));
    const [house] = await testDatabase.db.select({ label: houses.label })
      .from(houses).where(eq(houses.id, created.houseId));
    const [account] = await testDatabase.db.select({ authUserId: appAccounts.authUserId })
      .from(appAccounts).where(eq(appAccounts.id, created.residentAccountId));
    const [updatedAuthUser] = await testDatabase.db.select({ name: authUser.name })
      .from(authUser).where(eq(authUser.id, account!.authUserId));
    const afterDues = await testDatabase.db.select().from(monthlyDues).where(eq(monthlyDues.householdId, created.householdId));
    const [audit] = await testDatabase.db.select().from(auditEvents).where(and(
      eq(auditEvents.action, "household.updated"),
      eq(auditEvents.entityId, created.householdId),
    ));

    expect(edited.changedFields).toEqual(["fullName", "houseLabel", "phone"]);
    expect(person).toMatchObject({ fullName: "Nama Sesudah", phone: "+62 812 3456 7890" });
    expect(house?.label).toBe("Blok B");
    expect(updatedAuthUser?.name).toBe("Nama Sesudah");
    expect(afterDues).toEqual(beforeDues);
    expect(audit?.context).toEqual({ changedFields: "fullName,houseLabel,phone" });
    expect(JSON.stringify(audit?.context)).not.toContain("Nama Sesudah");
    await expect(updateHouseholdResident(database, chairman, {
      householdId: created.householdId,
      personId: created.personId,
      rtUnitId,
    } as never, businessDate)).rejects.toBeInstanceOf(InvalidHouseholdInputError);
  });

  it("deactivates without waiving active-period dues and revokes sessions", async () => {
    const { chairman, rtUnitId, original } = await createChairmanFixture();
    const account = await addResidentAccount({
      rtUnitId,
      houseId: original.houseId,
      householdId: original.householdId,
      personId: original.personId,
    });
    await addSession(account.authUserId);
    const billingYearId = await openBillingYear(rtUnitId);
    await addOldAnnualDues(rtUnitId, original.householdId, billingYearId);

    const result = await deactivateHousehold(database, chairman, {
      householdId: original.householdId,
      effectiveMonth: "2026-10",
      reason: "Pindah domisili sesuai permohonan",
    }, businessDate);
    const [household] = await testDatabase.db.select().from(households).where(eq(households.id, original.householdId));
    const [person] = await testDatabase.db.select().from(people).where(eq(people.id, original.personId));
    const [residentAccount] = await testDatabase.db.select().from(appAccounts).where(eq(appAccounts.id, account.appAccountId));
    const dues = await testDatabase.db.select({ month: monthlyDues.month, status: monthlyDues.status })
      .from(monthlyDues).where(eq(monthlyDues.householdId, original.householdId)).orderBy(monthlyDues.month);
    const sessions = await testDatabase.db.select().from(authSession).where(eq(authSession.userId, account.authUserId));
    const audits = await testDatabase.db.select().from(auditEvents).where(and(
      eq(auditEvents.action, "household.deactivated"),
      eq(auditEvents.entityId, original.householdId),
    ));

    expect(result).toMatchObject({ effectiveDate: "2026-10-31", disabledAccountCount: 1, revokedSessionCount: 1, transitionedDueCount: 2 });
    expect(household).toMatchObject({ status: "inactive", endsOn: "2026-10-31" });
    expect(person?.isActive).toBe(false);
    expect(residentAccount?.status).toBe("disabled");
    expect(sessions).toHaveLength(0);
    expect(dues.filter((due) => due.month <= 10).every((due) => due.status === "unpaid")).toBe(true);
    expect(dues.filter((due) => due.month >= 11).every((due) => due.status === "not_due")).toBe(true);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.reason).toBe("Pindah domisili sesuai permohonan");
    expect(audits[0]?.context).toEqual({
      disabledAccountCount: 1,
      effectiveEndDate: "2026-10-31",
      revokedSessionCount: 1,
      transitionedDueCount: 2,
    });
  });

  it("rejects deactivation when an already-NOT_DUE post-end row has legacy adjustment history", async () => {
    const { chairman, rtUnitId, original } = await createChairmanFixture();
    const account = await addResidentAccount({
      rtUnitId,
      houseId: original.houseId,
      householdId: original.householdId,
      personId: original.personId,
    });
    const billingYearId = await openBillingYear(rtUnitId);
    const dues = await addOldAnnualDues(rtUnitId, original.householdId, billingYearId, [11, 12]);
    const postEndNotDue = dues.find((due) => due.month === 11)!;

    // Model pre-existing invalid legacy ledger data. Current DB ledger guards
    // prevent adjustments on NOT_DUE rows; this verifies service fail-closed
    // behavior if such a row is nevertheless encountered.
    await testDatabase.client.exec("ALTER TABLE public.due_adjustments DISABLE TRIGGER USER");
    try {
      await testDatabase.db.insert(dueAdjustments).values({
        rtUnitId,
        householdId: original.householdId,
        monthlyDueId: postEndNotDue.id,
        amountDelta: 1,
        effectiveTargetAfter: 40_001,
        reason: "Legacy fixture anomaly",
        adjustedByAccountId: chairman.appAccountId,
        adjustedByAccountType: "official",
        idempotencyKey: randomUUID(),
        requestFingerprint: "a".repeat(64),
      });
    } finally {
      await testDatabase.client.exec("ALTER TABLE public.due_adjustments ENABLE TRIGGER USER");
    }

    await expect(deactivateHousehold(database, chairman, {
      householdId: original.householdId,
      effectiveMonth: "2026-10",
      reason: "Menutup masa huni dengan anomali riwayat",
    }, businessDate)).rejects.toBeInstanceOf(HouseholdConflictError);

    const [household] = await testDatabase.db.select({ status: households.status })
      .from(households).where(eq(households.id, original.householdId));
    const [residentAccount] = await testDatabase.db.select({ status: appAccounts.status })
      .from(appAccounts).where(eq(appAccounts.id, account.appAccountId));
    expect(household?.status).toBe("active");
    expect(residentAccount?.status).toBe("active");
  });

  it("replaces a resident at the same house with new identity, login access, and no inherited dues", async () => {
    const { chairman, rtUnitId, original } = await createChairmanFixture();
    const account = await addResidentAccount({
      rtUnitId,
      houseId: original.houseId,
      householdId: original.householdId,
      personId: original.personId,
    });
    await addSession(account.authUserId);
    const billingYearId = await openBillingYear(rtUnitId);
    await addOldAnnualDues(rtUnitId, original.householdId, billingYearId);

    const replaced = await replaceHouseholdResident(database, chairman, {
      householdId: original.householdId,
      effectiveMonth: "2026-11",
      fullName: "Penghuni Pengganti",
      phone: "081298765432",
      initialPin: "654321",
      reason: "Pergantian penghuni setelah serah terima",
    }, businessDate);
    const [oldAccount] = await testDatabase.db.select().from(appAccounts).where(eq(appAccounts.id, account.appAccountId));
    const [newAccount] = await testDatabase.db.select({ authUserId: appAccounts.authUserId })
      .from(appAccounts).where(eq(appAccounts.id, replaced.newResidentAccountId));
    const [oldHousehold] = await testDatabase.db.select().from(households).where(eq(households.id, original.householdId));
    const [newHousehold] = await testDatabase.db.select().from(households).where(eq(households.id, replaced.newHouseholdId));
    const oldDues = await testDatabase.db.select({ month: monthlyDues.month, status: monthlyDues.status })
      .from(monthlyDues).where(eq(monthlyDues.householdId, original.householdId)).orderBy(monthlyDues.month);
    const newDues = await testDatabase.db.select({ month: monthlyDues.month, status: monthlyDues.status })
      .from(monthlyDues).where(eq(monthlyDues.householdId, replaced.newHouseholdId)).orderBy(monthlyDues.month);
    const houseNumber = await testDatabase.db.select({ number: houses.number }).from(houses).where(eq(houses.id, original.houseId));
    const resolvedLogin = await findUniqueLoginAccount(database, "resident", houseNumber[0]!.number.toLowerCase());
    const sessions = await testDatabase.db.select().from(authSession).where(eq(authSession.userId, account.authUserId));
    const [replacementAudit] = await testDatabase.db.select().from(auditEvents).where(and(
      eq(auditEvents.action, "household.resident_replaced"),
      eq(auditEvents.entityId, original.householdId),
    ));

    expect(replaced).toMatchObject({
      effectiveDate: "2026-11-01",
      transitionedDueCount: 2,
      generatedDueCount: 12,
    });
    expect(oldAccount?.status).toBe("disabled");
    expect(sessions).toHaveLength(0);
    await expect(resolvePrincipalForUser(database, account.authUserId, businessDate)).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(resolvePrincipalForUser(database, newAccount!.authUserId, businessDate)).rejects.toBeInstanceOf(UnauthenticatedError);
    const newPrincipal = await resolvePrincipalForUser(database, newAccount!.authUserId, "2026-11-01");
    expect(newPrincipal).toMatchObject({ householdId: replaced.newHouseholdId, personId: replaced.newPersonId, role: "resident" });
    expect(oldHousehold).toMatchObject({ status: "inactive", endsOn: "2026-10-31" });
    expect(newHousehold).toMatchObject({ status: "active", startsOn: "2026-11-01", endsOn: null });
    expect(oldDues.filter((due) => due.month <= 10).every((due) => due.status === "unpaid")).toBe(true);
    expect(oldDues.filter((due) => due.month >= 11).every((due) => due.status === "not_due")).toBe(true);
    expect(newDues.filter((due) => due.month <= 10).every((due) => due.status === "not_due")).toBe(true);
    expect(newDues.filter((due) => due.month >= 11).every((due) => due.status === "unpaid")).toBe(true);
    expect(resolvedLogin?.id).toBe(replaced.newResidentAccountId);
    expect(replacementAudit?.reason).toBe("Pergantian penghuni setelah serah terima");
    expect(replacementAudit?.context).toMatchObject({
      effectiveDate: "2026-11-01",
      newAccountId: replaced.newResidentAccountId,
      newHouseholdId: replaced.newHouseholdId,
      oldAccountId: account.appAccountId,
      oldHouseholdId: original.householdId,
    });
    expect(houseNumber[0]?.number).toBeTruthy();
  });

  it("rolls back a deactivation when the critical audit insert fails", async () => {
    const { chairman, rtUnitId, original } = await createChairmanFixture();
    const account = await addResidentAccount({
      rtUnitId,
      houseId: original.houseId,
      householdId: original.householdId,
      personId: original.personId,
    });
    const functionName = `phase12_audit_failure_${randomUUID().replaceAll("-", "")}`;
    const triggerName = `${functionName}_trigger`;
    await testDatabase.client.exec(`
      CREATE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'household.deactivated' THEN
          RAISE EXCEPTION 'forced phase 12 audit failure' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION public.${functionName}();
    `);

    try {
      await expect(deactivateHousehold(database, chairman, {
        householdId: original.householdId,
        effectiveMonth: "2026-10",
        reason: "Perpindahan warga",
      }, businessDate)).rejects.toThrow();
    } finally {
      await testDatabase.client.exec(`DROP TRIGGER ${triggerName} ON public.audit_events; DROP FUNCTION public.${functionName}();`);
    }

    const [household] = await testDatabase.db.select().from(households).where(eq(households.id, original.householdId));
    const [person] = await testDatabase.db.select().from(people).where(eq(people.id, original.personId));
    const [residentAccount] = await testDatabase.db.select().from(appAccounts).where(eq(appAccounts.id, account.appAccountId));
    const auditRows = await testDatabase.db.select().from(auditEvents).where(and(
      eq(auditEvents.action, "household.deactivated"),
      eq(auditEvents.entityId, original.householdId),
    ));
    expect(household?.status).toBe("active");
    expect(household?.endsOn).toBeNull();
    expect(person?.isActive).toBe(true);
    expect(residentAccount?.status).toBe("active");
    expect(auditRows).toHaveLength(0);
  });

  it("rejects non-Chairman lifecycle calls before any mutation", async () => {
    const { chairman, rtUnitId } = await createChairmanFixture();
    const treasurer = { ...chairman, role: "treasurer" as const };
    await expect(createHouseholdResident(database, treasurer, {
      newHouse: { number: "NO-ACCESS" },
      startsOn: businessDate,
      fullName: "Tidak dibuat",
      initialPin: "112233",
    }, businessDate)).rejects.toBeInstanceOf(HouseholdForbiddenError);
    const [house] = await testDatabase.db.select().from(houses).where(and(
      eq(houses.rtUnitId, rtUnitId),
      eq(houses.number, "NO-ACCESS"),
    ));
    expect(house).toBeUndefined();
  });
});
