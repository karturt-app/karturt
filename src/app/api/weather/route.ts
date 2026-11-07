import { NextResponse } from "next/server";
import {
  RT05_LOCATION,
  defaultAtmosphereByWib,
  describeWeatherCode,
  evaluateRainCondition,
  isWibDaytime,
  type Atmosphere,
  type LiveWeatherInfo,
} from "@/lib/atmosphere";

export const dynamic = "force-dynamic";

interface OpenMeteoCurrentResponse {
  current?: {
    temperature_2m?: number;
    is_day?: number;
    precipitation?: number;
    rain?: number;
    showers?: number;
    weather_code?: number;
    precipitation_probability?: number;
    wind_speed_10m?: number;
  };
}

export async function GET() {
  const { lat, lon, city, address } = RT05_LOCATION;
  const fallbackDay = isWibDaytime();
  const timeAtmosphere = defaultAtmosphereByWib();

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,is_day,precipitation,rain,showers,weather_code,precipitation_probability,wind_speed_10m&models=ecmwf_ifs&timezone=Asia%2FJakarta`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4500),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }

    const data = (await res.json()) as OpenMeteoCurrentResponse;
    const cur = data.current ?? {};
    const weatherCode = typeof cur.weather_code === "number" ? cur.weather_code : 0;
    const windSpeedKmh = typeof cur.wind_speed_10m === "number" ? Math.round(cur.wind_speed_10m) : 0;
    const isDay = typeof cur.is_day === "number" ? cur.is_day === 1 : fallbackDay;
    const precipitationMm = typeof cur.precipitation === "number" ? cur.precipitation : 0;
    const precipitationProbability =
      typeof cur.precipitation_probability === "number" ? cur.precipitation_probability : null;

    const isRaining = evaluateRainCondition({
      precipitationMm,
      weatherCode,
      precipitationProbability,
    });

    const atmosphere: Atmosphere = isRaining ? "rain" : timeAtmosphere;

    const payload: LiveWeatherInfo = {
      atmosphere,
      isRaining,
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

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
    });
  } catch {
    const fallbackPayload: LiveWeatherInfo = {
      atmosphere: timeAtmosphere,
      isRaining: false,
      isDay: fallbackDay,
      temperatureC: null,
      weatherCode: 0,
      conditionLabel: fallbackDay ? "Siang Cerah" : "Malam Tenang",
      city,
      address,
      updatedAt: new Date().toISOString(),
      precipitationMm: 0,
      precipitationProbability: null,
      windSpeedKmh: 0,
    };

    return NextResponse.json(fallbackPayload, {
      headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
    });
  }
}
