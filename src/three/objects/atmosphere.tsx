"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useAnimation } from "../effects/motion";
import { useAmbience, type Ambience } from "../materials/ambience";

const noRaycast = () => null;
const mix = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

// ── Ciel ─────────────────────────────────────────────────────────────

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // toujours au fond
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunSize;
uniform float uHalo;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  // Dégradé horizon → zénith, plus rapide près de l'horizon (diffusion atmosphérique)
  vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.55));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6) * uHalo; // halo
  col += uSunColor * smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.6, s); // disque
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Dôme de ciel dégradé avec soleil (ou lune) et halo, aux couleurs de l'ambiance. */
export function SkyDome() {
  const a = useAmbience();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uSunColor: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunSize: { value: 0.0006 },
          uHalo: { value: 1 },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    if (!a) return;
    const u = material.uniforms;
    const light = a.theme === "light";
    (u.uHorizon!.value as THREE.Color).set(a.background);
    (u.uZenith!.value as THREE.Color).copy(mix(a.background, light ? (a.daylight > 0.5 ? "#4a7fc8" : "#1e2a4a") : "#01030a", light ? 0.65 : 0.7));
    (u.uSunColor!.value as THREE.Color).set(a.sunColor).multiplyScalar(a.daylight > 0.2 ? 1 : 0.55);
    (u.uSunDir!.value as THREE.Vector3).set(...a.sunDirection);
    u.uSunSize!.value = a.daylight > 0.2 ? 0.0009 : 0.0004;
    u.uHalo!.value = a.daylight > 0.2 ? 0.6 + a.daylight * 0.6 : 0.25;
  }, [a, material]);
  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false} raycast={noRaycast}>
      <sphereGeometry args={[450, 32, 16]} />
    </mesh>
  );
}

// ── Nuages ───────────────────────────────────────────────────────────

let puffTexture: THREE.Texture | null = null;
/** Texture de « bouffée » de nuage générée localement (aucun téléchargement). */
function getPuffTexture() {
  if (puffTexture) return puffTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.75)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  puffTexture = new THREE.CanvasTexture(c);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const CLOUD_SPAN = 560;

/** Nuages en bouffées de sprites, qui dérivent lentement avec le vent. */
export function Clouds() {
  const a = useAmbience();
  const animated = useAnimation("nature");
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(() => {
    const rand = rng(11);
    return Array.from({ length: 14 }, () => ({
      x: -CLOUD_SPAN / 2 + rand() * CLOUD_SPAN,
      y: 105 + rand() * 40,
      z: -260 + rand() * 520,
      speed: 2 + rand() * 2.5,
      puffs: Array.from({ length: 5 + Math.floor(rand() * 4) }, () => ({ x: (rand() - 0.5) * 50, y: (rand() - 0.3) * 8, z: (rand() - 0.5) * 22, s: 22 + rand() * 26 })),
    }));
  }, []);
  const material = useMemo(() => new THREE.SpriteMaterial({ map: getPuffTexture(), transparent: true, depthWrite: false, fog: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    if (!a) return;
    const light = a.theme === "light";
    const day = mix(light ? "#f8fafc" : "#475569", a.sunColor, 0.25);
    const night = mix(a.background, "#64748b", 0.25);
    material.color.copy(night.lerp(day, a.daylight));
    material.opacity = (light ? 0.75 : 0.45) * (0.35 + a.daylight * 0.65);
  }, [a, material]);
  useFrame((_, delta) => {
    if (!animated || !group.current) return;
    group.current.children.forEach((c, i) => {
      c.position.x += clouds[i]!.speed * Math.min(delta, 0.1);
      if (c.position.x > CLOUD_SPAN / 2) c.position.x -= CLOUD_SPAN;
    });
  });
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]}>
          {c.puffs.map((p, k) => (
            <sprite key={k} material={material} position={[p.x, p.y, p.z]} scale={[p.s, p.s * 0.55, 1]} raycast={noRaycast} />
          ))}
        </group>
      ))}
    </group>
  );
}

// ── Vent dans les arbres ─────────────────────────────────────────────

/** Uniforme de temps partagé par les matériaux balancés par le vent. */
export const windTime = { value: 0 };

/** Fait plier le houppier des arbres instanciés au gré du vent (le tronc reste fixe). */
export function applyWind(material: THREE.Material, pivotHeight: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWindTime;").replace(
      "#include <begin_vertex>",
      /* glsl */ `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 wSeed = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 wSeed = vec2(0.0);
      #endif
      float wBend = max(position.y - ${pivotHeight.toFixed(2)}, 0.0);
      float wGust = sin(uWindTime * 1.3 + wSeed.x * 0.31 + wSeed.y * 0.23) * 0.6 + sin(uWindTime * 3.1 + wSeed.x * 0.9) * 0.25;
      transformed.x += wGust * wBend * 0.07;
      transformed.z += wGust * wBend * 0.035;`,
    );
  };
  material.customProgramCacheKey = () => `wind-${pivotHeight}`;
}

