"use client";

import { useEffect, useSyncExternalStore } from "react";

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

const META_THEME_COLORS: Record<Atmosphere, string> = {
  morning: "#edf4ef",
  day: "#f4f1ea",
  afternoon: "#f8efe6",
  night: "#0d161b",
  rain: "#0b1116",
};

const STORAGE_MODE_KEY = "karturt:atmosphere-mode";
const STORAGE_THEME_KEY = "karturt:theme";
const EVENT_NAME = "karturt:atmosphere-change";

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

export function applyAtmosphereClass(atmosphere: Atmosphere): void {
  if (typeof document === "undefined") return;
  const isDark = isDarkAtmosphere(atmosphere);
  const theme: Theme = isDark ? "dark" : "light";
  const el = document.documentElement;
  el.dataset.theme = theme;
  el.dataset.atmosphere = atmosphere;
  el.classList.toggle("dark", isDark);
  el.classList.toggle("rain", atmosphere === "rain");
  el.classList.toggle("morning", atmosphere === "morning");
  el.classList.toggle("afternoon", atmosphere === "afternoon");
  el.style.colorScheme = isDark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", META_THEME_COLORS[atmosphere] ?? "#173745");
}

export interface AtmosphereSnapshot {
  theme: Theme;
  atmosphere: Atmosphere;
  weatherMode: WeatherMode;
  liveWeather: LiveWeatherInfo | null;
}

const SERVER_SNAPSHOT: AtmosphereSnapshot = {
  theme: "light",
  atmosphere: "day",
  weatherMode: "auto",
  liveWeather: null,
};

let clientSnapshot: AtmosphereSnapshot | null = null;
let initializedFromDom = false;

function readInitialModeFromStorage(): WeatherMode {
  if (typeof window === "undefined") return "auto";
  try {
    const storedMode = window.localStorage.getItem(STORAGE_MODE_KEY);
    if (isValidWeatherMode(storedMode)) {
      return storedMode;
    }
  } catch {
    // Abaikan jika localStorage diblokir
  }
  return "auto";
}

function resolveAtmosphere(mode: WeatherMode, liveWeather: LiveWeatherInfo | null): Atmosphere {
  if (mode === "auto") {
    return liveWeather?.isRaining ? "rain" : defaultAtmosphereByWib();
  }
  return mode;
}

function ensureClientSnapshot(): AtmosphereSnapshot {
  if (!clientSnapshot) {
    const mode = readInitialModeFromStorage();
    const atm = resolveAtmosphere(mode, null);
    clientSnapshot = {
      theme: isDarkAtmosphere(atm) ? "dark" : "light",
      atmosphere: atm,
      weatherMode: mode,
      liveWeather: null,
    };
  }
  if (!initializedFromDom && typeof document !== "undefined") {
    initializedFromDom = true;
    applyAtmosphereClass(clientSnapshot.atmosphere);
  }
  return clientSnapshot;
}

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT_NAME));
  window.dispatchEvent(new Event("karturt:theme-change"));
}

export function setWeatherMode(nextMode: WeatherMode, persist = true): void {
  const current = ensureClientSnapshot();
  const nextAtmosphere = resolveAtmosphere(nextMode, current.liveWeather);
  const nextTheme: Theme = isDarkAtmosphere(nextAtmosphere) ? "dark" : "light";

  clientSnapshot = {
    ...current,
    weatherMode: nextMode,
    atmosphere: nextAtmosphere,
    theme: nextTheme,
  };

  applyAtmosphereClass(nextAtmosphere);

  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_MODE_KEY, nextMode);
      window.localStorage.setItem(STORAGE_THEME_KEY, nextTheme);
    } catch {
      // Tetap jalankan tema di memori meskipun storage tidak tersedia
    }
  }

  emitChange();
}

export function cycleWeatherMode(): void {
  const current = ensureClientSnapshot();
  const idx = MODE_ORDER.indexOf(current.weatherMode);
  const next = MODE_ORDER[(idx + 1) % MODE_ORDER.length] ?? "auto";
  setWeatherMode(next, true);
}

export function setLiveWeather(info: LiveWeatherInfo): void {
  const current = ensureClientSnapshot();
  const resolvedAtmosphere: Atmosphere = info.isRaining ? "rain" : defaultAtmosphereByWib();
  const enriched: LiveWeatherInfo = {
    ...info,
    atmosphere: resolvedAtmosphere,
  };

  if (current.weatherMode === "auto") {
    const nextTheme: Theme = isDarkAtmosphere(resolvedAtmosphere) ? "dark" : "light";
    clientSnapshot = {
      ...current,
      liveWeather: enriched,
      atmosphere: resolvedAtmosphere,
      theme: nextTheme,
    };
    applyAtmosphereClass(resolvedAtmosphere);
  } else {
    clientSnapshot = {
      ...current,
      liveWeather: enriched,
    };
  }

  emitChange();
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}

function getClientSnapshot(): AtmosphereSnapshot {
  return ensureClientSnapshot();
}

function getServerSnapshot(): AtmosphereSnapshot {
  return SERVER_SNAPSHOT;
}

export function useAtmosphere(): AtmosphereSnapshot {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

let lastFetchedAt = 0;
let rainStreak = 0;
let dryStreak = 0;
const REFRESH_MS = 10 * 60 * 1000;

/**
 * Sinkronisasi cuaca live wilayah RT.05 (Jrebeng Wetan, Kedopok, Kota Probolinggo)
 * tanpa meminta akses GPS ke pengguna.
 */
export function useWeatherSync(): void {
  useEffect(() => {
    let active = true;

    async function fetchRt05Weather() {
      const now = Date.now();
      if (now - lastFetchedAt < 15_000) return;
      lastFetchedAt = now;

      try {
        const res = await fetch("/api/weather", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as LiveWeatherInfo;
        if (!active || !data || !data.atmosphere) return;

        if (data.isRaining) {
          rainStreak += 1;
          dryStreak = 0;
        } else {
          dryStreak += 1;
          rainStreak = 0;
        }

        const currentAtmosphere = ensureClientSnapshot().liveWeather?.atmosphere;
        let effectiveRain = data.isRaining;
        if (data.isRaining && currentAtmosphere !== "rain" && rainStreak < 2) {
          effectiveRain = false;
        } else if (!data.isRaining && currentAtmosphere === "rain" && dryStreak < 2) {
          effectiveRain = true;
        }

        setLiveWeather({ ...data, isRaining: effectiveRain });
      } catch {
        // Abaikan jika offline / gagal, tetap gunakan atmosfer jam WIB
      }
    }

    // Pastikan kelas atmosfer terpasang sesuai jam WIB saat mount pertama
    const snap = ensureClientSnapshot();
    applyAtmosphereClass(snap.atmosphere);

    void fetchRt05Weather();

    const interval = window.setInterval(() => {
      void fetchRt05Weather();
    }, REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);
}
