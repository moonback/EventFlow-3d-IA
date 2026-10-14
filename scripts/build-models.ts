/**
 * Génère les modèles 3D détaillés du monde 3D (public/models/*.glb) à partir de géométries three.js,
 * puis les optimise (soudure, déduplication, quantification, compression Meshopt).
 * Aucun asset tiers : les modèles sont entièrement décrits ici et reproductibles.
 *
 * Lancement : npm run models:build
 *
 * Conventions (identiques aux objets procéduraux qu'ils remplacent) : unités en mètres, origine au sol
 * au centre de l'objet, avant des véhicules vers +x. Les matériaux sont nommés ; « status » est remplacé
 * à l'exécution par la couleur d'état réelle.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type MaterialName = "body" | "status" | "glass" | "tire" | "rim" | "dark" | "metal" | "orange" | "lens" | "seat" | "case";

const MATERIALS: Record<MaterialName, { color: [number, number, number]; metallic: number; roughness: number; emissive?: [number, number, number]; alpha?: number }> = {
  body: { color: [0.9, 0.91, 0.93], metallic: 0.3, roughness: 0.45 },
  status: { color: [0.2, 0.8, 0.4], metallic: 0.1, roughness: 0.5 },
  glass: { color: [0.25, 0.45, 0.6], metallic: 0.8, roughness: 0.1, alpha: 0.7 },
  tire: { color: [0.06, 0.06, 0.07], metallic: 0, roughness: 0.95 },
  rim: { color: [0.75, 0.77, 0.8], metallic: 0.9, roughness: 0.25 },
  dark: { color: [0.12, 0.14, 0.17], metallic: 0.4, roughness: 0.6 },
  metal: { color: [0.62, 0.65, 0.7], metallic: 0.85, roughness: 0.3 },
  orange: { color: [0.96, 0.55, 0.1], metallic: 0.2, roughness: 0.5 },
  lens: { color: [1, 0.97, 0.85], metallic: 0, roughness: 0.2, emissive: [1, 0.95, 0.8] },
  seat: { color: [0.08, 0.08, 0.1], metallic: 0, roughness: 0.9 },
  case: { color: [0.1, 0.1, 0.11], metallic: 0.1, roughness: 0.7 },
};

/** Accumulateur de pièces par matériau. */
class Builder {
  parts = new Map<MaterialName, THREE.BufferGeometry[]>();
  add(material: MaterialName, geometry: THREE.BufferGeometry, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute("uv");
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const list = this.parts.get(material) ?? [];
    list.push(g);
    this.parts.set(material, list);
    return this;
  }
  box(material: MaterialName, size: [number, number, number], position: [number, number, number], rotation?: [number, number, number]) {
    return this.add(material, new THREE.BoxGeometry(...size), position, rotation);
  }
  cylinder(material: MaterialName, radius: number, length: number, position: [number, number, number], rotation?: [number, number, number], segments = 24) {
    return this.add(material, new THREE.CylinderGeometry(radius, radius, length, segments), position, rotation);
  }
  /** Roue (pneu + jante) d'axe z. */
  wheel(x: number, z: number, radius: number, width: number) {
    this.cylinder("tire", radius, width, [x, radius, z], [Math.PI / 2, 0, 0], 28);
    this.cylinder("rim", radius * 0.58, width + 0.02, [x, radius, z], [Math.PI / 2, 0, 0], 20);
    this.cylinder("dark", radius * 0.18, width + 0.04, [x, radius, z], [Math.PI / 2, 0, 0], 12);
    return this;
  }
}

// ── Modèles ─────────────────────────────────────────────────────────────

