import { ReportInvariantError } from "./errors";

export type ReportDueStatus = "unpaid" | "paid" | "waived" | "not_due";
export type PaymentMethod = "transfer" | "cash";

export type ReportAmounts = {
  target: number;
  effectiveTarget: number;
  received: number;
  openingBalanceReceived: number;
  transferReceived: number;
  cashReceived: number;
  waived: number;
  outstanding: number;
};

export type ReportCounts = {
  obligationCount: number;
  waivedCount: number;
  notDueCount: number;
  overdueCount: number;
};

export type ReportTotals = ReportAmounts & ReportCounts;

export type MonthlyReportTotals = ReportTotals & {
  month: number;
};

export type ArrearsPeriod = {
  month: number;
  dueDate: string;
  outstanding: number;
  pending: boolean;
};

export type ArrearsHousehold = {
  houseNumber: string;
  houseLabel: string | null;
  residentNames: string[];
  lifecycle: "active" | "historical";
  startsOn: string;
  endsOn: string | null;
  totalOutstanding: number;
  pending: boolean;
  periods: ArrearsPeriod[];
};

export type HouseholdMatrixCell = ReportAmounts & {
  month: number;
  dueDate: string | null;
  status: ReportDueStatus | "no_data";
  recordedAmount: number | null;
  pending: boolean;
  overdue: boolean;
  latestPaymentAt: string | null;
};

export type HouseholdMatrixRow = Omit<ReportHouseholdIdentity, "householdId" | "rtUnitId"> & {
  key: number;
  months: HouseholdMatrixCell[];
  latestPaymentAt: string | null;
};

export type RtFinancialReportResponse = {
  year: number;
  availableYears: number[];
  asOf: {
    businessDate: string;
    period: string;
  };
  dueNowOutstanding: number;
  futureUnpaidOutstanding: number;
  yearly: ReportTotals;
  monthly: MonthlyReportTotals[];
  householdMatrix: HouseholdMatrixRow[];
  arrears: {
    totalOutstanding: number;
    count: number;
    householdCount: number;
    households: ArrearsHousehold[];
  };
};

export type ReportHouseholdIdentity = {
  householdId: string;
  rtUnitId: string;
  houseNumber: string;
  houseLabel: string | null;
  residentNames: readonly string[];
  lifecycle: "active" | "historical";
  startsOn: string;
  endsOn: string | null;
};

export type ReportDueInput = {
  monthlyDueId: string;
  household: ReportHouseholdIdentity;
  year: number;
  month: number;
  dueDate: string;
  status: ReportDueStatus;
  originalAmount: number;
  recordedAmount?: number | null;
  adjustmentTotal: number;
  activeReceived: number;
  importedOpeningBalance: number;
  transferReceived: number;
  cashReceived: number;
  waiverAmount: number;
  hasPendingRequest: boolean;
  latestPaymentAt?: string | null;
};

export type AllocationMethodRow = {
  monthlyDueId: string;
  rtUnitId: string;
  householdId: string;
  method: string;
  amount: number | string;
  paymentReversed: boolean;
  verifiedAt: Date | string;
};

export type ActiveMethodTotals = {
  transferReceived: number;
  cashReceived: number;
  latestPaymentAt: string | null;
};

const ZERO_TOTALS: ReportTotals = {
  target: 0,
  effectiveTarget: 0,
  received: 0,
  openingBalanceReceived: 0,
  transferReceived: 0,
  cashReceived: 0,
  waived: 0,
  outstanding: 0,
  obligationCount: 0,
  waivedCount: 0,
  notDueCount: 0,
  overdueCount: 0,
};

function safeInteger(value: number, field: string, { nonNegative = true } = {}) {
  if (!Number.isSafeInteger(value) || (nonNegative && value < 0)) {
    throw new ReportInvariantError(`Unsafe or negative ${field}.`);
  }
  return value;
}

function safeDatabaseInteger(value: number | string, field: string) {
  const amount = typeof value === "number" ? value : Number(value);
  return safeInteger(amount, field);
}