/** Fait avancer le temps du vent tant que l'animation « nature » est active. */
export function WindClock() {
  const animated = useAnimation("nature");
  useFrame((_, delta) => {
    if (animated) windTime.value += Math.min(delta, 0.1);
  });
  return null;
}

// ── Oiseaux ──────────────────────────────────────────────────────────

const WING = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.35, 0, 0), new THREE.Vector3(-0.3, 0, 0), new THREE.Vector3(-0.15, 0, 1.1)]);
WING.computeVertexNormals();
const BIRDS_PER_FLOCK = 9;
const FLOCKS = [
  { center: [10, 0, 5] as const, radius: 70, height: 34, speed: 0.09 },
  { center: [-30, 0, 30] as const, radius: 45, height: 26, speed: -0.13 },
];

/** Vols d'oiseaux qui tournoient au-dessus du site en journée (ailes battantes). */
export function Birds({ ambience }: { ambience: Ambience }) {
  const animated = useAnimation("nature");
  const left = useRef<THREE.InstancedMesh>(null);
  const right = useRef<THREE.InstancedMesh>(null);
  const count = BIRDS_PER_FLOCK * FLOCKS.length;
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: "#1e293b", side: THREE.DoubleSide }), []);
  useEffect(() => () => material.dispose(), [material]);
  const birds = useMemo(() => {
    const rand = rng(23);
    return FLOCKS.flatMap((f, fi) => Array.from({ length: BIRDS_PER_FLOCK }, () => ({ f: fi, angle: rand() * 0.5, dr: (rand() - 0.5) * 10, dy: (rand() - 0.5) * 4, phase: rand() * Math.PI * 2, rate: 7 + rand() * 4 })));
  }, []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), base: new THREE.Matrix4(), flap: new THREE.Matrix4(), mirror: new THREE.Matrix4().makeScale(1, 1, -1) }), []);
  useFrame(({ clock }) => {
    if (!left.current || !right.current) return;
    const t = animated ? clock.elapsedTime : 0;
    birds.forEach((b, i) => {
      const f = FLOCKS[b.f]!;
      const ang = t * f.speed + b.angle;
      const r = f.radius + b.dr;
      const x = f.center[0] + Math.cos(ang) * r;
      const z = f.center[2] + Math.sin(ang) * r;
      const y = f.height + b.dy + Math.sin(t * 0.7 + b.phase) * 1.5;
      // Cap tangent au cercle (sens selon la vitesse), légère inclinaison dans le virage
      const yaw = Math.atan2(-Math.cos(ang) * Math.sign(f.speed), -Math.sin(ang) * Math.sign(f.speed));
      tmp.base.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sign(f.speed) * 0.25, yaw, 0, "YXZ")), new THREE.Vector3(1, 1, 1));
      const flap = Math.sin(t * b.rate + b.phase) * 0.7;
      right.current!.setMatrixAt(i, tmp.m.multiplyMatrices(tmp.base, tmp.flap.makeRotationX(-flap)));
      left.current!.setMatrixAt(i, tmp.m.multiplyMatrices(tmp.base, tmp.flap.makeRotationX(flap)).multiply(tmp.mirror));
    });
    left.current.instanceMatrix.needsUpdate = true;
    right.current.instanceMatrix.needsUpdate = true;
  });
  if (ambience.daylight < 0.3) return null;
  return (
    <group>
      <instancedMesh ref={left} args={[WING, material, count]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={right} args={[WING, material, count]} frustumCulled={false} raycast={noRaycast} />
    </group>
  );
}

// ── Trajets en boucle ────────────────────────────────────────────────

