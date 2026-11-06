export const householdConflictCodes = [
  "DUPLICATE_HOUSE_NUMBER",
  "ACTIVE_LOGIN_COLLISION",
  "HOUSEHOLD_PERIOD_OVERLAP",
  "MISSING_FEE_RATE",
  "GENERIC_CONFLICT",
] as const;

export type HouseholdConflictCode = typeof householdConflictCodes[number];

const conflictMessages: Record<HouseholdConflictCode, string> = {
  DUPLICATE_HOUSE_NUMBER: "Nomor rumah sudah terdaftar. Muat ulang daftar, lalu pilih rumah yang sudah ada atau gunakan nomor lain.",
  ACTIVE_LOGIN_COLLISION: "Nomor rumah ini masih digunakan sebagai login warga. Periksa kembali nomor rumah atau minta bantuan untuk meninjau akun lama.",
  HOUSEHOLD_PERIOD_OVERLAP: "Tanggal mulai bertumpang tindih dengan masa huni yang tercatat. Muat ulang riwayat rumah dan pilih tanggal lain.",
  MISSING_FEE_RATE: "Tarif iuran belum tersedia untuk periode ini. Minta Bendahara memperbarui tarif, lalu coba lagi.",
  GENERIC_CONFLICT: "Perubahan berbenturan dengan data atau riwayat yang ada. Muat ulang data dan coba lagi.",
};

export function isHouseholdConflictCode(value: unknown): value is HouseholdConflictCode {
  return typeof value === "string" && householdConflictCodes.includes(value as HouseholdConflictCode);
}

export function normalizeHouseholdConflictCode(value: unknown): HouseholdConflictCode {
  return isHouseholdConflictCode(value) ? value : "GENERIC_CONFLICT";
}

export function householdConflictMessage(value: unknown): string {
  return conflictMessages[normalizeHouseholdConflictCode(value)];
}

export async function householdConflictMessageFromResponse(response: Pick<Response, "json">): Promise<string> {
  let code: unknown;
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object") {
      code = (payload as { code?: unknown }).code;
    }
  } catch {
    // Malformed responses use the generic safe conflict message.
  }
  return householdConflictMessage(code);
}
