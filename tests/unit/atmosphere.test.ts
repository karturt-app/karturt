import { describe, expect, it } from "vitest";
import {
  RT05_LOCATION,
  defaultAtmosphereByWib,
  describeWeatherCode,
  evaluateRainCondition,
  isDarkAtmosphere,
} from "@/lib/atmosphere";

describe("KartuRT 4-Time WIB + Live Weather Atmosphere", () => {
  it("pins fixed location to RT.05 Jrebeng Wetan, Kedopok, Kota Probolinggo without GPS prompt", () => {
    expect(RT05_LOCATION.city).toBe("RT.05");
    expect(RT05_LOCATION.address).toContain("Gg. Niaga No.13, Jrebeng Wetan, Kec. Kedopok, Kota Probolinggo, Jawa Timur 67231");
    expect(RT05_LOCATION.lat).toBeCloseTo(-7.7819, 3);
    expect(RT05_LOCATION.lon).toBeCloseTo(113.2115, 3);
  });

  it("maps WIB hours accurately to morning, day, afternoon, and night", () => {
    // 06:00 WIB = 23:00 UTC previous day
    const morningUtc = Date.UTC(2026, 10, 6, 23, 0, 0);
    expect(defaultAtmosphereByWib(morningUtc)).toBe("morning");

    // 11:00 WIB = 04:00 UTC
    const dayUtc = Date.UTC(2026, 10, 7, 4, 0, 0);
    expect(defaultAtmosphereByWib(dayUtc)).toBe("day");

    // 16:30 WIB = 09:30 UTC
    const afternoonUtc = Date.UTC(2026, 10, 7, 9, 30, 0);
    expect(defaultAtmosphereByWib(afternoonUtc)).toBe("afternoon");

    // 21:00 WIB = 14:00 UTC
    const nightUtc = Date.UTC(2026, 10, 7, 14, 0, 0);
    expect(defaultAtmosphereByWib(nightUtc)).toBe("night");
  });

  it("identifies dark vs light atmospheres", () => {
    expect(isDarkAtmosphere("morning")).toBe(false);
    expect(isDarkAtmosphere("day")).toBe(false);
    expect(isDarkAtmosphere("afternoon")).toBe(false);
    expect(isDarkAtmosphere("night")).toBe(true);
    expect(isDarkAtmosphere("rain")).toBe(true);
  });

  it("evaluates rain hysteresis thresholds to prevent 0.1mm drizzle false positives", () => {
    expect(
      evaluateRainCondition({
        precipitationMm: 0.1,
        weatherCode: 51,
        precipitationProbability: 80,
      }),
    ).toBe(false);

    expect(
      evaluateRainCondition({
        precipitationMm: 1.2,
        weatherCode: 61,
        precipitationProbability: 75,
      }),
    ).toBe(true);

    expect(
      evaluateRainCondition({
        precipitationMm: 0.8,
        weatherCode: 61,
        precipitationProbability: 20,
      }),
    ).toBe(false);
  });

  it("describes WMO weather codes in Bahasa Indonesia", () => {
    expect(describeWeatherCode(95, true)).toBe("Hujan Petir");
    expect(describeWeatherCode(63, true)).toBe("Hujan");
    expect(describeWeatherCode(3, true)).toBe("Mendung");
    expect(describeWeatherCode(0, true)).toBe("Cerah");
    expect(describeWeatherCode(0, false)).toBe("Malam Cerah");
  });
});
