import { describe, expect, it } from "vitest";
import { computeAmbience, sunPosition } from "@/three/materials/ambience";

const deg = (r: number) => (r * 180) / Math.PI;
const paris = { lat: 48.857, lon: 2.352 };

describe("course du soleil", () => {
  it("donne l'élévation et l'azimut attendus à Paris (solstices, à midi solaire)", () => {
    const summer = sunPosition(new Date("2026-06-21T11:50:00Z"), paris.lat, paris.lon);
    const winter = sunPosition(new Date("2026-12-21T11:50:00Z"), paris.lat, paris.lon);
    expect(deg(summer.elevation)).toBeCloseTo(64.6, 0);
    expect(deg(winter.elevation)).toBeCloseTo(17.7, 0);
    expect(deg(summer.azimuth)).toBeGreaterThan(170);
    expect(deg(summer.azimuth)).toBeLessThan(190); // plein sud
  });

  it("passe en ambiance de nuit quand le soleil est couché, sauf éclairage forcé", () => {
    const site = { name: "Agence", accentColor: "#6366f1", timezone: "Europe/Paris", ...paris, located: true };
    const night = new Date("2026-10-13T21:00:00Z");
    expect(computeAmbience("dark", "auto", night, site).daylight).toBe(0);
    expect(computeAmbience("dark", "day", night, site).daylight).toBe(1);
    expect(computeAmbience("dark", "auto", new Date("2026-10-13T11:30:00Z"), site).daylight).toBe(1);
    expect(computeAmbience("light", "auto", night, site).background).not.toBe(computeAmbience("dark", "auto", night, site).background);
  });
});
