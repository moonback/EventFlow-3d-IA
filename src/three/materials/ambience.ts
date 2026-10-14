"use client";
import { createContext, useContext, useEffect, useState } from "react";
import * as THREE from "three";
import type { SceneData } from "@/features/scene/types";

const RAD = Math.PI / 180;

/**
 * Position du soleil (approximation NOAA, précision ~1°) : élévation au-dessus de l'horizon et azimut
 * (0 = nord, π/2 = est), en radians, pour une date et un lieu donnés.
 */
export function sunPosition(date: Date, lat: number, lon: number): { elevation: number; azimuth: number } {
  const jd = date.getTime() / 86_400_000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const epsilon = (23.439 - 0.0000004 * n) * RAD;
  const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const hourAngle = ((gmst * 15 + lon) * RAD - ra) % (2 * Math.PI);
  const phi = lat * RAD;
  const elevation = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle));
  const azimuth = Math.atan2(-Math.sin(hourAngle), Math.tan(decl) * Math.cos(phi) - Math.sin(phi) * Math.cos(hourAngle));
  return { elevation, azimuth: (azimuth + 2 * Math.PI) % (2 * Math.PI) };
}

/** Thème de l'application (classe « dark » sur <html>), suivi en direct. */
export function useAppTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

export type LightingMode = "auto" | "day" | "night";

export interface Ambience {
  theme: "dark" | "light";
  /** 0 = nuit noire, 1 = plein jour */
  daylight: number;
  /** 1 - daylight : intensité des éclairages artificiels */
  night: number;
  background: string;
  ground: string;
  lawn: string;
  asphalt: string;
  sidewalk: string;
  gridCell: string;
  gridSection: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambient: number;
  sunIntensity: number;
  sunColor: string;
  /** Direction d'où vient la lumière principale (soleil, ou lune la nuit) */
  sunDirection: [number, number, number];
  site: SceneData["site"];
}

const mix = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

const PALETTES = {
  dark: { night: { bg: "#04060c", lawn: "#0a140e", asphalt: "#10141d", sidewalk: "#1a2030", cell: "#151c2b", section: "#1c2538" }, day: { bg: "#0d1628", lawn: "#16301e", asphalt: "#1c2333", sidewalk: "#2b3448", cell: "#202a40", section: "#2b3853" } },
  light: { night: { bg: "#334262", lawn: "#2d4636", asphalt: "#4a5367", sidewalk: "#626c80", cell: "#56607a", section: "#626d89" }, day: { bg: "#cfe0f2", lawn: "#86b06f", asphalt: "#a3adbc", sidewalk: "#c9d0da", cell: "#b5c0ce", section: "#9aa6b8" } },
} as const;

/** Ambiance de la scène : thème de l'application × lumière du jour (réelle, ou forcée jour / nuit). */
export function computeAmbience(theme: "dark" | "light", mode: LightingMode, date: Date, site: SceneData["site"]): Ambience {
  const sun = sunPosition(date, site.lat, site.lon);
  const elevDeg = sun.elevation / RAD;
  // Transition sur le crépuscule civil (-6° → +6°)
  const daylight = mode === "day" ? 1 : mode === "night" ? 0 : Math.min(1, Math.max(0, (elevDeg + 6) / 12));
  const p = PALETTES[theme];
  const pick = (k: keyof (typeof p)["day"]) => mix(p.night[k], p.day[k], daylight);
  // Lumière : soleil (élévation bornée pour garder des ombres lisibles) ou lune fixe la nuit
  const useSun = mode === "day" || (mode === "auto" && elevDeg > -3);
  const el = useSun ? Math.max(15, mode === "day" ? 45 : elevDeg) * RAD : 35 * RAD;
  const az = useSun && mode !== "day" ? sun.azimuth : 225 * RAD;
  const dir: [number, number, number] = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
  const warm = Math.min(1, Math.max(0, (12 - elevDeg) / 12)); // soleil bas : lumière plus chaude
  return {
    theme,
    daylight,
    night: 1 - daylight,
    background: pick("bg"),
    ground: pick("lawn"),
    lawn: pick("lawn"),
    asphalt: pick("asphalt"),
    sidewalk: pick("sidewalk"),
    gridCell: pick("cell"),
    gridSection: pick("section"),
    hemiSky: theme === "dark" ? mix("#334155", "#c7d2fe", daylight) : mix("#64748b", "#ffffff", daylight),
    hemiGround: theme === "dark" ? "#0b0f19" : mix("#1e293b", "#94a3b8", daylight),
    hemiIntensity: 0.15 + daylight * (theme === "dark" ? 0.4 : 0.55),
    ambient: 0.08 + daylight * (theme === "dark" ? 0.14 : 0.3),
    sunIntensity: 0.12 + daylight * (theme === "dark" ? 1.6 : 2.1),
    sunColor: daylight < 0.2 ? "#9db4ff" : mix("#ffffff", "#ffc58a", useSun ? warm * 0.7 : 0),
    sunDirection: dir,
    site,
  };
}

export const AmbienceContext = createContext<Ambience | null>(null);
export const useAmbience = () => useContext(AmbienceContext);
