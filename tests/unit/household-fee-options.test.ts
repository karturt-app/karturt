import { describe, expect, it } from "vitest";
import { isNewHouseholdMonthlyFeeOption, NEW_HOUSEHOLD_MONTHLY_FEE_OPTIONS } from "@/lib/households/fee-options";

describe("new-household monthly fee options", () => {
  it("accepts only the four approved tariff amounts", () => {
    expect(NEW_HOUSEHOLD_MONTHLY_FEE_OPTIONS).toEqual([25_000, 32_000, 40_000, 50_000]);
    for (const amount of NEW_HOUSEHOLD_MONTHLY_FEE_OPTIONS) {
      expect(isNewHouseholdMonthlyFeeOption(amount)).toBe(true);
    }
    expect(isNewHouseholdMonthlyFeeOption(30_000)).toBe(false);
    expect(isNewHouseholdMonthlyFeeOption("25000")).toBe(false);
  });
});
