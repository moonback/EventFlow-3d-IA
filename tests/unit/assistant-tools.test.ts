import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { compact, localDateTime, MAX_RESULT_CHARS } from "@/server/assistant/compact";
import { DATA_TOOLS, dataToolDeclarations } from "@/server/assistant/data-tools";
import { isPermission } from "@/lib/permissions";

describe("compacteur des réponses d'outils", () => {
  const tz = "Europe/Paris";

  it("convertit dates et instants ISO en heure locale de l'agence", () => {
    expect(localDateTime(new Date("2026-07-14T20:00:00Z"), tz)).toBe("mardi 2026-07-14 22:00");
    // 23:30 UTC le vendredi 16 octobre → samedi 01:30 à Paris : le jour suit l'heure locale
    expect(localDateTime(new Date("2026-10-16T23:30:00Z"), tz)).toBe("samedi 2026-10-17 01:30");
    expect(compact({ at: new Date("2026-01-10T08:30:00Z"), iso: "2026-01-10T08:30:00.000Z" }, { timezone: tz })).toEqual({ at: "samedi 2026-01-10 09:30", iso: "samedi 2026-01-10 09:30" });
  });

  it("sérialise les décimaux et retire le bruit d'interface et les valeurs vides", () => {
    const out = compact({ amount: new Prisma.Decimal("1234.50"), color: "#fff", href: "/x", note: "", none: null, list: [], nested: { color: "red" }, keep: 0, flag: false }, { timezone: tz });
    expect(out).toEqual({ amount: "1234.5", keep: 0, flag: false });
  });

  it("tronque les listes et les textes longs", () => {
    const out = compact({ items: Array.from({ length: 25 }, (_, i) => i), text: "a".repeat(500) }, { timezone: tz }) as { items: unknown[]; text: string };
    expect(out.items).toHaveLength(21);
    expect(out.items.at(-1)).toBe("… 5 autre(s) non affiché(s)");
    expect(out.text.length).toBe(401);
  });

  it("réduit les listes jusqu'à respecter la taille maximale", () => {
    // 20 lignes d'environ 1 200 caractères : ≈ 24 000 caractères avant réduction
    const big = { rows: Array.from({ length: 20 }, (_, i) => ({ i, a: "x".repeat(390), b: "y".repeat(390), c: "z".repeat(390) })) };
    const out = compact(big, { timezone: tz });
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
    expect((out as { rows: unknown[] }).rows.length).toBeLessThan(20);
  });
});

describe("déclarations des outils « données »", () => {
  it("ont des noms uniques en snake_case, une description et des permissions valides", () => {
    const names = DATA_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of DATA_TOOLS) {
      expect(t.name).toMatch(/^[a-z][a-z_]{2,40}$/);
      expect(t.description.length, t.name).toBeGreaterThan(20);
      expect(t.label.length, t.name).toBeGreaterThan(3);
      for (const p of t.permissions) expect(isPermission(p), `${t.name} → ${p}`).toBe(true);
    }
  });

  it("produisent des schémas JSON objet, sans $schema, avec des descriptions de paramètres", () => {
    for (const d of dataToolDeclarations()) {
      const schema = d.parametersJsonSchema as { type: string; properties?: Record<string, { description?: string }>; $schema?: string };
      expect(schema.type, d.name).toBe("object");
      expect(schema.$schema).toBeUndefined();
    }
    const listEvents = dataToolDeclarations().find((d) => d.name === "list_events")!.parametersJsonSchema as { properties: Record<string, { description?: string }>; required?: string[] };
    expect(Object.keys(listEvents.properties)).toEqual(["query", "status", "from", "to"]);
    expect(listEvents.required ?? []).toEqual([]);
    expect(listEvents.properties.from!.description).toMatch(/AAAA-MM-JJ/);
  });
});
