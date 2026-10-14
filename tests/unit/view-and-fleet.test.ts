import { describe, expect, it } from "vitest";
import { activeFleetCount } from "@/three/objects/warehouse-fleet";
import { decodeView, encodeView } from "@/three/ui/view-bookmarks";

describe("points de vue partageables", () => {
  it("encode et décode la position de caméra dans l'adresse", () => {
    const v = { position: [6.04, 54, 87] as [number, number, number], target: [0, 0, 36.26] as [number, number, number] };
    expect(encodeView(v)).toBe("6,54,87,0,0,36.3");
    expect(decodeView(encodeView(v))).toEqual({ position: [6, 54, 87], target: [0, 0, 36.3] });
  });
  it("refuse un paramètre invalide ou hors limites", () => {
    expect(decodeView(null)).toBeNull();
    expect(decodeView("1,2,3")).toBeNull();
    expect(decodeView("1,2,3,a,5,6")).toBeNull();
    expect(decodeView("1,2,3,4,5,9999")).toBeNull();
  });
});

describe("engins de l'entrepôt", () => {
  it("met en circulation plus d'engins quand l'activité du jour augmente", () => {
    expect(activeFleetCount(0)).toBe(0);
    expect(activeFleetCount(1)).toBe(1);
    expect(activeFleetCount(5)).toBe(2);
    expect(activeFleetCount(132)).toBe(3);
  });
});
