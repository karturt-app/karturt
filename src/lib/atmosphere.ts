"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  MODE_ORDER,
  RT05_LOCATION,
  defaultAtmosphereByWib,
  describeWeatherCode,
  evaluateRainCondition,
  isDarkAtmosphere,
  isValidWeatherMode,
  isWibDaytime,
  type Atmosphere,
  type LiveWeatherInfo,
  type Theme,
  type WeatherMode,
} from "@/lib/atmosphere-core";

export {
  MODE_ORDER,
  RT05_LOCATION,
  defaultAtmosphereByWib,
  describeWeatherCode,
  evaluateRainCondition,
  isDarkAtmosphere,
  isValidWeatherMode,
  isWibDaytime,
  type Atmosphere,
  type LiveWeatherInfo,
  type Theme,
  type WeatherMode,
};

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
        let data: LiveWeatherInfo | null = null;
        try {
          const { lat, lon, city, address } = RT05_LOCATION;
          const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,is_day,precipitation,rain,showers,weather_code,precipitation_probability,wind_speed_10m&models=ecmwf_ifs&timezone=Asia%2FJakarta`;
          const directRes = await fetch(openMeteoUrl, { headers: { Accept: "application/json" } });
          if (directRes.ok) {
            const raw = (await directRes.json()) as {
              current?: {
                temperature_2m?: number;
                is_day?: number;
                precipitation?: number;
                weather_code?: number;
                precipitation_probability?: number;
                wind_speed_10m?: number;
              };
            };
            const cur = raw?.current ?? {};
            const weatherCode = typeof cur.weather_code === "number" ? cur.weather_code : 0;
            const windSpeedKmh = typeof cur.wind_speed_10m === "number" ? Math.round(cur.wind_speed_10m) : 0;
            const isDay = typeof cur.is_day === "number" ? cur.is_day === 1 : isWibDaytime();
            const precipitationMm = typeof cur.precipitation === "number" ? cur.precipitation : 0;
            const precipitationProbability =
              typeof cur.precipitation_probability === "number" ? cur.precipitation_probability : null;
            const isRainingRaw = evaluateRainCondition({
              precipitationMm,
              weatherCode,
              precipitationProbability,
            });
            data = {
              atmosphere: isRainingRaw ? "rain" : defaultAtmosphereByWib(),
              isRaining: isRainingRaw,
              isDay,
              temperatureC: typeof cur.temperature_2m === "number" ? Math.round(cur.temperature_2m) : null,
              weatherCode,
              conditionLabel: describeWeatherCode(weatherCode, isDay),
              city,
              address,
              updatedAt: new Date().toISOString(),
              precipitationMm,
              precipitationProbability,
              windSpeedKmh,
            };
          }
        } catch {
          // Fallback to /api/weather if direct fetch fails
        }
        if (!data) {
          const res = await fetch("/api/weather", {
            headers: { Accept: "application/json" },
            cache: "no-store",
          });
          if (!res.ok) return;
          data = (await res.json()) as LiveWeatherInfo;
        }
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
