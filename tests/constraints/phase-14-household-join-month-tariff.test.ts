import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditEvents,
  billingYears,
  feeRates,
  households,
  houses,
} from "../../src/db/schema";
import { jakartaBusinessDate } from "../../src/lib/officials/lifecycle";
import { createHousehold, createRt, createTestDatabase, ensureTestChairman } from "../helpers/database";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

async function sqlErrorCode(operation: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await operation();
    return undefined;
  } catch (error) {
    let current: unknown = error;
    while (current && typeof current === "object") {
      const candidate = current as { code?: unknown; cause?: unknown };
      if (typeof candidate.code === "string") return candidate.code;
      current = candidate.cause;
    }
    return undefined;
  }
}

describe("F14 new-house current-month tariff constraint", () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
  });

  afterAll(async () => {
    await testDatabase?.close();
  });

  async function createCurrentYear(rtUnitId: string) {
    const currentDate = jakartaBusinessDate();
    const [year] = await testDatabase.db.insert(billingYears).values({
      rtUnitId,
      year: Number(currentDate.slice(0, 4)),
      status: "open",
    }).returning({ id: billingYears.id });
    const actorAccountId = await ensureTestChairman(testDatabase.db, rtUnitId);
    return { billingYearId: year!.id, actorAccountId, currentDate, currentMonth: Number(currentDate.slice(5, 7)) };
  }

  async function insertFreshHousehold(
    transaction: Parameters<Parameters<TestDatabase["db"]["transaction"]>[0]>[0],
    rtUnitId: string,
    startsOn: string,
  ) {
    const [house] = await transaction.insert(houses).values({
      rtUnitId,
      number: "F14-" + randomUUID().slice(0, 8),
    }).returning({ id: houses.id });
    const [household] = await transaction.insert(households).values({
      rtUnitId,
      houseId: house!.id,
      startsOn,
      status: "active",
    }).returning({ id: households.id });
    return household!.id;
  }

  async function insertHouseholdRate(
    transaction: Parameters<Parameters<TestDatabase["db"]["transaction"]>[0]>[0],
    input: {
      rtUnitId: string;
      billingYearId: string;
      householdId: string | null;
      actorAccountId: string;
      effectiveMonth: number;
      monthlyAmount?: number;
      idempotencyKey?: string;
    },
  ) {
    const monthlyAmount = input.monthlyAmount ?? 40_000;
    const [year] = await transaction.select({ year: billingYears.year })
      .from(billingYears).where(eq(billingYears.id, input.billingYearId)).limit(1);
    const requestFingerprint = createHash("sha256").update(JSON.stringify({
      version: 1,
      billingYearId: input.billingYearId,
      effectiveMonth: input.effectiveMonth,
      monthlyAmount,
    })).digest("hex");
    const [rate] = await transaction.insert(feeRates).values({
      rtUnitId: input.rtUnitId,
      billingYearId: input.billingYearId,
      householdId: input.householdId,
      effectiveMonth: input.effectiveMonth,
      monthlyAmount,
      createdByAccountId: input.actorAccountId,
      createdByAccountType: "official",
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      requestFingerprint,
    }).returning({ id: feeRates.id });
    await transaction.insert(auditEvents).values({
      actorAppAccountId: input.actorAccountId,
      action: "fee_rate.created",
      entityType: "fee_rate",
      entityId: rate!.id,
      reason: null,
      context: {
        period: String(year!.year) + "-" + String(input.effectiveMonth).padStart(2, "0"),
        monthlyAmount,
      },
    });
    return rate!.id;
  }

  it("allows a current-month household tariff only for a new household with no dues", async () => {
    const rtUnitId = await createRt(testDatabase.db);
    const { billingYearId, actorAccountId, currentDate, currentMonth } = await createCurrentYear(rtUnitId);
    let householdId = "";

    await testDatabase.db.transaction(async (transaction) => {
      householdId = await insertFreshHousehold(transaction, rtUnitId, currentDate);
      await insertHouseholdRate(transaction, {
        rtUnitId,
        billingYearId,
        householdId,
        actorAccountId,
        effectiveMonth: currentMonth,
      });
    });

    const rates = await testDatabase.db.select({
      householdId: feeRates.householdId,
      effectiveMonth: feeRates.effectiveMonth,
      monthlyAmount: feeRates.monthlyAmount,
      createdByAccountId: feeRates.createdByAccountId,
      idempotencyKey: feeRates.idempotencyKey,
      requestFingerprint: feeRates.requestFingerprint,
    }).from(feeRates).where(eq(feeRates.householdId, householdId));
    const audits = await testDatabase.db.select({ id: auditEvents.id }).from(auditEvents).where(and(
      eq(auditEvents.action, "fee_rate.created"),
      eq(auditEvents.entityId, (await testDatabase.db.select({ id: feeRates.id }).from(feeRates)
        .where(eq(feeRates.householdId, householdId)))[0]!.id),
    ));
    expect(rates).toHaveLength(1);
    expect(rates[0]).toMatchObject({
      householdId,
      effectiveMonth: currentMonth,
      monthlyAmount: 40_000,
      createdByAccountId: actorAccountId,
    });
    expect(rates[0]?.idempotencyKey).toBeTruthy();
    expect(rates[0]?.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(audits).toHaveLength(1);
  });

  it("continues to reject a current-month general tariff", async () => {
    const rtUnitId = await createRt(testDatabase.db);
    const { billingYearId, actorAccountId, currentMonth } = await createCurrentYear(rtUnitId);

    const code = await sqlErrorCode(() => testDatabase.db.transaction(async (transaction) => {
      await insertHouseholdRate(transaction, {
        rtUnitId,
        billingYearId,
        householdId: null,
        actorAccountId,
        effectiveMonth: currentMonth,
      });
    }));

    expect(code).toBe("23514");
    expect(await testDatabase.db.select({ id: feeRates.id }).from(feeRates)
      .where(eq(feeRates.billingYearId, billingYearId))).toHaveLength(0);
  });

  it("continues to reject same-month rates for households that existed before this transaction", async () => {
    const rtUnitId = await createRt(testDatabase.db);
    const existing = await createHousehold(testDatabase.db, rtUnitId);
    const { billingYearId, actorAccountId, currentMonth } = await createCurrentYear(rtUnitId);

    const code = await sqlErrorCode(() => testDatabase.db.transaction(async (transaction) => {
      await insertHouseholdRate(transaction, {
        rtUnitId,
        billingYearId,
        householdId: existing.householdId,
        actorAccountId,
        effectiveMonth: currentMonth,
      });
    }));

    expect(code).toBe("23514");
    expect(await testDatabase.db.select({ id: feeRates.id }).from(feeRates)
      .where(eq(feeRates.billingYearId, billingYearId))).toHaveLength(0);
  });

  it("keeps fee-rate idempotency keys unique across household rows", async () => {
    const rtUnitId = await createRt(testDatabase.db);
    const { billingYearId, actorAccountId, currentDate, currentMonth } = await createCurrentYear(rtUnitId);
    const idempotencyKey = randomUUID();

    const code = await sqlErrorCode(() => testDatabase.db.transaction(async (transaction) => {
      const firstHouseholdId = await insertFreshHousehold(transaction, rtUnitId, currentDate);
      const secondHouseholdId = await insertFreshHousehold(transaction, rtUnitId, currentDate);
      await insertHouseholdRate(transaction, {
        rtUnitId,
        billingYearId,
        householdId: firstHouseholdId,
        actorAccountId,
        effectiveMonth: currentMonth,
        idempotencyKey,
      });
      await insertHouseholdRate(transaction, {
        rtUnitId,
        billingYearId,
        householdId: secondHouseholdId,
        actorAccountId,
        effectiveMonth: currentMonth,
        idempotencyKey,
      });
    }));

    expect(code).toBe("23505");
    expect(await testDatabase.db.select({ id: feeRates.id }).from(feeRates)
      .where(and(eq(feeRates.rtUnitId, rtUnitId), eq(feeRates.billingYearId, billingYearId)))).toHaveLength(0);
  });
});
