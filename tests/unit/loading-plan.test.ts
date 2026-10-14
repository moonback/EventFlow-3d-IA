import { describe, expect, it } from "vitest";
import { orderLoading, productUnitVolume, setupRank } from "@/lib/loading-plan";

const line = (name: string, category: string, quantity = 1, unitWeight: number | null = 10, unitVolume: number | null = 0.1) => ({ sku: name, name, category, quantity, unitWeight, unitVolume });

describe("ordre de chargement", () => {
  it("classe les catégories selon l'ordre d'installation sur le site", () => {
    expect(setupRank("Structure")).toBe(1);
    expect(setupRank("Distribution électrique")).toBe(2);
    expect(setupRank("Éclairage")).toBe(3);
    expect(setupRank("Mobilier")).toBe(4);
    expect(setupRank("Décoration")).toBe(5);
    expect(setupRank("Consommables")).toBe(6);
    expect(setupRank(null)).toBe(4);
  });

  it("charge en dernier ce qui est installé en premier (dernier chargé, premier déchargé)", () => {
    const steps = orderLoading([line("Pont alu", "Structure"), line("Nappe", "Décoration"), line("Lyre", "Éclairage"), line("Table", "Mobilier")]);
    expect(steps.map((s) => s.name)).toEqual(["Nappe", "Table", "Lyre", "Pont alu"]);
    expect(steps[0]!.zone).toBe("Fond de caisse");
    expect(steps.at(-1)!.zone).toBe("Près des portes");
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4]);
  });

  it("à priorité égale, charge d'abord le plus lourd ; ignore les quantités nulles", () => {
    const steps = orderLoading([line("Chaise", "Mobilier", 100, 3), line("Table", "Mobilier", 10, 20), line("Banc", "Mobilier", 0, 50)]);
    expect(steps.map((s) => s.name)).toEqual(["Chaise", "Table"]);
    expect(steps[0]!.weight).toBe(300);
  });

  it("calcule le volume à partir des dimensions quand il n'est pas renseigné", () => {
    expect(productUnitVolume({ volumeM3: null, lengthCm: 100, widthCm: 50, heightCm: 40 })).toBeCloseTo(0.2);
    expect(productUnitVolume({ volumeM3: "0.5", lengthCm: null, widthCm: null, heightCm: null })).toBe(0.5);
    expect(productUnitVolume({ volumeM3: null, lengthCm: 100, widthCm: null, heightCm: 40 })).toBeNull();
  });
});