/** Porteur 12 t (longueur 6,4 m, caisse 4,8 × 2,6 × 2,1 m à partir de 0,55 m, cabine à l'avant). */
function truck() {
  const b = new Builder();
  const len = 6.4;
  const boxH = 2.6;
  const cargoLen = len - 1.6;
  b.box("body", [cargoLen, boxH, 2.1], [-0.6, 0.55 + boxH / 2, 0]);
  b.box("status", [cargoLen + 0.05, 0.14, 2.14], [-0.6, 0.62, 0]);
  b.box("dark", [0.06, boxH - 0.1, 2.12], [-0.6 - cargoLen / 2 - 0.01, 0.55 + boxH / 2, 0]); // portes arrière
  b.box("metal", [0.04, boxH - 0.2, 0.05], [-0.6 - cargoLen / 2 - 0.05, 0.55 + boxH / 2, 0]); // jonction des portes
  for (const z of [-0.6, 0.6]) b.box("metal", [0.06, 0.08, 0.1], [-0.6 - cargoLen / 2 - 0.06, 1.6, z]); // poignées
  b.box("dark", [len - 0.3, 0.25, 1.2], [0.1, 0.42, 0]); // châssis
  b.box("dark", [0.3, 0.12, 2.2], [-0.6 - cargoLen / 2 + 0.1, 0.35, 0]); // pare-chocs arrière
  // Cabine
  const cx = len / 2 - 0.6;
  b.box("body", [1.5, 1.1, 2.06], [cx, 1.05, 0]);
  b.box("body", [1.3, 0.95, 2.02], [cx - 0.08, 2.05, 0]);
  b.box("glass", [0.05, 0.75, 1.8], [cx + 0.62, 2.05, 0], [0, 0, -0.12]); // pare-brise incliné
  for (const z of [-1.02, 1.02]) b.box("glass", [0.8, 0.55, 0.03], [cx - 0.05, 2.1, z]); // vitres latérales
  b.box("dark", [0.06, 0.55, 1.6], [cx + 0.76, 1.05, 0]); // calandre
  for (let i = 0; i < 4; i++) b.box("metal", [0.07, 0.04, 1.5], [cx + 0.78, 0.86 + i * 0.13, 0]);
  b.box("dark", [0.25, 0.22, 2.16], [cx + 0.72, 0.5, 0]); // pare-chocs
  for (const z of [-0.78, 0.78]) b.box("lens", [0.05, 0.16, 0.3], [cx + 0.77, 0.75, z]); // phares
  for (const z of [-1.18, 1.18]) {
    b.box("dark", [0.04, 0.04, 0.22], [cx + 0.45, 2.2, z * 0.93]); // bras de rétroviseur
    b.box("dark", [0.1, 0.35, 0.06], [cx + 0.45, 2.1, z]); // rétroviseur
  }
  b.box("dark", [1.3, 0.12, 0.08], [cx, 0.55, 1.05]).box("dark", [1.3, 0.12, 0.08], [cx, 0.55, -1.05]); // marchepieds
  // Roues : avant simples, arrière jumelées
  for (const z of [-0.92, 0.92]) b.wheel(cx - 0.1, z, 0.48, 0.32);
  for (const z of [-0.95, -0.62, 0.62, 0.95]) b.wheel(-len / 2 + 1.2, z, 0.48, 0.3);
  for (const z of [-1.08, 1.08]) b.box("dark", [1.1, 0.06, 0.4], [-len / 2 + 1.2, 1.02, z]); // garde-boue
  return b;
}

