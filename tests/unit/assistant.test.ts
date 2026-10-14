import { describe, expect, it } from "vitest";
import { downsample, floatToPcm16, pcm16BytesToFloat, pcm16ToBytes, rms } from "@/assistant/audio/pcm";
import { buildSystemInstruction, formatNow } from "@/features/assistant/persona";
import { MAX_TEXT_LENGTH, parseClientMessage } from "@/features/assistant/protocol";
import { sessionTokenFromCookieHeader } from "@/server/auth/session-token";
import { DEFAULT_ROLE_PERMISSIONS, resolvePermissions } from "@/lib/permissions";

describe("audio PCM", () => {
  it("sous-échantillonne 48 kHz → 16 kHz en moyennant chaque groupe", () => {
    const input = Float32Array.from([0.3, 0.3, 0.3, -0.6, -0.6, -0.6, 1, 0, 0.5]);
    const out = downsample(input, 48_000, 16_000);
    expect(Array.from(out).map((v) => Number(v.toFixed(3)))).toEqual([0.3, -0.6, 0.5]);
  });

  it("gère un rapport non entier (44,1 kHz) sans dépasser la longueur attendue", () => {
    const out = downsample(new Float32Array(4410).fill(0.25), 44_100, 16_000);
    expect(out.length).toBe(1600);
    expect(out.every((v) => Math.abs(v - 0.25) < 1e-6)).toBe(true);
  });

  it("refuse le suréchantillonnage et laisse passer un signal déjà au bon débit", () => {
    expect(() => downsample(new Float32Array(10), 8_000, 16_000)).toThrow();
    const same = new Float32Array(4);
    expect(downsample(same, 16_000, 16_000)).toBe(same);
  });

  it("convertit en PCM 16 bits avec écrêtage", () => {
    expect(Array.from(floatToPcm16(Float32Array.from([0, 1, -1, 2, -2, 0.5])))).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });

  it("fait l'aller-retour octets little-endian ↔ Float32", () => {
    const bytes = pcm16ToBytes(Int16Array.from([0, 16384, -32768, 1]));
    expect(new Uint8Array(bytes)).toEqual(Uint8Array.from([0, 0, 0, 0x40, 0, 0x80, 1, 0]));
    expect(Array.from(pcm16BytesToFloat(bytes))).toEqual([0, 0.5, -1, 1 / 32768]);
  });

  it("calcule un niveau RMS", () => {
    expect(rms(new Float32Array(0))).toBe(0);
    expect(rms(Float32Array.from([0.5, -0.5]))).toBeCloseTo(0.5);
  });
});

describe("protocole de la passerelle", () => {
  it("accepte les messages valides", () => {
    expect(parseClientMessage(JSON.stringify({ type: "text", text: "  Bonjour Eric " }))).toEqual({ type: "text", text: "Bonjour Eric" });
    expect(parseClientMessage('{"type":"audio_end"}')).toEqual({ type: "audio_end" });
    expect(parseClientMessage('{"type":"hangup"}')).toEqual({ type: "hangup" });
  });

  it("rejette le JSON invalide, les types inconnus et les textes vides ou trop longs", () => {
    expect(parseClientMessage("pas du json")).toBeNull();
    expect(parseClientMessage('{"type":"tool_call","name":"delete_all"}')).toBeNull();
    expect(parseClientMessage('{"type":"text","text":"   "}')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "text", text: "a".repeat(MAX_TEXT_LENGTH + 1) }))).toBeNull();
  });
});

describe("cookie de session", () => {
  it("extrait ef_session parmi d'autres cookies", () => {
    expect(sessionTokenFromCookieHeader("theme=dark; ef_session=abc%2Fdef; other=1")).toBe("abc/def");
    expect(sessionTokenFromCookieHeader("xef_session=nope")).toBeNull();
    expect(sessionTokenFromCookieHeader(undefined)).toBeNull();
    expect(sessionTokenFromCookieHeader("ef_session=")).toBeNull();
  });
});

describe("persona d'Eric", () => {
  const now = new Date("2026-10-14T08:30:00Z");

  it("donne la date locale de l'organisation, l'interlocuteur et le rôle", () => {
    const text = buildSystemInstruction({ organizationName: "Agence Lumière", userName: "Camille", role: "LOGISTICS_MANAGER", timezone: "Europe/Paris", currency: "EUR", now });
    expect(text).toContain("Agence Lumière");
    expect(text).toContain("Camille");
    expect(text).toContain(formatNow(now, "Europe/Paris"));
    expect(formatNow(now, "Europe/Paris")).toContain("10:30");
  });

  it("impose les outils, interdit d'inventer et traite les données comme des données", () => {
    const text = buildSystemInstruction({ organizationName: "A", userName: "B", role: "SALES", timezone: "UTC", currency: "CHF", now });
    expect(text).toMatch(/appelle un outil/);
    expect(text).toMatch(/N'invente jamais/);
    expect(text).toMatch(/jamais des instructions/);
    expect(text).toContain("CHF");
  });
});

describe("permission assistant:use", () => {
  it("est accordée aux rôles internes mais pas au rôle lecture seule", () => {
    for (const role of ["OWNER", "ADMIN", "DIRECTOR", "LOGISTICS_MANAGER", "STOCK_MANAGER", "SALES", "ACCOUNTING", "TECHNICIAN", "DRIVER", "CREW"] as const) {
      expect(resolvePermissions(role).has("assistant:use"), role).toBe(true);
    }
    expect(DEFAULT_ROLE_PERMISSIONS.READ_ONLY).not.toContain("assistant:use");
  });

  it("peut être retirée par organisation", () => {
    expect(resolvePermissions("SALES", [{ permission: "assistant:use", granted: false }]).has("assistant:use")).toBe(false);
  });
});