function add(left: number, right: number, field: string) {
  return safeInteger(left + right, field);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function validTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function emptyTotals(): ReportTotals {
  return { ...ZERO_TOTALS };
}

function emptyHouseholdMatrixCell(month: number): HouseholdMatrixCell {
  return {
    month,
    dueDate: null,
    status: "no_data",
    recordedAmount: null,
    target: 0,
    effectiveTarget: 0,
    received: 0,
    openingBalanceReceived: 0,
    transferReceived: 0,
    cashReceived: 0,
    waived: 0,
    outstanding: 0,
    pending: false,
    overdue: false,
    latestPaymentAt: null,
  };
}

function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isOverdue(outstanding: number, dueDate: string, businessDate: string) {
  return outstanding > 0 && dueDate < businessDate;
}

function validateHouseholdIdentity(identity: ReportHouseholdIdentity) {
  if (
    !identity.householdId ||
    !identity.rtUnitId ||
    !identity.houseNumber.trim() ||
    !validDate(identity.startsOn) ||
    (identity.endsOn !== null && !validDate(identity.endsOn)) ||
    (identity.lifecycle === "active" && identity.endsOn !== null) ||
    (identity.lifecycle === "historical" && identity.endsOn === null) ||
    !Array.isArray(identity.residentNames) ||
    identity.residentNames.some((name) => typeof name !== "string" || name.trim().length === 0)
  ) {
    throw new ReportInvariantError("Household report details are inconsistent.");
  }
}

function calculateDue(due: ReportDueInput, year: number, businessDate: string): ReportTotals {
  validateHouseholdIdentity(due.household);
  if (
    due.household.householdId.length === 0 ||
    !due.monthlyDueId ||
    due.year !== year ||
    !Number.isInteger(due.month) || due.month < 1 || due.month > 12 ||
    !validDate(due.dueDate) ||
    due.dueDate.slice(0, 4) !== String(year) ||
    Number(due.dueDate.slice(5, 7)) !== due.month ||
    due.dueDate.slice(8, 10) !== "10" ||
    typeof due.hasPendingRequest !== "boolean"
  ) {
    throw new ReportInvariantError("A monthly due has invalid period or identity details.");
  }

  const targetAmount = safeInteger(due.originalAmount, "target amount");
  const recordedAmount = due.recordedAmount ?? null;
  if (recordedAmount !== null && safeInteger(recordedAmount, "recorded amount") <= 0) {
    throw new ReportInvariantError("A recorded correction amount must be positive.");
  }
  const adjustmentTotal = safeInteger(due.adjustmentTotal, "adjustment total", { nonNegative: false });
  const received = safeInteger(due.activeReceived, "received amount");
  const openingBalanceReceived = safeInteger(due.importedOpeningBalance, "imported opening balance");
  const transferReceived = safeInteger(due.transferReceived, "transfer amount");
  const cashReceived = safeInteger(due.cashReceived, "cash amount");
  const waiverAmount = safeInteger(due.waiverAmount, "waiver amount");

  if (due.status === "not_due") {
    if (
      targetAmount !== 0 ||
      adjustmentTotal !== 0 ||
      received !== 0 ||
      openingBalanceReceived !== 0 ||
      transferReceived !== 0 ||
      cashReceived !== 0 ||
      waiverAmount !== 0
    ) {
      throw new ReportInvariantError("NOT_DUE contains financial activity.");
    }
    return { ...emptyTotals(), notDueCount: 1 };
  }

  if (due.status !== "unpaid" && due.status !== "paid" && due.status !== "waived") {
    throw new ReportInvariantError("A monthly due has an unsupported status.");
  }
  if (targetAmount <= 0) throw new ReportInvariantError("An obligation has a non-positive target.");

  const effectiveTarget = safeInteger(targetAmount + adjustmentTotal, "effective target");
  if (effectiveTarget <= 0) throw new ReportInvariantError("An obligation has a non-positive effective target.");
  if (add(transferReceived, cashReceived, "verified payment total") !== received) {
    throw new ReportInvariantError("Verified payment methods do not match received amounts.");
  }

  const waived = due.status === "waived" ? waiverAmount : 0;
  if ((due.status === "waived" && waived <= 0) || (due.status !== "waived" && waiverAmount !== 0)) {
    throw new ReportInvariantError("Waiver ledger and due status do not match.");
  }
  if (due.status === "waived" && (received !== 0 || openingBalanceReceived !== 0 || waived !== effectiveTarget)) {
    throw new ReportInvariantError("A waived due does not match the full-waiver ledger contract.");
  }

  const openingAndVerified = add(openingBalanceReceived, received, "opening and verified balance");
  const outstanding = safeInteger(effectiveTarget - openingAndVerified - waived, "outstanding amount");
  if (add(add(openingAndVerified, waived, "settlement total"), outstanding, "settlement total") !== effectiveTarget) {
    throw new ReportInvariantError("The due does not reconcile to its target.");
  }
  if ((due.status === "paid" && (openingAndVerified === 0 || outstanding !== 0)) || (due.status === "unpaid" && outstanding === 0)) {
    throw new ReportInvariantError("Due status does not match its financial balance.");
  }

  const overdue = isOverdue(outstanding, due.dueDate, businessDate);
  return {
    target: targetAmount,
    effectiveTarget,
    received,
    openingBalanceReceived,
    transferReceived,
    cashReceived,
    waived,
    outstanding,
    obligationCount: 1,
    waivedCount: due.status === "waived" ? 1 : 0,
    notDueCount: 0,
    overdueCount: overdue ? 1 : 0,
  };
}

function addTotals(target: ReportTotals, value: ReportTotals) {
  target.target = add(target.target, value.target, "target total");
  target.effectiveTarget = add(target.effectiveTarget, value.effectiveTarget, "effective target total");
  target.received = add(target.received, value.received, "received total");
  target.openingBalanceReceived = add(target.openingBalanceReceived, value.openingBalanceReceived, "opening balance received total");
  target.transferReceived = add(target.transferReceived, value.transferReceived, "transfer total");
  target.cashReceived = add(target.cashReceived, value.cashReceived, "cash total");
  target.waived = add(target.waived, value.waived, "waived total");
  target.outstanding = add(target.outstanding, value.outstanding, "outstanding total");
  target.obligationCount = add(target.obligationCount, value.obligationCount, "obligation count");
  target.waivedCount = add(target.waivedCount, value.waivedCount, "waived count");
  target.notDueCount = add(target.notDueCount, value.notDueCount, "not-due count");
  target.overdueCount = add(target.overdueCount, value.overdueCount, "overdue count");
}

function sameTotals(left: ReportTotals, right: ReportTotals) {
  return (Object.keys(ZERO_TOTALS) as (keyof ReportTotals)[]).every((key) => left[key] === right[key]);
}

function sameHouseholdDisplay(left: ReportHouseholdIdentity, right: ReportHouseholdIdentity) {
  return left.householdId === right.householdId &&
    left.rtUnitId === right.rtUnitId &&
    left.houseNumber === right.houseNumber &&
    left.houseLabel === right.houseLabel &&
    left.lifecycle === right.lifecycle &&
    left.startsOn === right.startsOn &&
    left.endsOn === right.endsOn &&
    [...left.residentNames].sort().join("\u0000") === [...right.residentNames].sort().join("\u0000");
}

export function aggregateRtFinancialReport(
  dueInputs: readonly ReportDueInput[],
  input: { year: number; availableYears: readonly number[]; businessDate: string },
): RtFinancialReportResponse {
  if (!Number.isSafeInteger(input.year) || input.year < 2000 || input.year > 2200 || !validDate(input.businessDate)) {
    throw new ReportInvariantError("Report period input is invalid.");
  }

  const monthly: MonthlyReportTotals[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    ...emptyTotals(),
  }));
  const dueSummaries = new Map<string, ReportTotals>();
  const householdById = new Map<string, ReportHouseholdIdentity>();
  const matrixByHouseholdId = new Map<string, {
    identity: ReportHouseholdIdentity;
    months: HouseholdMatrixCell[];
    latestPaymentAt: string | null;
  }>();
  const arrearsByHousehold = new Map<string, ArrearsHousehold & { householdId: string; rtUnitId: string }>();
  const yearlyFromMonths = emptyTotals();
  const yearlyFromDues = emptyTotals();
  const businessPeriod = input.businessDate.slice(0, 7);
  let dueNowOutstanding = 0;
  let futureUnpaidOutstanding = 0;
  let arrearsTotalOutstanding = 0;
  let arrearsCount = 0;

  for (const due of dueInputs) {
    if (dueSummaries.has(due.monthlyDueId)) throw new ReportInvariantError("A monthly due was included more than once.");
    const summary = calculateDue(due, input.year, input.businessDate);
    dueSummaries.set(due.monthlyDueId, summary);

    const priorIdentity = householdById.get(due.household.householdId);
    if (priorIdentity && !sameHouseholdDisplay(priorIdentity, due.household)) {
      throw new ReportInvariantError("Household display details changed within the report.");
    }
    householdById.set(due.household.householdId, due.household);

    const matrixHousehold = matrixByHouseholdId.get(due.household.householdId) ?? {
      identity: due.household,
      months: Array.from({ length: 12 }, (_, index) => emptyHouseholdMatrixCell(index + 1)),
      latestPaymentAt: null,
    };
    const priorCell = matrixHousehold.months[due.month - 1];
    if (!priorCell || priorCell.status !== "no_data") {
      throw new ReportInvariantError("A household period was included more than once.");
    }
    const latestPaymentAt = due.latestPaymentAt ?? null;
    if (latestPaymentAt !== null && !validTimestamp(latestPaymentAt)) {
      throw new ReportInvariantError("A verified payment timestamp is invalid.");
    }
    matrixHousehold.months[due.month - 1] = {
      month: due.month,
      dueDate: due.dueDate,
      status: due.status,
      recordedAmount: due.recordedAmount ?? null,
      target: summary.target,
      effectiveTarget: summary.effectiveTarget,
      received: summary.received,
      openingBalanceReceived: summary.openingBalanceReceived,
      transferReceived: summary.transferReceived,
      cashReceived: summary.cashReceived,
      waived: summary.waived,
      outstanding: summary.outstanding,
      pending: due.hasPendingRequest,
      overdue: summary.overdueCount === 1,
      latestPaymentAt,
    };
    if (latestPaymentAt && (!matrixHousehold.latestPaymentAt || latestPaymentAt > matrixHousehold.latestPaymentAt)) {
      matrixHousehold.latestPaymentAt = latestPaymentAt;
    }
    matrixByHouseholdId.set(due.household.householdId, matrixHousehold);

    const month = monthly[due.month - 1];
    if (!month) throw new ReportInvariantError("A monthly bucket was not created.");
    addTotals(month, summary);
    addTotals(yearlyFromDues, summary);
    if (periodKey(due.year, due.month) <= businessPeriod) {
      dueNowOutstanding = add(dueNowOutstanding, summary.outstanding, "due-now outstanding total");
    } else {
      futureUnpaidOutstanding = add(futureUnpaidOutstanding, summary.outstanding, "future unpaid total");
    }

    if (summary.overdueCount === 0) continue;
    const identity = due.household;
    const household = arrearsByHousehold.get(identity.householdId) ?? {
      householdId: identity.householdId,
      rtUnitId: identity.rtUnitId,
      houseNumber: identity.houseNumber,
      houseLabel: identity.houseLabel,
      residentNames: [...new Set(identity.residentNames.map((name) => name.trim()))].sort((left, right) => left.localeCompare(right)),
      lifecycle: identity.lifecycle,
      startsOn: identity.startsOn,
      endsOn: identity.endsOn,
      totalOutstanding: 0,
      pending: false,
      periods: [],
    };
    household.totalOutstanding = add(household.totalOutstanding, summary.outstanding, "household arrears total");
    household.pending ||= due.hasPendingRequest;
    household.periods.push({
      month: due.month,
      dueDate: due.dueDate,
      outstanding: summary.outstanding,
      pending: due.hasPendingRequest,
    });
    arrearsByHousehold.set(identity.householdId, household);
    arrearsTotalOutstanding = add(arrearsTotalOutstanding, summary.outstanding, "arrears total");
    arrearsCount = add(arrearsCount, 1, "arrears count");
  }

  for (const month of monthly) addTotals(yearlyFromMonths, month);
  if (!sameTotals(yearlyFromMonths, yearlyFromDues)) {
    throw new ReportInvariantError("Monthly totals do not reconcile to the yearly report.");
  }
  if (add(dueNowOutstanding, futureUnpaidOutstanding, "timed outstanding total") !== yearlyFromMonths.outstanding) {
    throw new ReportInvariantError("Due-now and future unpaid amounts do not reconcile to the yearly report.");
  }

  const households = [...arrearsByHousehold.values()]
    .sort((left, right) => left.houseNumber.localeCompare(right.houseNumber) || left.startsOn.localeCompare(right.startsOn) || left.householdId.localeCompare(right.householdId))
    .map((entry) => {
      const { householdId, rtUnitId, ...household } = entry;
      void householdId;
      void rtUnitId;
      return {
        ...household,
        periods: household.periods.sort((left, right) => left.month - right.month),
      };
    });

  const householdMatrix: HouseholdMatrixRow[] = [...matrixByHouseholdId.values()]
    .sort((left, right) =>
      left.identity.houseNumber.localeCompare(right.identity.houseNumber, "id-ID", { numeric: true, sensitivity: "base" }) ||
      left.identity.startsOn.localeCompare(right.identity.startsOn) ||
      left.identity.householdId.localeCompare(right.identity.householdId))
    .map((entry, index) => {
      const { householdId, rtUnitId, ...identity } = entry.identity;
      void householdId;
      void rtUnitId;
      return { key: index + 1, ...identity, months: entry.months, latestPaymentAt: entry.latestPaymentAt };
    });

  const result: RtFinancialReportResponse = {
    year: input.year,
    availableYears: [...input.availableYears],
    asOf: { businessDate: input.businessDate, period: businessPeriod },
    dueNowOutstanding,
    futureUnpaidOutstanding,
    yearly: yearlyFromMonths,
    monthly,
    householdMatrix,
    arrears: {
      totalOutstanding: arrearsTotalOutstanding,
      count: arrearsCount,
      householdCount: households.length,
      households,
    },
  };
  return result;
}

