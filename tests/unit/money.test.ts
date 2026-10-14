import { describe, expect, it } from "vitest";
import { computeDocumentTotals, computeLineTotal, formatMoney, round2 } from "@/lib/money";

describe("calculs monétaires", () => {
  it("n'utilise pas l'arithmétique flottante", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(computeDocumentTotals([{ quantity: "1", unitPrice: "0.10", vatRate: "0" }, { quantity: "1", unitPrice: "0.20", vatRate: "0" }]).totalExclTax).toBe("0.30");
  });

  it("arrondit au centime (demi supérieur)", () => {
    expect(round2("2.675").toFixed(2)).toBe("2.68");
    expect(round2("1.005").toFixed(2)).toBe("1.01");
    expect(computeLineTotal({ quantity: "3", unitPrice: "33.335", vatRate: "20" }).toFixed(2)).toBe("100.01");
  });

  it("gère de grands volumes sans perte de précision", () => {
    const lines = Array.from({ length: 1000 }, () => ({ quantity: "1", unitPrice: "0.01", vatRate: "20" }));
    const t = computeDocumentTotals(lines);
    expect(t.totalExclTax).toBe("10.00");
    expect(t.totalTax).toBe("2.00");
    expect(t.totalInclTax).toBe("12.00");
  });

  it("rejette les remises hors bornes et les montants négatifs", () => {
    expect(() => computeLineTotal({ quantity: "1", unitPrice: "10", vatRate: "20", discountPercent: "120" })).toThrow();
    expect(() => computeLineTotal({ quantity: "-1", unitPrice: "10", vatRate: "20" })).toThrow();
    expect(() => computeDocumentTotals([], "-5")).toThrow();
  });

  it("répartit l'arrondi de remise globale pour que Σ bases = total HT", () => {
    const t = computeDocumentTotals(
      [
        { quantity: "1", unitPrice: "33.33", vatRate: "20" },
        { quantity: "1", unitPrice: "33.33", vatRate: "10" },
        { quantity: "1", unitPrice: "33.34", vatRate: "5.5" },
      ],
      "3.33",
    );
    const sumBases = t.vat.reduce((a, v) => a + Math.round(Number(v.base) * 100), 0);
    expect(sumBases).toBe(Math.round(Number(t.totalExclTax) * 100));
  });

  it("formate en euros", () => {
    expect(formatMoney("1234.5").replace(/\s/g, " ")).toBe("1 234,50 €");
  });
});
