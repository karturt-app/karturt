"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useAtmosphere, type Atmosphere } from "@/lib/atmosphere";

interface RainDrop {
  x: number;
  y: number;
  targetY: number;
  length: number;
  speed: number;
  thickness: number;
  opacity: number;
  scale: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  speed: number;
  lineWidth: number;
  hasSecondRing: boolean;
}

interface SplashDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  radius: number;
  opacity: number;
}

interface LightningFlash {
  active: boolean;
  alpha: number;
  boltX: number;
  segments: Array<{ x: number; y: number }>;
  cooldown: number;
}

interface DewBubble {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  swaySpeed: number;
  swayAmp: number;
  phase: number;
  opacity: number;
}

interface BirdItem {
  x: number;
  y: number;
  speedX: number;
  speedY: number;
  wingPhase: number;
  scale: number;
}

interface CloudItem {
  x: number;
  y: number;
  scale: number;
  speed: number;
  opacity: number;
}

interface PaperPlane {
  x: number;
  y: number;
  baseY: number;
  speedX: number;
  scale: number;
  phase: number;
  pitch: number;
}

interface DandelionSeed {
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  angle: number;
  swingSpeed: number;
  phase: number;
  opacity: number;
}

interface StarItem {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  phase: number;
  isCross: boolean;
}

interface FireflyItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  opacity: number;
  active: boolean;
  cooldown: number;
}

interface WindStreak {
  x: number;
  y: number;
  length: number;
  speed: number;
  amp: number;
  phase: number;
  opacity: number;
}

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

