import { describe, expect, it } from "vitest";
import type { HouseholdMatrixCell, HouseholdMatrixRow } from "@/lib/reports/aggregation";
import {
  filterAndSortHouseholdMatrix,
  householdMatrixDisplayStatus,
  type HouseholdMatrixFilter,
  type HouseholdMatrixSort,
} from "@/lib/reports/household-matrix";

const BUSINESS_DATE = "2026-11-05";

function noDataCell(month: number): HouseholdMatrixCell {
  return {
    month,
    dueDate: null,
    status: "no_data",
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

function dueCell(month: number, input: Partial<HouseholdMatrixCell>): HouseholdMatrixCell {
  const status = input.status ?? "unpaid";
  const amount = status === "not_due" ? 0 : 40_000;
  return {
    month,
    dueDate: `2026-${String(month).padStart(2, "0")}-10`,
    status,
    target: amount,
    effectiveTarget: amount,
    received: 0,
    openingBalanceReceived: 0,
    transferReceived: 0,
    cashReceived: 0,
    waived: 0,
    outstanding: amount,
    pending: false,
    overdue: false,
    latestPaymentAt: null,
    ...input,
  };
}

function row(
  key: number,
  houseNumber: string,
  residentNames: string[],
  cells: Partial<Record<number, Partial<HouseholdMatrixCell>>>,
  latestPaymentAt: string | null = null,
): HouseholdMatrixRow {
  return {
    key,
    houseNumber,
    houseLabel: null,
    residentNames,
    lifecycle: "active",
    startsOn: "2020-01-01",
    endsOn: null,
    months: Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const input = cells[month];
      return input ? dueCell(month, input) : noDataCell(month);
    }),
    latestPaymentAt,
  };
}

function searchFilter(
  rows: readonly HouseholdMatrixRow[],
  filter: HouseholdMatrixFilter,
  search = "",
  sort: HouseholdMatrixSort = "house_number",
  direction: "asc" | "desc" = "asc",
) {
  return filterAndSortHouseholdMatrix(rows, { search, filter, sort, direction, businessDate: BUSINESS_DATE });
}

describe("annual household dues matrix", () => {
  const arrearsPending = row(1, "A-01", ["Sari Warga"], {
    3: { pending: true, overdue: true },
  });
  const upcomingUnpaid = row(2, "A-02", ["Budi Warga"], {
    12: { dueDate: "2026-12-10", overdue: false },
  });
  const paid = row(3, "A-10", ["Dewi Warga"], {
    1: { status: "paid", target: 40_000, effectiveTarget: 40_000, received: 40_000, outstanding: 0, latestPaymentAt: "2026-01-12T10:00:00.000Z" },
  }, "2026-01-12T10:00:00.000Z");
  const waived = row(4, "A-04", ["Rina Warga"], {
    2: { status: "waived", target: 40_000, effectiveTarget: 40_000, waived: 40_000, outstanding: 0 },
  });

  it("distinguishes pending, overdue, future unpaid, paid, waived, and no obligation states", () => {
    expect(householdMatrixDisplayStatus(arrearsPending.months[2]!, BUSINESS_DATE)).toBe("pending");
    expect(householdMatrixDisplayStatus(upcomingUnpaid.months[11]!, BUSINESS_DATE)).toBe("upcoming");
    expect(householdMatrixDisplayStatus(paid.months[0]!, BUSINESS_DATE)).toBe("paid");
    expect(householdMatrixDisplayStatus(waived.months[1]!, BUSINESS_DATE)).toBe("waived");
    expect(householdMatrixDisplayStatus(dueCell(11, { status: "not_due" }), BUSINESS_DATE)).toBe("not_due");
    expect(householdMatrixDisplayStatus(noDataCell(11), BUSINESS_DATE)).toBe("no_data");
  });

  it("filters all, arrears, pending, paid, unpaid, and resident or house searches", () => {
    const rows = [arrearsPending, upcomingUnpaid, paid, waived];
    expect(searchFilter(rows, "all")).toHaveLength(4);
    expect(searchFilter(rows, "arrears").map((item) => item.key)).toEqual([1]);
    expect(searchFilter(rows, "pending").map((item) => item.key)).toEqual([1]);
    expect(searchFilter(rows, "paid").map((item) => item.key)).toEqual([3]);
    expect(searchFilter(rows, "unpaid").map((item) => item.key)).toEqual([2]);
    expect(searchFilter(rows, "all", "sArI").map((item) => item.key)).toEqual([1]);
    expect(searchFilter(rows, "all", "A-10").map((item) => item.key)).toEqual([3]);
  });

  it("sorts by house number, name, arrears, paid months, and latest verified payment in both directions", () => {
    const rows = [
      row(1, "A-10", ["Zoe"], {
        1: { status: "paid", received: 40_000, outstanding: 0, latestPaymentAt: "2026-02-01T10:00:00.000Z" },
        2: { status: "paid", received: 40_000, outstanding: 0 },
        3: { status: "paid", received: 40_000, outstanding: 0 },
        4: { overdue: true, outstanding: 80_000 },
      }, "2026-02-01T10:00:00.000Z"),
      row(2, "A-02", ["Ada"], {
        1: { status: "paid", received: 40_000, outstanding: 0, latestPaymentAt: "2026-03-01T10:00:00.000Z" },
        2: { overdue: true, outstanding: 20_000 },
      }, "2026-03-01T10:00:00.000Z"),
      row(3, "A-01", ["Bob"], {
        1: { status: "paid", received: 40_000, outstanding: 0 },
        2: { status: "paid", received: 40_000, outstanding: 0 },
        3: { overdue: true, outstanding: 50_000 },
      }),
    ];

    expect(searchFilter(rows, "all", "", "house_number", "asc").map((item) => item.houseNumber)).toEqual(["A-01", "A-02", "A-10"]);
    expect(searchFilter(rows, "all", "", "house_number", "desc").map((item) => item.houseNumber)).toEqual(["A-10", "A-02", "A-01"]);
    expect(searchFilter(rows, "all", "", "name", "asc").map((item) => item.residentNames[0])).toEqual(["Ada", "Bob", "Zoe"]);
    expect(searchFilter(rows, "all", "", "arrears", "desc").map((item) => item.houseNumber)).toEqual(["A-10", "A-01", "A-02"]);
    expect(searchFilter(rows, "all", "", "paid_months", "desc").map((item) => item.houseNumber)).toEqual(["A-10", "A-01", "A-02"]);
    expect(searchFilter(rows, "all", "", "latest_payment", "desc").map((item) => item.houseNumber)).toEqual(["A-02", "A-10", "A-01"]);
    expect(searchFilter(rows, "all", "", "latest_payment", "asc").map((item) => item.houseNumber)).toEqual(["A-10", "A-02", "A-01"]);
  });
});