/** Fourgon 20 m³ (longueur 4,8 m, caisse 3,2 × 2 × 2 m). */
function van() {
  const b = new Builder();
  const len = 4.8;
  const boxH = 2;
  const cargoLen = len - 1.6;
  b.box("body", [cargoLen, boxH, 2.1], [-0.6, 0.55 + boxH / 2, 0]);
  b.box("status", [cargoLen + 0.05, 0.14, 2.14], [-0.6, 0.62, 0]);
  b.box("dark", [0.05, boxH - 0.15, 2.1], [-0.6 - cargoLen / 2 - 0.01, 0.55 + boxH / 2, 0]);
  b.box("dark", [0.04, 0.6, 1.4], [-0.6 - cargoLen / 2 - 0.03, 2.05, 0]); // vitres arrière
  b.box("glass", [0.02, 0.5, 1.3], [-0.6 - cargoLen / 2 - 0.05, 2.05, 0]);
  const cx = len / 2 - 0.6;
  b.box("body", [1.5, 0.9, 2.06], [cx, 0.95, 0]); // capot / bas de cabine
  b.box("body", [1.0, 0.9, 2.02], [cx - 0.25, 1.85, 0]);
  b.box("glass", [0.05, 0.85, 1.85], [cx + 0.42, 1.8, 0], [0, 0, -0.45]); // pare-brise très incliné
  for (const z of [-1.02, 1.02]) b.box("glass", [0.7, 0.5, 0.03], [cx - 0.25, 1.95, z]);
  b.box("dark", [0.06, 0.35, 1.5], [cx + 0.76, 0.85, 0]);
  b.box("dark", [0.22, 0.2, 2.12], [cx + 0.72, 0.5, 0]);
  for (const z of [-0.75, 0.75]) b.box("lens", [0.05, 0.14, 0.32], [cx + 0.77, 1.05, z]);
  for (const z of [-1.15, 1.15]) b.box("dark", [0.1, 0.28, 0.06], [cx + 0.1, 1.95, z]);
  for (const z of [-0.92, 0.92]) {
    b.wheel(cx, z, 0.4, 0.26);
    b.wheel(-len / 2 + 1.0, z, 0.4, 0.26);
  }
  return b;
}

/** Chariot élévateur (3 m de long avec fourches, mât de 2,6 m, avant vers +x). */
function forklift() {
  const b = new Builder();
  b.box("orange", [1.6, 0.7, 1.1], [0, 0.65, 0]); // châssis
  b.box("dark", [0.45, 0.8, 1.1], [-0.85, 0.75, 0]); // contrepoids
  b.box("seat", [0.45, 0.12, 0.5], [-0.2, 1.08, 0]);
  b.box("seat", [0.1, 0.5, 0.5], [-0.45, 1.35, 0]);
  b.box("dark", [0.06, 0.5, 0.06], [0.25, 1.25, 0]).box("dark", [0.04, 0.04, 0.35], [0.28, 1.5, 0]); // volant
  for (const [x, z] of [[-0.6, -0.5], [-0.6, 0.5], [0.55, -0.5], [0.55, 0.5]] as const) b.box("dark", [0.06, 1.3, 0.06], [x, 1.65, z]); // protège-conducteur
  b.box("dark", [1.25, 0.06, 1.1], [0, 2.3, 0]);
  for (const z of [-0.38, 0.38]) b.box("metal", [0.1, 2.6, 0.1], [0.9, 1.3, z]); // mât
  b.box("metal", [0.08, 0.08, 0.86], [0.9, 2.55, 0]);
  b.box("dark", [0.06, 0.55, 0.9], [0.98, 0.45, 0]); // tablier
  for (const z of [-0.28, 0.28]) b.box("metal", [1.15, 0.05, 0.12], [1.55, 0.18, z]); // fourches
  b.box("lens", [0.04, 0.08, 0.12], [0.82, 2.35, 0.45]);
  for (const z of [-0.55, 0.55]) {
    b.wheel(0.5, z, 0.3, 0.22);
    b.wheel(-0.6, z, 0.24, 0.2);
  }
  return b;
}

