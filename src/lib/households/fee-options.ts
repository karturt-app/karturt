export const NEW_HOUSEHOLD_MONTHLY_FEE_OPTIONS = [32_000, 40_000] as const;

export type NewHouseholdMonthlyFeeOption = typeof NEW_HOUSEHOLD_MONTHLY_FEE_OPTIONS[number];

export function isNewHouseholdMonthlyFeeOption(value: unknown): value is NewHouseholdMonthlyFeeOption {
  return typeof value === "number" && NEW_HOUSEHOLD_MONTHLY_FEE_OPTIONS.some((option) => option === value);
}
