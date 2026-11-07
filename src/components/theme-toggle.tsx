"use client";

import { CloudRain, Moon, Sparkles, Sun, Sunrise, Sunset } from "lucide-react";
import {
  RT05_LOCATION,
  cycleWeatherMode,
  useAtmosphere,
  useWeatherSync,
  type Atmosphere,
} from "@/lib/atmosphere";

const ATMOSPHERE_META: Record<
  Atmosphere,
  { label: string; icon: typeof Sun; toneClass: string }
> = {
  morning: {
    label: "Pagi",
    icon: Sunrise,
    toneClass: "theme-toggle-icon--morning",
  },
  day: {
    label: "Siang",
    icon: Sun,
    toneClass: "theme-toggle-icon--day",
  },
  afternoon: {
    label: "Sore",
    icon: Sunset,
    toneClass: "theme-toggle-icon--afternoon",
  },
  night: {
    label: "Malam",
    icon: Moon,
    toneClass: "theme-toggle-icon--night",
  },
  rain: {
    label: "Hujan",
    icon: CloudRain,
    toneClass: "theme-toggle-icon--rain",
  },
};

export function ThemeToggle() {
  useWeatherSync();

  const { atmosphere, weatherMode, liveWeather } = useAtmosphere();
  const currentMeta = ATMOSPHERE_META[atmosphere] ?? ATMOSPHERE_META.day;
  const Icon = currentMeta.icon;
  const isAuto = weatherMode === "auto";

  const tempStr =
    liveWeather?.temperatureC !== null && liveWeather?.temperatureC !== undefined
      ? `${liveWeather.temperatureC}°C`
      : null;

  let displayLabel = currentMeta.label;
  if (isAuto) {
    displayLabel = tempStr
      ? `${RT05_LOCATION.city} · ${tempStr}`
      : `${RT05_LOCATION.city} · ${currentMeta.label}`;
  } else {
    displayLabel = `${currentMeta.label} (Manual)`;
  }

  const titleText = isAuto
    ? `Tema Otomatis ${RT05_LOCATION.city} (${RT05_LOCATION.address}): ${
        liveWeather?.conditionLabel ?? currentMeta.label
      }${tempStr ? `, ${tempStr}` : ""} — Klik untuk ganti suasana (Pagi / Siang / Sore / Malam / Hujan)`
    : `Suasana Manual: ${currentMeta.label} — Klik untuk ganti (Pagi / Siang / Sore / Malam / Hujan / Otomatis RT.05)`;

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      onClick={cycleWeatherMode}
      title={titleText}
      aria-label={titleText}
    >
      <span
        key={`${weatherMode}-${atmosphere}`}
        className={`theme-toggle-icon ${currentMeta.toneClass}`}
        aria-hidden="true"
      >
        <Icon size={16} />
      </span>
      <span className="theme-toggle-label">{displayLabel}</span>
      {isAuto ? (
        <span className="theme-toggle-live-badge" aria-hidden="true">
          <Sparkles size={10} />
          <span>Live</span>
        </span>
      ) : null}
    </button>
  );
}