export function AtmosphereBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { atmosphere, weatherMode, liveWeather } = useAtmosphere();
  const weatherCode = liveWeather?.weatherCode ?? 0;
  const windSpeedKmh = liveWeather?.windSpeedKmh ?? 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const isManual = weatherMode !== "auto";
    const isThunderstorm = weatherCode >= 95 || (isManual && atmosphere === "rain");
    const isWindy =
      windSpeedKmh >= 18 ||
      (isManual && (atmosphere === "rain" || atmosphere === "afternoon" || atmosphere === "day"));
    const isOvercastOrFog =
      weatherCode === 3 ||
      weatherCode === 45 ||
      weatherCode === 48 ||
      (isManual && atmosphere === "morning");
    const windMultiplier = isWindy ? 1.55 : 1;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const drops: RainDrop[] = [];
    const ripples: Ripple[] = [];
    const splashes: SplashDrop[] = [];
    const lightning: LightningFlash = {
      active: false,
      alpha: 0,
      boltX: width * 0.5,
      segments: [],
      cooldown: isManual ? 40 : 140,
    };

    const dewBubbles: DewBubble[] = [];
    const clouds: CloudItem[] = [];
    const birds: BirdItem[] = [];
    const paperPlanes: PaperPlane[] = [];
    const dandelions: DandelionSeed[] = [];

    const stars: StarItem[] = [];
    const fireflies: FireflyItem[] = [];
    const shootingStar: ShootingStar = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      length: 90,
      opacity: 0,
      active: false,
      cooldown: isManual ? 55 : 160,
    };

    const windStreaks: WindStreak[] = [];

    const createDrop = (initialRandomY = false): RainDrop => {
      const depth = 0.35 + Math.random() * 0.65;
      const targetY = height * (0.58 + depth * 0.38);
      return {
        x: Math.random() * (width + 120) - 60,
        y: initialRandomY ? Math.random() * targetY : -20 - Math.random() * 350,
        targetY,
        length: 15 + depth * 19,
        speed: 6.8 + depth * 6.5,
        thickness: 0.9 + depth * 1.0,
        opacity: 0.25 + depth * 0.38,
        scale: depth,
      };
    };

    const populateScene = (mode: Atmosphere) => {
      const streakCount = isWindy
        ? width < 640
          ? 5
          : 8
        : mode === "morning" || mode === "afternoon"
          ? 3
          : 0;
      for (let i = 0; i < streakCount; i++) {
        windStreaks.push({
          x: Math.random() * width,
          y: 110 + Math.random() * (height * 0.68),
          length: 95 + Math.random() * 90,
          speed: (1.2 + Math.random() * 0.9) * windMultiplier,
          amp: 5 + Math.random() * 6,
          phase: Math.random() * Math.PI * 2,
          opacity: isWindy ? 0.22 : 0.13,
        });
      }

      if (mode === "rain") {
        const dropCount = width < 640 ? 30 : 52;
        for (let i = 0; i < dropCount; i++) drops.push(createDrop(true));
        if (reducedMotion) {
          for (let i = 0; i < 8; i++) {
            ripples.push({
              x: width * (0.12 + i * 0.11),
              y: height * (0.68 + (i % 3) * 0.09),
              radius: 18 + (i % 4) * 12,
              maxRadius: 60,
              opacity: 0.3,
              speed: 0,
              lineWidth: 1.2,
              hasSecondRing: true,
            });
          }
        }
      } else if (mode === "morning") {
        const bubbleCount = width < 640 ? 14 : 22;
        for (let i = 0; i < bubbleCount; i++) {
          dewBubbles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: 3.5 + Math.random() * 6.5,
            speedY: 0.22 + Math.random() * 0.35,
            swaySpeed: 0.8 + Math.random() * 0.7,
            swayAmp: 0.25 + Math.random() * 0.35,
            phase: Math.random() * Math.PI * 2,
            opacity: 0.24 + Math.random() * 0.28,
          });
        }
        const cloudCount = width < 640 ? 3 : 4;
        for (let i = 0; i < cloudCount; i++) {
          clouds.push({
            x: (width / cloudCount) * i + Math.random() * 80,
            y: 120 + (i % 2) * 55 + Math.random() * 20,
            scale: 0.6 + (i % 3) * 0.2,
            speed: (0.16 + (i % 3) * 0.08) * windMultiplier,
            opacity: 0.2 + (i % 2) * 0.07,
          });
        }
        for (let i = 0; i < 4; i++) {
          birds.push({
            x: Math.random() * width * 0.7,
            y: 135 + i * 24,
            speedX: (0.48 + i * 0.07) * windMultiplier,
            speedY: -0.06,
            wingPhase: i * 1.3,
            scale: 0.72 + (i % 3) * 0.14,
          });
        }
      } else if (mode === "day") {
        const cloudCount = isOvercastOrFog ? (width < 640 ? 6 : 8) : width < 640 ? 4 : 6;
        for (let i = 0; i < cloudCount; i++) {
          clouds.push({
            x: (width / cloudCount) * i + Math.random() * 90,
            y: 110 + (i % 3) * 54 + Math.random() * 24,
            scale: 0.68 + (i % 3) * 0.24,
            speed: (0.2 + (i % 3) * 0.1) * windMultiplier,
            opacity: isOvercastOrFog ? 0.3 + (i % 2) * 0.1 : 0.22 + (i % 2) * 0.08,
          });
        }
        const planeCount = width < 640 ? 2 : 3;
        for (let i = 0; i < planeCount; i++) {
          const baseY = 175 + i * 115 + Math.random() * 35;
          paperPlanes.push({
            x: (width / planeCount) * i + Math.random() * 120,
            y: baseY,
            baseY,
            speedX: (0.65 + i * 0.18) * windMultiplier,
            scale: 0.78 + (i % 2) * 0.18,
            phase: i * 2.1,
            pitch: 0,
          });
        }
      } else if (mode === "afternoon") {
        const seedCount = width < 640 ? 11 : 17;
        for (let i = 0; i < seedCount; i++) {
          dandelions.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (0.28 + Math.random() * 0.26) * windMultiplier,
            vy: -0.14 - Math.random() * 0.18,
            scale: 0.72 + Math.random() * 0.42,
            angle: (Math.random() - 0.5) * 0.3,
            swingSpeed: 1.1 + Math.random() * 0.8,
            phase: Math.random() * Math.PI * 2,
            opacity: 0.38 + Math.random() * 0.32,
          });
        }
        const cloudCount = width < 640 ? 3 : 5;
        for (let i = 0; i < cloudCount; i++) {
          clouds.push({
            x: (width / cloudCount) * i + Math.random() * 90,
            y: 120 + (i % 3) * 55 + Math.random() * 20,
            scale: 0.65 + (i % 3) * 0.22,
            speed: (0.16 + (i % 3) * 0.08) * windMultiplier,
            opacity: 0.22 + (i % 2) * 0.08,
          });
        }
        for (let i = 0; i < 5; i++) {
          birds.push({
            x: Math.random() * width * 0.5 + i * 22,
            y: 140 + Math.abs(i - 2) * 14,
            speedX: (0.55 + (i % 2) * 0.06) * windMultiplier,
            speedY: -0.04,
            wingPhase: i * 0.9,
            scale: 0.7 + (i % 3) * 0.12,
          });
        }
      } else {
        const starCount = width < 640 ? 42 : 75;
        for (let i = 0; i < starCount; i++) {
          stars.push({
            x: Math.random() * width,
            y: Math.random() * (height * 0.75),
            size: 0.8 + Math.random() * 1.6,
            baseAlpha: 0.22 + Math.random() * 0.5,
            twinkleSpeed: 0.02 + Math.random() * 0.035,
            phase: Math.random() * Math.PI * 2,
            isCross: i % 8 === 0,
          });
        }
        const fireflyCount = width < 640 ? 12 : 20;
        for (let i = 0; i < fireflyCount; i++) {
          fireflies.push({
            x: Math.random() * width,
            y: height * 0.35 + Math.random() * (height * 0.6),
            vx: (Math.random() - 0.5) * 0.45,
            vy: (Math.random() - 0.5) * 0.35,
            radius: 1.8 + Math.random() * 1.8,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
    };

    populateScene(atmosphere);

    let tick = 0;

    const drawCloudShape = (
      cx: number,
      cy: number,
      scale: number,
      opacity: number,
      fillRgb = "255, 255, 255",
      strokeRgb = "20, 48, 58",
    ) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      ctx.beginPath();
      ctx.arc(0, 0, 26, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(28, -14, 30, Math.PI * 1.0, Math.PI * 1.85);
      ctx.arc(64, -6, 26, Math.PI * 1.15, Math.PI * 1.95);
      ctx.arc(88, 6, 20, Math.PI * 1.3, Math.PI * 0.5);
      ctx.closePath();

      ctx.fillStyle = `rgba(${fillRgb}, ${(opacity * 0.78).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${strokeRgb}, ${(opacity * 0.36).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    };

    const renderWindStreaks = (rgb: string) => {
      for (let i = 0; i < windStreaks.length; i++) {
        const w = windStreaks[i]!;
        ctx.beginPath();
        const steps = 16;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const px = w.x + t * w.length;
          const py = w.y + Math.sin(t * Math.PI * 2 + tick * 2.2 + w.phase) * w.amp;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        const grad = ctx.createLinearGradient(w.x, w.y, w.x + w.length, w.y);
        grad.addColorStop(0, `rgba(${rgb}, 0)`);
        grad.addColorStop(0.5, `rgba(${rgb}, ${w.opacity.toFixed(3)})`);
        grad.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.3;
        ctx.lineCap = "round";
        ctx.stroke();

        if (!reducedMotion) {
          w.x += w.speed;
          if (w.x > width + 60) {
            w.x = -w.length - 40;
            w.y = 100 + Math.random() * (height * 0.72);
          }
        }
      }
    };

    const renderOvercastMist = (rgb: string) => {
      if (!isOvercastOrFog) return;
      for (let m = 0; m < 3; m++) {
        const baseY = height * (0.28 + m * 0.22);
        const grad = ctx.createLinearGradient(0, baseY - 38, 0, baseY + 38);
        grad.addColorStop(0, `rgba(${rgb}, 0)`);
        grad.addColorStop(0.5, `rgba(${rgb}, 0.14)`);
        grad.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, baseY - 38, width, 76);
      }
    };

    const renderRain = () => {
      const strokeMain = "226, 238, 248";
      const strokeAccent = "103, 232, 249";

      if (isThunderstorm && !reducedMotion) {
        if (!lightning.active) {
          lightning.cooldown -= 1;
          if (lightning.cooldown <= 0) {
            lightning.active = true;
            lightning.alpha = 0.22;
            lightning.boltX = width * (0.18 + Math.random() * 0.64);
            lightning.segments = [];
            let cx = lightning.boltX;
            let cy = 0;
            const maxBoltY = height * 0.42;
            while (cy < maxBoltY) {
              lightning.segments.push({ x: cx, y: cy });
              cx += (Math.random() - 0.5) * 28;
              cy += 18 + Math.random() * 22;
            }
          }
        } else {
          ctx.fillStyle = `rgba(186, 230, 253, ${(lightning.alpha * 0.55).toFixed(3)})`;
          ctx.fillRect(0, 0, width, height);

          if (lightning.segments.length > 1) {
            ctx.beginPath();
            for (let i = 0; i < lightning.segments.length; i++) {
              const pt = lightning.segments[i]!;
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            }
            ctx.strokeStyle = `rgba(224, 242, 254, ${(lightning.alpha * 1.9).toFixed(3)})`;
            ctx.lineWidth = 1.6;
            ctx.stroke();
          }

          lightning.alpha -= 0.016;
          if (lightning.alpha <= 0) {
            lightning.active = false;
            lightning.cooldown = 210 + Math.floor(Math.random() * 240);
          }
        }
      }

      const baseWaveY1 = height - 48;
      const baseWaveY2 = height - 26;

      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 12) {
        const y =
          baseWaveY1 +
          Math.sin(x * 0.008 + tick * 0.9) * 7 +
          Math.cos(x * 0.018 - tick * 0.6) * 4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = "rgba(103, 232, 249, 0.03)";
      ctx.fill();

      ctx.beginPath();
      for (let x = 0; x <= width; x += 10) {
        const y =
          baseWaveY1 +
          Math.sin(x * 0.008 + tick * 0.9) * 7 +
          Math.cos(x * 0.018 - tick * 0.6) * 4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${strokeMain}, 0.16)`;
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 10) {
        const y =
          baseWaveY2 +
          Math.sin(x * 0.011 - tick * 1.15) * 6 +
          Math.sin(x * 0.024 + tick * 0.8) * 3.5;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = "rgba(103, 232, 249, 0.045)";
      ctx.fill();

      ctx.beginPath();
      for (let x = 0; x <= width; x += 10) {
        const y =
          baseWaveY2 +
          Math.sin(x * 0.011 - tick * 1.15) * 6 +
          Math.sin(x * 0.024 + tick * 0.8) * 3.5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${strokeAccent}, 0.26)`;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]!;
        const progress = r.radius / r.maxRadius;
        const alpha = Math.max(0, r.opacity * (1 - progress));

        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.32, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${strokeMain}, ${alpha.toFixed(3)})`;
        ctx.lineWidth = r.lineWidth;
        ctx.stroke();

        if (r.hasSecondRing && r.radius > 10) {
          const innerRadius = r.radius * 0.58;
          const innerAlpha = alpha * 0.65;
          ctx.beginPath();
          ctx.ellipse(r.x, r.y, innerRadius, innerRadius * 0.32, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${strokeAccent}, ${innerAlpha.toFixed(3)})`;
          ctx.lineWidth = Math.max(0.7, r.lineWidth * 0.75);
          ctx.stroke();
        }

        if (r.radius > 4 && r.radius < r.maxRadius * 0.45) {
          const coreRadius = r.radius * 0.25;
          ctx.beginPath();
          ctx.ellipse(r.x, r.y, coreRadius, coreRadius * 0.32, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${strokeAccent}, ${(alpha * 0.55).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        if (!reducedMotion) {
          r.radius += r.speed;
          if (r.radius >= r.maxRadius) ripples.splice(i, 1);
        }
      }

      if (reducedMotion) return;

      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i]!;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${strokeAccent}, ${s.opacity.toFixed(3)})`;
        ctx.fill();

        s.x += s.vx;
        s.y += s.vy;
        s.vy += s.gravity;
        s.opacity -= 0.024;
        if (s.opacity <= 0) splashes.splice(i, 1);
      }

      const windX = isWindy ? 1.35 : 0.65;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i]!;
        const tailX = d.x - windX * (d.length / d.speed);
        const tailY = d.y - d.length;

        const grad = ctx.createLinearGradient(tailX, tailY, d.x, d.y);
        grad.addColorStop(0, `rgba(${strokeMain}, 0)`);
        grad.addColorStop(0.6, `rgba(${strokeMain}, ${(d.opacity * 0.65).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${strokeAccent}, ${d.opacity.toFixed(3)})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(d.x, d.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = d.thickness;
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.thickness * 0.75, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${strokeAccent}, ${(d.opacity * 0.85).toFixed(3)})`;
        ctx.fill();

        d.x += windX;
        d.y += d.speed;

        if (d.y >= d.targetY) {
          if (ripples.length < 40) {
            ripples.push({
              x: d.x,
              y: d.targetY,
              radius: 1.5,
              maxRadius: 26 + d.scale * 44,
              opacity: 0.36 + d.scale * 0.24,
              speed: 0.45 + d.scale * 0.4,
              lineWidth: 0.9 + d.scale * 0.75,
              hasSecondRing: d.scale > 0.52,
            });
          }

          if (d.scale > 0.55 && splashes.length < 45) {
            const count = d.scale > 0.8 ? 3 : 2;
            for (let k = 0; k < count; k++) {
              const dir = k === 0 ? -1 : k === 1 ? 1 : Math.random() - 0.5;
              splashes.push({
                x: d.x,
                y: d.targetY,
                vx: dir * (0.7 + Math.random() * 1.1),
                vy: -(1.6 + Math.random() * 1.5) * d.scale,
                gravity: 0.14,
                radius: 1.0 + d.scale * 0.7,
                opacity: 0.48 * d.scale,
              });
            }
          }

          Object.assign(d, createDrop(false));
        }
      }

      renderWindStreaks("103, 232, 249");
    };

    const renderMorning = () => {
      const sunX = width - Math.min(135, Math.max(95, width * 0.16));
      const sunY = Math.max(155, Math.floor(height * 0.23));

      const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 260);
      sunGlow.addColorStop(0, "rgba(251, 191, 36, 0.22)");
      sunGlow.addColorStop(0.5, "rgba(16, 185, 129, 0.08)");
      sunGlow.addColorStop(1, "rgba(16, 185, 129, 0)");
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 260, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(15, 118, 110, 0.16)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(254, 243, 199, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(15, 118, 110, 0.36)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      for (let r = 0; r < 2; r++) {
        const ribbonY = height * (0.34 + r * 0.28);
        ctx.beginPath();
        for (let x = 0; x <= width; x += 16) {
          const y =
            ribbonY +
            Math.sin(x * 0.0055 - tick * 0.85 + r * 1.7) * 14 +
            Math.cos(x * 0.011 + tick * 0.5) * 6;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = r === 0 ? "rgba(15, 118, 110, 0.11)" : "rgba(217, 119, 6, 0.09)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i]!;
        drawCloudShape(c.x, c.y, c.scale, c.opacity, "255, 255, 255", "20, 83, 45");
        if (!reducedMotion) {
          c.x += c.speed;
          if (c.x > width + 140) c.x = -160;
        }
      }

      for (let i = 0; i < birds.length; i++) {
        const b = birds[i]!;
        const flap = Math.sin(tick * 3.4 + b.wingPhase) * 4.5;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(b.scale, b.scale);
        ctx.beginPath();
        ctx.moveTo(-9, flap);
        ctx.quadraticCurveTo(-4, -4, 0, 0);
        ctx.quadraticCurveTo(4, -4, 9, flap);
        ctx.strokeStyle = "rgba(15, 118, 110, 0.36)";
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();

        if (!reducedMotion) {
          b.x += b.speedX;
          b.y += Math.sin(tick + b.wingPhase) * 0.12;
          if (b.x > width + 40) {
            b.x = -40;
            b.y = 120 + Math.random() * 100;
          }
        }
      }

      for (let i = 0; i < dewBubbles.length; i++) {
        const b = dewBubbles[i]!;
        const pulse = 0.85 + 0.15 * Math.sin(tick * 1.4 + b.phase);
        const r = b.radius * pulse;

        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${(b.opacity * 0.45).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(15, 118, 110, ${(b.opacity * 0.85).toFixed(3)})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(b.x - r * 0.34, b.y - r * 0.34, Math.max(1.0, r * 0.22), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${(b.opacity * 1.3).toFixed(3)})`;
        ctx.fill();

        if (!reducedMotion) {
          b.y -= b.speedY;
          b.x += Math.sin(tick * b.swaySpeed + b.phase) * b.swayAmp;
          if (b.y < -20) {
            b.y = height + 20;
            b.x = Math.random() * width;
          }
        }
      }

      renderOvercastMist("255, 255, 255");
      renderWindStreaks("15, 118, 110");
    };

    const drawPaperPlane = (plane: PaperPlane) => {
      ctx.save();
      ctx.translate(plane.x, plane.y);
      ctx.rotate(plane.pitch);
      ctx.scale(plane.scale, plane.scale);

      ctx.beginPath();
      ctx.moveTo(-22, 2);
      ctx.quadraticCurveTo(-38, 5, -54, 1);
      ctx.strokeStyle = "rgba(33, 107, 99, 0.24)";
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-14, -9);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(19, 40, 50, 0.38)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-11, 5);
      ctx.closePath();
      ctx.fillStyle = "rgba(223, 240, 236, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(19, 40, 50, 0.38)";
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-11, 5);
      ctx.lineTo(-15, 9);
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      ctx.fill();
      ctx.strokeStyle = "rgba(19, 40, 50, 0.38)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();
    };

    const renderDay = () => {
      const sunX = width - Math.min(130, Math.max(90, width * 0.14));
      const sunY = Math.max(130, Math.floor(height * 0.17));

      if (!isOvercastOrFog) {
        const rayAngles = [2.15, 2.38, 2.62];
        for (let r = 0; r < rayAngles.length; r++) {
          const angle = rayAngles[r]! + Math.sin(tick * 0.4 + r) * 0.02;
          const beamLen = Math.max(width, height) * 0.75;
          const endX = sunX + Math.cos(angle) * beamLen;
          const endY = sunY + Math.sin(angle) * beamLen;

          const grad = ctx.createLinearGradient(sunX, sunY, endX, endY);
          grad.addColorStop(0, "rgba(245, 158, 11, 0.08)");
          grad.addColorStop(0.6, "rgba(245, 158, 11, 0.025)");
          grad.addColorStop(1, "rgba(245, 158, 11, 0)");

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(sunX, sunY);
          ctx.lineTo(
            sunX + Math.cos(angle - 0.07) * beamLen,
            sunY + Math.sin(angle - 0.07) * beamLen,
          );
          ctx.lineTo(
            sunX + Math.cos(angle + 0.07) * beamLen,
            sunY + Math.sin(angle + 0.07) * beamLen,
          );
          ctx.closePath();
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.restore();
        }
      }

      const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 240);
      sunGlow.addColorStop(0, "rgba(245, 158, 11, 0.20)");
      sunGlow.addColorStop(0.45, "rgba(245, 158, 11, 0.07)");
      sunGlow.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 240, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.rotate(tick * 0.15);
      const rayCount = 12;
      for (let i = 0; i < rayCount; i++) {
        const angle = (i * Math.PI * 2) / rayCount;
        const r1 = 30;
        const r2 = i % 2 === 0 ? 44 : 37;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
        ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
        ctx.strokeStyle = "rgba(180, 83, 9, 0.28)";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(254, 243, 199, 0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(180, 83, 9, 0.36)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i]!;
        drawCloudShape(c.x, c.y, c.scale, c.opacity);
        if (!reducedMotion) {
          c.x += c.speed;
          if (c.x > width + 140) c.x = -160;
        }
      }

      for (let i = 0; i < paperPlanes.length; i++) {
        const p = paperPlanes[i]!;
        const wave = Math.sin(tick * 1.3 + p.phase);
        p.y = p.baseY + wave * 14;
        p.pitch = Math.cos(tick * 1.3 + p.phase) * 0.12;
        drawPaperPlane(p);

        if (!reducedMotion) {
          p.x += p.speedX;
          if (p.x > width + 80) {
            p.x = -80;
            p.baseY = 145 + Math.random() * (height * 0.45);
          }
        }
      }

      renderOvercastMist("255, 255, 255");
      renderWindStreaks("33, 107, 99");
    };

    const drawDandelionSeed = (seed: DandelionSeed) => {
      ctx.save();
      ctx.translate(seed.x, seed.y);
      ctx.rotate(seed.angle);
      ctx.scale(seed.scale, seed.scale);

      const strokeCol = `rgba(154, 52, 18, ${seed.opacity.toFixed(3)})`;
      const plumeCol = `rgba(255, 247, 237, ${(seed.opacity * 1.15).toFixed(3)})`;

      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.lineTo(0, -4);
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1.15;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 8.5, 1.3, 2.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = strokeCol;
      ctx.fill();

      const fanAngles = [-0.85, -0.56, -0.28, 0, 0.28, 0.56, 0.85];
      for (let i = 0; i < fanAngles.length; i++) {
        const a = fanAngles[i]! - Math.PI / 2;
        const rx = Math.cos(a) * 9.5;
        const ry = -4 + Math.sin(a) * 9.5;
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(rx, ry);
        ctx.strokeStyle = plumeCol;
        ctx.lineWidth = 1.05;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rx, ry, 1.0, 0, Math.PI * 2);
        ctx.fillStyle = plumeCol;
        ctx.fill();
      }

      ctx.restore();
    };

    const renderAfternoon = () => {
      const sunX = width - Math.min(145, Math.max(95, width * 0.17));
      const sunY = Math.max(185, Math.floor(height * 0.28));

      const sunGlow = ctx.createRadialGradient(sunX, sunY, 12, sunX, sunY, 290);
      sunGlow.addColorStop(0, "rgba(234, 88, 12, 0.25)");
      sunGlow.addColorStop(0.48, "rgba(245, 158, 11, 0.12)");
      sunGlow.addColorStop(1, "rgba(234, 88, 12, 0)");
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 290, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(sunX, sunY);
      const sunGrad = ctx.createLinearGradient(0, -34, 0, 34);
      sunGrad.addColorStop(0, "rgba(253, 186, 116, 0.92)");
      sunGrad.addColorStop(1, "rgba(234, 88, 12, 0.78)");

      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fillStyle = sunGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(194, 65, 12, 0.42)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const sliceOffsets = [8, 16, 23, 29];
      for (let s = 0; s < sliceOffsets.length; s++) {
        const sy = sliceOffsets[s]!;
        const halfChord = Math.sqrt(Math.max(0, 34 * 34 - sy * sy)) + 10;
        ctx.beginPath();
        ctx.moveTo(-halfChord, sy);
        ctx.lineTo(halfChord, sy);
        ctx.strokeStyle = "rgba(248, 239, 230, 0.78)";
        ctx.lineWidth = 1.6 + s * 0.35;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.restore();

      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i]!;
        drawCloudShape(c.x, c.y, c.scale, c.opacity, "255, 237, 213", "154, 52, 18");
        if (!reducedMotion) {
          c.x += c.speed;
          if (c.x > width + 140) c.x = -160;
        }
      }

      for (let i = 0; i < birds.length; i++) {
        const b = birds[i]!;
        const flap = Math.sin(tick * 3.0 + b.wingPhase) * 4.5;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(b.scale, b.scale);
        ctx.beginPath();
        ctx.moveTo(-9, flap);
        ctx.quadraticCurveTo(-4, -4, 0, 0);
        ctx.quadraticCurveTo(4, -4, 9, flap);
        ctx.strokeStyle = "rgba(154, 52, 18, 0.42)";
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();

        if (!reducedMotion) {
          b.x += b.speedX;
          b.y += Math.sin(tick + b.wingPhase) * 0.14;
          if (b.x > width + 50) {
            b.x = -50;
            b.y = 125 + Math.random() * 110;
          }
        }
      }

      for (let i = 0; i < dandelions.length; i++) {
        const d = dandelions[i]!;
        d.angle = Math.sin(tick * d.swingSpeed + d.phase) * 0.28;
        drawDandelionSeed(d);

        if (!reducedMotion) {
          d.x += d.vx + Math.cos(tick * 0.7 + d.phase) * 0.18;
          d.y += d.vy + Math.sin(tick * 0.9 + d.phase) * 0.12;
          if (d.x > width + 30) d.x = -30;
          if (d.y < -30) {
            d.y = height + 30;
            d.x = Math.random() * width;
          }
        }
      }

      renderOvercastMist("254, 215, 170");
      renderWindStreaks("194, 65, 12");
    };

    const renderNight = () => {
      const moonX = width - Math.min(125, Math.max(85, width * 0.14));
      const moonY = Math.max(126, Math.floor(height * 0.16));

      const moonGlow = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, 170);
      moonGlow.addColorStop(0, "rgba(236, 244, 241, 0.14)");
      moonGlow.addColorStop(0.5, "rgba(130, 200, 188, 0.05)");
      moonGlow.addColorStop(1, "rgba(13, 22, 27, 0)");
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 170, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(moonX, moonY);
      ctx.rotate(-0.35);
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0.25 * Math.PI, 1.75 * Math.PI, false);
      ctx.arc(9, -4, 18, 1.68 * Math.PI, 0.32 * Math.PI, true);
      ctx.closePath();
      ctx.fillStyle = "rgba(236, 244, 241, 0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(130, 200, 188, 0.4)";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();

      for (let i = 0; i < stars.length; i++) {
        const st = stars[i]!;
        const twinkle = 0.45 + 0.55 * Math.sin(tick * 2.2 * (st.twinkleSpeed * 35) + st.phase);
        const alpha = st.baseAlpha * twinkle;

        if (st.isCross) {
          const r = st.size * 2.3;
          ctx.beginPath();
          ctx.moveTo(st.x - r, st.y);
          ctx.lineTo(st.x + r, st.y);
          ctx.moveTo(st.x, st.y - r);
          ctx.lineTo(st.x, st.y + r);
          ctx.strokeStyle = `rgba(236, 244, 241, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 0.9;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(236, 244, 241, ${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      if (!reducedMotion) {
        if (!shootingStar.active) {
          shootingStar.cooldown -= 1;
          if (shootingStar.cooldown <= 0) {
            shootingStar.active = true;
            shootingStar.x = width * (0.2 + Math.random() * 0.6);
            shootingStar.y = 30 + Math.random() * (height * 0.25);
            shootingStar.vx = -6.5 - Math.random() * 3;
            shootingStar.vy = 3.2 + Math.random() * 2;
            shootingStar.opacity = 0.85;
          }
        } else {
          const tailX = shootingStar.x - shootingStar.vx * 10;
          const tailY = shootingStar.y - shootingStar.vy * 10;
          const grad = ctx.createLinearGradient(
            tailX,
            tailY,
            shootingStar.x,
            shootingStar.y,
          );
          grad.addColorStop(0, "rgba(236, 244, 241, 0)");
          grad.addColorStop(1, `rgba(130, 200, 188, ${shootingStar.opacity.toFixed(3)})`);

          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(shootingStar.x, shootingStar.y);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.lineCap = "round";
          ctx.stroke();

          shootingStar.x += shootingStar.vx;
          shootingStar.y += shootingStar.vy;
          shootingStar.opacity -= 0.022;

          if (shootingStar.opacity <= 0) {
            shootingStar.active = false;
            shootingStar.cooldown = 240 + Math.floor(Math.random() * 260);
          }
        }
      }

      for (let i = 0; i < fireflies.length; i++) {
        const f = fireflies[i]!;
        const glow = 0.3 + 0.7 * Math.max(0, Math.sin(tick * 1.8 + f.phase));

        const radGrad = ctx.createRadialGradient(f.x, f.y, 0.5, f.x, f.y, f.radius * 4.5);
        radGrad.addColorStop(0, `rgba(198, 244, 50, ${(glow * 0.55).toFixed(3)})`);
        radGrad.addColorStop(1, "rgba(198, 244, 50, 0)");
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius * 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(236, 244, 241, ${(glow * 0.85).toFixed(3)})`;
        ctx.fill();

        if (!reducedMotion) {
          f.x += f.vx + Math.cos(tick + f.phase) * 0.18;
          f.y += f.vy + Math.sin(tick * 0.8 + f.phase) * 0.15;
          if (f.x < -20) f.x = width + 20;
          if (f.x > width + 20) f.x = -20;
          if (f.y < height * 0.25) f.vy = Math.abs(f.vy);
          if (f.y > height - 20) f.vy = -Math.abs(f.vy);
        }
      }

      renderOvercastMist("148, 163, 184");
      renderWindStreaks("130, 200, 188");
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      tick += reducedMotion ? 0 : 0.022;

      if (atmosphere === "rain") {
        renderRain();
      } else if (atmosphere === "morning") {
        renderMorning();
      } else if (atmosphere === "day") {
        renderDay();
      } else if (atmosphere === "afternoon") {
        renderAfternoon();
      } else {
        renderNight();
      }

      if (!reducedMotion) {
        animationFrameId = window.requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [atmosphere, weatherMode, weatherCode, windSpeedKmh, reducedMotion]);

  return (
    <div aria-hidden="true" className="atmosphere-backdrop">
      <canvas ref={canvasRef} className="atmosphere-backdrop-canvas" />
    </div>
  );
}
