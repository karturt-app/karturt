export type Theme = "light" | "dark";
export type Atmosphere = "morning" | "day" | "afternoon" | "night" | "rain";
export type WeatherMode = "auto" | Atmosphere;

export interface LiveWeatherInfo {
  atmosphere: Atmosphere;
  isRaining: boolean;
  isDay: boolean;
  temperatureC: number | null;
  weatherCode: number;
  conditionLabel: string;
  city: string;
  address: string;
  updatedAt: string;
  precipitationMm: number;
  precipitationProbability: number | null;
  windSpeedKmh: number;
}

/**
 * Titik Lokasi Tetap RT.05 (Zero GPS Prompt):
 * Gg. Niaga No.13, Jrebeng Wetan, Kec. Kedopok, Kota Probolinggo, Jawa Timur 67231
 */
export const RT05_LOCATION = {
  city: "RT.05",
  address: "Gg. Niaga No.13, Jrebeng Wetan, Kec. Kedopok, Kota Probolinggo, Jawa Timur 67231",
  lat: -7.7819,
  lon: 113.2115,
} as const;

export const MODE_ORDER: readonly WeatherMode[] = [
  "auto",
  "morning",
  "day",
  "afternoon",
  "night",
  "rain",
] as const;

const RAIN_MIN_MM = 0.5;
const RAIN_MIN_PROBABILITY = 50;
const RAIN_HEAVY_MM = 2;

export function isRainyWeatherCode(code: number): boolean {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  );
}

export function evaluateRainCondition(params: {
  precipitationMm: number;
  weatherCode: number;
  precipitationProbability: number | null;
}): boolean {
  const { precipitationMm, weatherCode, precipitationProbability } = params;
  const probabilityOk =
    precipitationProbability === null ||
    precipitationProbability >= RAIN_MIN_PROBABILITY ||
    precipitationMm >= RAIN_HEAVY_MM;
  return precipitationMm >= RAIN_MIN_MM && isRainyWeatherCode(weatherCode) && probabilityOk;
}

export function describeWeatherCode(code: number, isDay: boolean): string {
  if (code >= 95) return "Hujan Petir";
  if (code >= 80 && code <= 82) return "Hujan Deras";
  if (code >= 61 && code <= 67) return "Hujan";
  if (code >= 51 && code <= 57) return "Gerimis";
  if (code === 45 || code === 48) return "Berkabut";
  if (code === 3) return "Mendung";
  if (code === 2) return "Berawan";
  if (code === 1) return isDay ? "Cerah Berawan" : "Malam Berawan";
  return isDay ? "Cerah" : "Malam Cerah";
}

export function isDarkAtmosphere(atmosphere: Atmosphere): boolean {
  return atmosphere === "night" || atmosphere === "rain";
}

/**
 * Menentukan tema waktu berdasarkan jam WIB (UTC+7):
 * - Pagi (morning): 04:00 – 08:59 WIB
 * - Siang (day): 09:00 – 14:59 WIB
 * - Sore (afternoon): 15:00 – 18:59 WIB
 * - Malam (night): 19:00 – 03:59 WIB
 */
export function defaultAtmosphereByWib(nowEpoch = Date.now()): Exclude<Atmosphere, "rain"> {
  const wibHour = new Date(nowEpoch + 7 * 3600_000).getUTCHours();
  if (wibHour >= 4 && wibHour <= 8) return "morning";
  if (wibHour >= 9 && wibHour <= 14) return "day";
  if (wibHour >= 15 && wibHour <= 18) return "afternoon";
  return "night";
}

export function isWibDaytime(nowEpoch = Date.now()): boolean {
  return defaultAtmosphereByWib(nowEpoch) !== "night";
}

export function isValidWeatherMode(val: unknown): val is WeatherMode {
  return (
    val === "auto" ||
    val === "morning" ||
    val === "day" ||
    val === "afternoon" ||
    val === "night" ||
    val === "rain"
  );
}
