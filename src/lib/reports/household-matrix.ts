import type { HouseholdMatrixCell, HouseholdMatrixRow } from "./aggregation";

export type HouseholdMatrixFilter = "all" | "arrears" | "pending" | "paid" | "unpaid";
export type HouseholdMatrixSort = "house_number" | "name" | "arrears" | "paid_months" | "latest_payment";
export type HouseholdMatrixDirection = "asc" | "desc";
export type HouseholdMatrixDisplayStatus =
  | "paid"
  | "pending"
  | "overdue"
  | "unpaid"
  | "upcoming"
  | "waived"
  | "not_due"
  | "no_data";

export function householdMatrixDisplayStatus(
  cell: HouseholdMatrixCell,
  businessDate: string,
): HouseholdMatrixDisplayStatus {
  if (cell.status === "no_data") return "no_data";
  if (cell.status === "not_due") return "not_due";
  if (cell.status === "waived") return "waived";
  if (cell.status === "paid") return "paid";
  if (cell.pending && cell.outstanding > 0) return "pending";
  if (cell.overdue && cell.outstanding > 0) return "overdue";
  if (cell.dueDate && cell.dueDate > businessDate) return "upcoming";
  return "unpaid";
}

function hasCellStatus(
  row: HouseholdMatrixRow,
  businessDate: string,
  predicate: (status: HouseholdMatrixDisplayStatus, cell: HouseholdMatrixCell) => boolean,
) {
  return row.months.some((cell) => predicate(householdMatrixDisplayStatus(cell, businessDate), cell));
}

function arrearsAmount(row: HouseholdMatrixRow) {
  return row.months.reduce((total, cell) => total + (cell.overdue ? cell.outstanding : 0), 0);
}

function paidMonths(row: HouseholdMatrixRow) {
  return row.months.filter((cell) => cell.status === "paid").length;
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "id-ID", { numeric: true, sensitivity: "base" });
}

export function filterAndSortHouseholdMatrix(
  rows: readonly HouseholdMatrixRow[],
  options: {
    search: string;
    filter: HouseholdMatrixFilter;
    sort: HouseholdMatrixSort;
    direction: HouseholdMatrixDirection;
    businessDate: string;
  },
): HouseholdMatrixRow[] {
  const search = options.search.trim().toLocaleLowerCase("id-ID");
  const filtered = rows.filter((row) => {
    const matchesSearch = !search || [row.houseNumber, row.houseLabel ?? "", ...row.residentNames]
      .join(" ")
      .toLocaleLowerCase("id-ID")
      .includes(search);
    if (!matchesSearch) return false;

    switch (options.filter) {
      case "arrears":
        return row.months.some((cell) => cell.overdue && cell.outstanding > 0);
      case "pending":
        return hasCellStatus(row, options.businessDate, (status, cell) =>
          status === "pending" && cell.outstanding > 0);
      case "paid":
        return hasCellStatus(row, options.businessDate, (status) => status === "paid");
      case "unpaid":
        return hasCellStatus(row, options.businessDate, (status, cell) =>
          cell.status === "unpaid" && cell.outstanding > 0 && status !== "pending");
      default:
        return true;
    }
  });

  const direction = options.direction === "asc" ? 1 : -1;
  return filtered.sort((left, right) => {
    let comparison = 0;
    switch (options.sort) {
      case "name":
        comparison = compareText(left.residentNames.join(", "), right.residentNames.join(", "));
        break;
      case "arrears":
        comparison = arrearsAmount(left) - arrearsAmount(right);
        break;
      case "paid_months":
        comparison = paidMonths(left) - paidMonths(right);
        break;
      case "latest_payment":
        if (left.latestPaymentAt === null || right.latestPaymentAt === null) {
          if (left.latestPaymentAt === null && right.latestPaymentAt !== null) return 1;
          if (left.latestPaymentAt !== null && right.latestPaymentAt === null) return -1;
        } else {
          comparison = left.latestPaymentAt.localeCompare(right.latestPaymentAt);
        }
        break;
      default:
        comparison = compareText(left.houseNumber, right.houseNumber);
    }
    if (comparison !== 0) return comparison * direction;
    return compareText(left.houseNumber, right.houseNumber) || left.key - right.key;
  });
}