/** Lyre asservie (projecteur motorisé) : 0,6 m, base, lyre en U, tête orientée vers +x. */
function lyre() {
  const b = new Builder();
  b.box("case", [0.42, 0.14, 0.42], [0, 0.07, 0]);
  b.cylinder("dark", 0.14, 0.05, [0, 0.165, 0]);
  b.box("case", [0.08, 0.36, 0.08], [0, 0.35, -0.2]).box("case", [0.08, 0.36, 0.08], [0, 0.35, 0.2]); // bras de la lyre
  b.box("case", [0.08, 0.06, 0.48], [0, 0.2, 0]);
  b.cylinder("case", 0.15, 0.36, [0.02, 0.42, 0], [0, 0, Math.PI / 2], 24); // tête
  b.cylinder("lens", 0.11, 0.02, [0.21, 0.42, 0], [0, 0, Math.PI / 2], 24); // lentille
  b.cylinder("metal", 0.13, 0.02, [0.2, 0.42, 0], [0, 0, Math.PI / 2], 24);
  return b;
}

/** Flight case 1,2 × 0,8 × 0,6 m sur roulettes : cornières alu, coins boules, poignées. */
function flightcase() {
  const b = new Builder();
  const [w, h, d] = [1.2, 0.72, 0.6];
  const y0 = 0.1;
  b.box("case", [w, h, d], [0, y0 + h / 2, 0]);
  const t = 0.025;
  // 12 cornières
  for (const y of [y0, y0 + h]) for (const z of [-d / 2, d / 2]) b.box("metal", [w + 0.01, t, t], [0, y, z]);
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box("metal", [t, h, t], [x, y0 + h / 2, z]);
  for (const y of [y0, y0 + h]) for (const x of [-w / 2, w / 2]) b.box("metal", [t, t, d + 0.01], [x, y, 0]);
  b.box("metal", [w, 0.02, 0.012], [0, y0 + h * 0.7, d / 2 + 0.005]); // ligne d'ouverture du couvercle
  for (const x of [-w / 2, w / 2]) for (const y of [y0, y0 + h]) for (const z of [-d / 2, d / 2]) b.add("metal", new THREE.SphereGeometry(0.035, 10, 8), [x, y, z]);
  for (const x of [-w / 2 - 0.01, w / 2 + 0.01]) b.box("dark", [0.03, 0.06, 0.2], [x, y0 + h * 0.55, 0]); // poignées
  for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) b.cylinder("tire", 0.05, 0.04, [x, 0.05, z], [Math.PI / 2, 0, 0], 14);
  return b;
}

// ── Export glTF ─────────────────────────────────────────────────────────

async function write(name: string, builder: Builder, outDir: string) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);
  const mesh = doc.createMesh(name);
  for (const [matName, geometries] of builder.parts) {
    const merged = mergeGeometries(geometries, false)!;
    merged.computeVertexNormals();
    const spec = MATERIALS[matName];
    const material = doc
      .createMaterial(matName)
      .setBaseColorFactor([...spec.color, spec.alpha ?? 1])
      .setMetallicFactor(spec.metallic)
      .setRoughnessFactor(spec.roughness);
    if (spec.emissive) material.setEmissiveFactor(spec.emissive);
    if (spec.alpha !== undefined) material.setAlphaMode("BLEND");
    const position = doc.createAccessor().setType("VEC3").setArray(merged.getAttribute("position").array as Float32Array).setBuffer(buffer);
    const normal = doc.createAccessor().setType("VEC3").setArray(merged.getAttribute("normal").array as Float32Array).setBuffer(buffer);
    mesh.addPrimitive(doc.createPrimitive().setAttribute("POSITION", position).setAttribute("NORMAL", normal).setMaterial(material));
  }
  scene.addChild(doc.createNode(name).setMesh(mesh));
  await MeshoptEncoder.ready;
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const path = join(outDir, `${name}.glb`);
  await io.write(path, doc);
  return path;
}

async function main() {
  const outDir = join(process.cwd(), "public", "models");
  mkdirSync(outDir, { recursive: true });
  const models: [string, Builder][] = [
    ["truck", truck()],
    ["van", van()],
    ["forklift", forklift()],
    ["lyre", lyre()],
    ["flightcase", flightcase()],
  ];
  for (const [name, builder] of models) console.log(`✓ ${await write(name, builder, outDir)}`);
}

void main();
