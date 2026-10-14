/**
 * Icône de l'application (build/icon.png, 512×512) à partir du logo EventFlow (public/Images/logo.png) :
 * logo centré sur un carré transparent. electron-builder en dérive l'icône Windows (.ico).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const size = 512;
const logo = await sharp(path.join(root, "public/Images/logo.png")).trim().resize({ width: size - 24, height: size - 24, fit: "inside" }).toBuffer();
await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: logo, gravity: "center" }])
  .png()
  .toFile(path.join(root, "build/icon.png"));
console.log("build/icon.png généré");