/** Polyligne fermée parcourue à vitesse constante : position et cap à une distance donnée. */
function loop(points: [number, number][]) {
  const segs = points.map((p, i) => {
    const q = points[(i + 1) % points.length]!;
    return { p, dx: q[0] - p[0], dz: q[1] - p[1], len: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  });
  const length = segs.reduce((s, x) => s + x.len, 0);
  return {
    length,
    at(d: number) {
      let rest = ((d % length) + length) % length;
      for (const s of segs) {
        if (rest <= s.len) return { x: s.p[0] + (s.dx * rest) / s.len, z: s.p[1] + (s.dz * rest) / s.len, yaw: Math.atan2(-s.dz, s.dx) };
        rest -= s.len;
      }
      const s = segs[0]!;
      return { x: s.p[0], z: s.p[1], yaw: Math.atan2(-s.dz, s.dx) };
    },
  };
}

// ── Piétons ──────────────────────────────────────────────────────────

/** Trottoirs autour des bureaux et de l'entrepôt, et cheminement parking → bureaux. */
const WALKS = [
  loop([[-51.8, -32.8], [-24.2, -32.8], [-24.2, -11.2], [-51.8, -11.2]]),
  loop([[-23.7, 17.9], [23.7, 17.9], [23.7, -17.9], [-23.7, -17.9]]),
  loop([[-58, -30], [-58, -20], [-52, -20], [-52, -30]]),
];
const PEOPLE = [
  [0, 0], [0, 0.31], [0, 0.62], [1, 0.05], [1, 0.27], [1, 0.5], [1, 0.71], [1, 0.9], [2, 0], [2, 0.5],
] as const;
const CLOTHES = ["#1d4ed8", "#b91c1c", "#334155", "#f8fafc", "#0f766e", "#a16207", "#6d28d9", "#be185d", "#475569", "#15803d"];

/** Personnel qui circule sur les trottoirs (corps, tête, jambes qui alternent). */
export function Pedestrians() {
  const animated = useAnimation("life");
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const legs = useRef<THREE.InstancedMesh>(null);
  const { bodyGeo, headGeo, legGeo, bodyMat, headMat, legMat } = useMemo(
    () => ({
      bodyGeo: new THREE.CapsuleGeometry(0.22, 0.55, 4, 10).translate(0, 1.15, 0),
      headGeo: new THREE.SphereGeometry(0.15, 12, 8).translate(0, 1.7, 0),
      legGeo: new THREE.BoxGeometry(0.14, 0.82, 0.15).translate(0, -0.41, 0),
      bodyMat: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      headMat: new THREE.MeshStandardMaterial({ color: "#e0b08c", roughness: 0.7 }),
      legMat: new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.85 }),
    }),
    [],
  );
  useEffect(() => () => [bodyGeo, headGeo, legGeo, bodyMat, headMat, legMat].forEach((x) => x.dispose()), [bodyGeo, headGeo, legGeo, bodyMat, headMat, legMat]);
  useLayoutEffect(() => {
    const mesh = bodies.current;
    if (!mesh) return;
    // Couleur de vêtement par personne
    PEOPLE.forEach((_, i) => mesh.setColorAt(i, new THREE.Color(CLOTHES[i % CLOTHES.length]!)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [animated]);
  const tmp = useMemo(() => ({ base: new THREE.Matrix4(), hip: new THREE.Matrix4(), swing: new THREE.Matrix4(), out: new THREE.Matrix4(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), one: new THREE.Vector3(1, 1, 1), p: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    if (!bodies.current || !heads.current || !legs.current) return;
    const t = clock.elapsedTime;
    PEOPLE.forEach(([w, offset], i) => {
      const path = WALKS[w]!;
      const speed = 1.15 + (i % 3) * 0.12;
      const pos = path.at(offset * path.length + t * speed);
      const stride = t * speed * 4.2 + i;
      tmp.q.setFromAxisAngle(tmp.up, pos.yaw);
      tmp.p.set(pos.x, Math.abs(Math.sin(stride)) * 0.05, pos.z);
      tmp.base.compose(tmp.p, tmp.q, tmp.one);
      bodies.current!.setMatrixAt(i, tmp.base);
      heads.current!.setMatrixAt(i, tmp.base);
      const swing = Math.sin(stride) * 0.5;
      for (const side of [0, 1]) {
        tmp.hip.makeTranslation(0, 0.85, side ? 0.1 : -0.1);
        tmp.swing.makeRotationZ(side ? swing : -swing);
        legs.current!.setMatrixAt(i * 2 + side, tmp.out.multiplyMatrices(tmp.base, tmp.hip).multiply(tmp.swing));
      }
    });
    bodies.current.instanceMatrix.needsUpdate = true;
    heads.current.instanceMatrix.needsUpdate = true;
    legs.current.instanceMatrix.needsUpdate = true;
  });
  if (!animated) return null;
  return (
    <group>
      <instancedMesh ref={bodies} args={[bodyGeo, bodyMat, PEOPLE.length]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={heads} args={[headGeo, headMat, PEOPLE.length]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={legs} args={[legGeo, legMat, PEOPLE.length * 2]} frustumCulled={false} raycast={noRaycast} />
    </group>
  );
}

// ── Circulation ──────────────────────────────────────────────────────

/** Voies de circulation (sens de marche à droite) sur la route nord-sud et la route d'accès est-ouest. */
const LANES = [
  { from: [46.2, -80] as [number, number], to: [46.2, 95] as [number, number] },
  { from: [49.8, 95] as [number, number], to: [49.8, -80] as [number, number] },
  { from: [-75, -35.6] as [number, number], to: [100, -35.6] as [number, number] },
  { from: [100, -38.4] as [number, number], to: [-75, -38.4] as [number, number] },
];
const CARS = [
  { lane: 0, offset: 0, speed: 9, color: "#e2e8f0" },
  { lane: 0, offset: 0.55, speed: 10, color: "#1d4ed8" },
  { lane: 1, offset: 0.2, speed: 11, color: "#b91c1c" },
  { lane: 1, offset: 0.8, speed: 8.5, color: "#334155" },
  { lane: 2, offset: 0.35, speed: 10, color: "#0f766e" },
  { lane: 3, offset: 0.1, speed: 9.5, color: "#f8fafc" },
  { lane: 3, offset: 0.65, speed: 12, color: "#a16207" },
];

/** Voitures qui passent sur les routes autour du site, phares allumés la nuit. */
export function Traffic({ night }: { night: number }) {
  const animated = useAnimation("life");
  const bodies = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const { bodyGeo, lightGeo, bodyMat, lightMat } = useMemo(() => {
    const shade = (g: THREE.BufferGeometry, c: string) => {
      const n = g.index ? g.toNonIndexed() : g;
      const col = new THREE.Color(c);
      const arr = new Float32Array(n.getAttribute("position").count * 3);
      for (let i = 0; i < arr.length; i += 3) arr.set([col.r, col.g, col.b], i);
      n.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      return n;
    };
    const body = shade(new THREE.BoxGeometry(4.2, 0.7, 1.8).translate(0, 0.55, 0), "#ffffff");
    const cabin = shade(new THREE.BoxGeometry(2.2, 0.6, 1.6).translate(-0.2, 1.2, 0), "#1e293b"); // vitres sombres
    const wheel = (x: number, z: number) => shade(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12).rotateX(Math.PI / 2).translate(x, 0.34, z), "#0b0f19");
    const bodyGeo = mergeGeometries([body, cabin, wheel(1.3, 0.85), wheel(1.3, -0.85), wheel(-1.3, 0.85), wheel(-1.3, -0.85)])!;
    const lamp = (x: number, z: number, c: string) => shade(new THREE.BoxGeometry(0.06, 0.16, 0.36).translate(x, 0.65, z), c);
    const lightGeo = mergeGeometries([lamp(2.12, 0.6, "#fff7d6"), lamp(2.12, -0.6, "#fff7d6"), lamp(-2.12, 0.6, "#ef4444"), lamp(-2.12, -0.6, "#ef4444")])!;
    return { bodyGeo, lightGeo, bodyMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.5 }), lightMat: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) };
  }, []);
  useEffect(() => () => [bodyGeo, lightGeo, bodyMat, lightMat].forEach((x) => x.dispose()), [bodyGeo, lightGeo, bodyMat, lightMat]);
  useLayoutEffect(() => {
    lightMat.color.setScalar(0.4 + night * 2.6);
  }, [night, lightMat]);
  useLayoutEffect(() => {
    const mesh = bodies.current;
    if (!mesh) return;
    CARS.forEach((c, i) => mesh.setColorAt(i, new THREE.Color(c.color)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [animated]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), one: new THREE.Vector3(1, 1, 1), p: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    if (!bodies.current || !lights.current) return;
    const t = clock.elapsedTime;
    CARS.forEach((c, i) => {
      const lane = LANES[c.lane]!;
      const dx = lane.to[0] - lane.from[0];
      const dz = lane.to[1] - lane.from[1];
      const len = Math.hypot(dx, dz);
      const k = ((c.offset * len + t * c.speed) % len) / len;
      tmp.p.set(lane.from[0] + dx * k, 0, lane.from[1] + dz * k);
      tmp.q.setFromAxisAngle(tmp.up, Math.atan2(-dz, dx));
      tmp.m.compose(tmp.p, tmp.q, tmp.one);
      bodies.current!.setMatrixAt(i, tmp.m);
      lights.current!.setMatrixAt(i, tmp.m);
    });
    bodies.current.instanceMatrix.needsUpdate = true;
    lights.current.instanceMatrix.needsUpdate = true;
  });
  if (!animated) return null;
  return (
    <group>
      <instancedMesh ref={bodies} args={[bodyGeo, bodyMat, CARS.length]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={lights} args={[lightGeo, lightMat, CARS.length]} frustumCulled={false} raycast={noRaycast} />
    </group>
  );
}

/** Atmosphère vivante : ciel, nuages, vent, oiseaux, piétons et circulation. */
export function Atmosphere() {
  const a = useAmbience();
  if (!a) return null;
  return (
    <group>
      <SkyDome />
      <Clouds />
      <WindClock />
      <Birds ambience={a} />
      <Pedestrians />
      <Traffic night={a.night} />
    </group>
  );
}
