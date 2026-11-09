import { inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AppDatabase } from "@/db/client";
import { monthlyDues } from "@/db/schema";

export type DueFinancialBalance = {
  monthlyDueId: string;
  rtUnitId: string;
  householdId: string;
  status: "unpaid" | "paid" | "waived" | "not_due";
  originalAmount: number;
  adjustmentTotal: number;
  recordedAmount: number | null;
  importedOpeningBalance: number;
  effectiveTarget: number;
  collectionTarget: number;
  activeReceived: number;
  outstanding: number;
  hasPendingRequest: boolean;
};

type BalanceQueryExecutor = Pick<AppDatabase, "select">;

function safeAmount(value: string | number, field: string) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Stored ${field} is outside the safe integer range.`);
  }
  return amount;
}

/**
 * Read the canonical effective balance for each due. Aggregate queries are
 * isolated per due so adjustment and allocation rows cannot multiply each
 * other through a join.
 */
export async function getDueFinancialBalances(
  database: BalanceQueryExecutor,
  dueIds?: readonly string[],
): Promise<DueFinancialBalance[]> {
  if (dueIds?.length === 0) return [];

  const due = alias(monthlyDues, "due");
  const conditions = dueIds ? inArray(due.id, [...dueIds]) : undefined;
  const dueIdColumn = sql.raw('"due"."id"');
  const dueRtUnitColumn = sql.raw('"due"."rt_unit_id"');
  const dueHouseholdColumn = sql.raw('"due"."household_id"');
  const rows = await database
    .select({
      monthlyDueId: due.id,
      rtUnitId: due.rtUnitId,
      householdId: due.householdId,
      status: due.status,
      originalAmount: due.amount,
      recordedAmount: sql<string | null>`(
        select correction.recorded_amount::text
        from public.monthly_due_recording_corrections correction
        where correction.monthly_due_id = ${dueIdColumn}
          and correction.rt_unit_id = ${dueRtUnitColumn}
          and correction.household_id = ${dueHouseholdColumn}
      )`,
      correctionCollectionTarget: sql<string | null>`(
        select correction.collection_target_amount::text
        from public.monthly_due_recording_corrections correction
        where correction.monthly_due_id = ${dueIdColumn}
          and correction.rt_unit_id = ${dueRtUnitColumn}
          and correction.household_id = ${dueHouseholdColumn}
      )`,
      adjustmentTotal: sql<string>`coalesce((
        select sum(adjustment.amount_delta)
        from public.due_adjustments adjustment
        where adjustment.monthly_due_id = ${dueIdColumn}
          and adjustment.rt_unit_id = ${dueRtUnitColumn}
          and adjustment.household_id = ${dueHouseholdColumn}
      ), 0)::text`,
      importedOpeningBalance: sql<string>`coalesce((
        select sum(opening.amount)
        from public.sheet2_opening_balance_items opening
        where opening.monthly_due_id = ${dueIdColumn}
          and opening.rt_unit_id = ${dueRtUnitColumn}
          and opening.household_id = ${dueHouseholdColumn}
      ), 0)::text`,
      activeReceived: sql<string>`coalesce((
        select sum(allocation.amount)
        from public.payment_allocations allocation
        join public.payments payment
          on payment.id = allocation.payment_id
         and payment.rt_unit_id = allocation.rt_unit_id
         and payment.household_id = allocation.household_id
        where allocation.monthly_due_id = ${dueIdColumn}
          and allocation.rt_unit_id = ${dueRtUnitColumn}
          and allocation.household_id = ${dueHouseholdColumn}
          and not exists (
            select 1 from public.payment_reversals reversal
            where reversal.payment_id = payment.id
          )
      ), 0)::text`,
      hasPendingRequest: sql<boolean>`exists (
        select 1
        from public.payment_request_claims claim
        join public.payment_requests request on request.id = claim.request_id
        where claim.monthly_due_id = ${dueIdColumn}
          and request.status = 'pending'
      )`,
    })
    .from(due)
    .where(conditions);

  return rows.map((row) => {
    const originalAmount = safeAmount(row.originalAmount, "original amount");
    const adjustmentTotal = safeAmount(row.adjustmentTotal, "adjustment total");
    const recordedAmount = row.recordedAmount === null ? null : safeAmount(row.recordedAmount, "recorded amount");
    const correctionCollectionTarget = row.correctionCollectionTarget === null
      ? originalAmount
      : safeAmount(row.correctionCollectionTarget, "collection target");
    const importedOpeningBalance = safeAmount(row.importedOpeningBalance, "imported opening balance");
    const activePaymentReceived = safeAmount(row.activeReceived, "active received total");
    const activeReceived = safeAmount(activePaymentReceived + importedOpeningBalance, "combined received total");
    const effectiveTarget = safeAmount(originalAmount + adjustmentTotal, "effective target");
    const collectionTarget = safeAmount(correctionCollectionTarget + adjustmentTotal, "collection target");
    const outstanding = safeAmount(collectionTarget - activeReceived, "outstanding balance");
    if (
      effectiveTarget < 0 ||
      collectionTarget < 0 ||
      (collectionTarget === 0 && row.status !== "not_due") ||
      activeReceived < 0 ||
      outstanding < 0 ||
      (recordedAmount !== null && recordedAmount <= 0)
    ) {
      throw new Error("Stored due financial balance violates the F11 balance invariant.");
    }
    return {
      monthlyDueId: row.monthlyDueId,
      rtUnitId: row.rtUnitId,
      householdId: row.householdId,
      status: row.status,
      originalAmount,
      adjustmentTotal,
      recordedAmount,
      importedOpeningBalance,
      effectiveTarget,
      collectionTarget,
      activeReceived,
      outstanding,
      hasPendingRequest: row.hasPendingRequest,
    };
  });
}