export function sumActiveAllocationMethods(
  allocationRows: readonly AllocationMethodRow[],
  dues: readonly {
    monthlyDueId: string;
    household: Pick<ReportHouseholdIdentity, "householdId" | "rtUnitId">;
  }[],
): Map<string, ActiveMethodTotals> {
  const dueOwners = new Map(dues.map((due) => [due.monthlyDueId, due.household]));
  const totals = new Map<string, ActiveMethodTotals>();
  for (const row of allocationRows) {
    const household = dueOwners.get(row.monthlyDueId);
    if (!household || household.householdId !== row.householdId || household.rtUnitId !== row.rtUnitId) {
      throw new ReportInvariantError("An allocation does not match its report due scope.");
    }
    if (row.method !== "transfer" && row.method !== "cash") {
      throw new ReportInvariantError("An allocation has an unsupported payment method.");
    }
    if (typeof row.paymentReversed !== "boolean") {
      throw new ReportInvariantError("Payment reversal state is invalid.");
    }
    if (row.paymentReversed) continue;

    const verifiedAt = row.verifiedAt instanceof Date ? row.verifiedAt.toISOString() : row.verifiedAt;
    if (!validTimestamp(verifiedAt)) throw new ReportInvariantError("A verified payment timestamp is invalid.");

    const amount = safeDatabaseInteger(row.amount, "allocation amount");
    if (amount <= 0) throw new ReportInvariantError("An allocation has a non-positive amount.");
    const dueTotals = totals.get(row.monthlyDueId) ?? { transferReceived: 0, cashReceived: 0, latestPaymentAt: null };
    const field = row.method === "transfer" ? "transferReceived" : "cashReceived";
    dueTotals[field] = add(dueTotals[field], amount, `${row.method} allocation total`);
    if (!dueTotals.latestPaymentAt || verifiedAt > dueTotals.latestPaymentAt) dueTotals.latestPaymentAt = verifiedAt;
    totals.set(row.monthlyDueId, dueTotals);
  }
  return totals;
}
