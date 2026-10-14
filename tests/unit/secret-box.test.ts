import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, secretsEncryptionReady } from "@/server/crypto/secret-box";

describe("chiffrement des secrets en base", () => {
  it("chiffre (AES-256-GCM, IV aléatoire) puis déchiffre", () => {
    expect(secretsEncryptionReady()).toBe(true);
    const a = encryptSecret("AIzaSecret-1234");
    const b = encryptSecret("AIzaSecret-1234");
    expect(a).not.toBe(b);
    expect(a).not.toContain("AIzaSecret");
    expect(decryptSecret(a)).toBe("AIzaSecret-1234");
  });

  it("refuse une valeur altérée ou d'un autre format", () => {
    const [v, iv, tag, data] = encryptSecret("valeur").split(":");
    const tampered = [v, iv, tag, Buffer.from("autre chose").toString("base64")].join(":");
    expect(decryptSecret(tampered)).toBeNull();
    expect(decryptSecret(`${v}:${iv}:${tag}`)).toBeNull();
    expect(decryptSecret("en-clair")).toBeNull();
    void data;
  });
});
