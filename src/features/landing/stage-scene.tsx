"use client";
import { MeshReflectorMaterial } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Model } from "@/three/objects/models";
import { getActiveCue, useActiveCue } from "./cue-store";
import { PRESHOW, type BeamMode } from "./cues";
import {
  BACK_Z,
  beatAt,
  Blinders,
  Co2Jets,
  cueLight,
  DjBooth,
  FRONT_Z,
  HALF_W,
  Lasers,
  showEnergy as crowdEnergy,
  SideScreens,
  SubStacks,
  TRUSS_Y,
  Uplights,
} from "./stage-gear";

// ── Dimensions du plateau (mètres) ─────────────────────────────────────
const HEADS_X = [-5, -3, -1, 1, 3, 5];
const BEAM_LENGTH = 9.5;
const VELVET = "#0e0b1a";

/** Pointeur de la page (coordonnées normalisées), partagé par la caméra et la poursuite. */
const POINTER = { x: 0, y: 0, moved: false };
/** Lyre qui devient poursuite et suit le pointeur pendant l'ouverture. */
const FOLLOW_INDEX = 2;
const FOLLOW_COLOR = "#f4f1ff";


// ── Pont de truss (box truss 30 cm, membrures + treillis) ──────────────

type Segment = [THREE.Vector3, THREE.Vector3];

/** Segments d'un box truss entre deux points : 4 membrures et un treillis en zigzag sur chaque face. */
function boxTruss(from: THREE.Vector3, to: THREE.Vector3, size = 0.3, step = 0.5) {
  const dir = to.clone().sub(from);
  const length = dir.length();
  dir.normalize();
  const helper = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(dir, helper).normalize().multiplyScalar(size / 2);
  const v = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(size / 2);
  const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
  const chords: Segment[] = corners.map((c) => [from.clone().add(c), to.clone().add(c)]);
  const lacing: Segment[] = [];
  const n = Math.max(1, Math.round(length / step));
  for (let face = 0; face < 4; face++) {
    const a = corners[face]!;
    const b = corners[(face + 1) % 4]!;
    for (let i = 0; i < n; i++) {
      const p0 = from.clone().addScaledVector(dir, (i * length) / n);
      const p1 = from.clone().addScaledVector(dir, ((i + 1) * length) / n);
      lacing.push(i % 2 === 0 ? [p0.clone().add(a), p1.clone().add(b)] : [p0.clone().add(b), p1.clone().add(a)]);
    }
  }
  return { chords, lacing };
}

const UP = new THREE.Vector3(0, 1, 0);

function InstancedSegments({ segments, radius, material }: { segments: Segment[]; radius: number; material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.CylinderGeometry(radius, radius, 1, 6, 1), [radius]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    segments.forEach(([a, b], i) => {
      const d = b.clone().sub(a);
      q.setFromUnitVectors(UP, d.clone().normalize());
      s.set(1, d.length(), 1);
      m.compose(a.clone().add(b).multiplyScalar(0.5), q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [segments]);
  return <instancedMesh ref={ref} args={[geometry, material, segments.length]} />;
}

function TrussRig() {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c3c8d6", metalness: 0.55, roughness: 0.38 }), []);
  const { chords, lacing } = useMemo(() => {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const parts = [
      boxTruss(V(-HALF_W, TRUSS_Y, FRONT_Z), V(HALF_W, TRUSS_Y, FRONT_Z)),
      boxTruss(V(-HALF_W, TRUSS_Y, BACK_Z), V(HALF_W, TRUSS_Y, BACK_Z)),
      boxTruss(V(-HALF_W, TRUSS_Y, FRONT_Z), V(-HALF_W, TRUSS_Y, BACK_Z)),
      boxTruss(V(HALF_W, TRUSS_Y, FRONT_Z), V(HALF_W, TRUSS_Y, BACK_Z)),
      ...[-HALF_W, HALF_W].flatMap((x) => [FRONT_Z, BACK_Z].map((z) => boxTruss(V(x, 0, z), V(x, TRUSS_Y - 0.15, z)))),
    ];
    return { chords: parts.flatMap((p) => p.chords), lacing: parts.flatMap((p) => p.lacing) };
  }, []);
  return (
    <group>
      <InstancedSegments segments={chords} radius={0.026} material={material} />
      <InstancedSegments segments={lacing} radius={0.011} material={material} />
      {/* Embases des tours */}
      {[-HALF_W, HALF_W].flatMap((x) =>
        [FRONT_Z, BACK_Z].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.03, z]}>
            <boxGeometry args={[0.8, 0.06, 0.8]} />
            <meshStandardMaterial color="#2a2438" metalness={0.4} roughness={0.6} />
          </mesh>
        )),
      )}
    </group>
  );
}

// ── Faisceaux volumétriques ───────────────────────────────────────────

const beamVertex = /* glsl */ `
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vWorld;
  uniform float uLength;
  void main() {
    vAlong = clamp(-position.y / uLength, 0.0, 1.0);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vView = normalize(-mv.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
/** Bruit de valeur 3D : la fumée traversée par le faisceau, qui dérive lentement. */
const noise3 = /* glsl */ `
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vWorld;
  ${noise3}
  void main() {
    // Atténuation le long du faisceau, avec un point chaud à la sortie de lentille
    float fade = pow(max(1.0 - vAlong, 0.0), 1.5) * smoothstep(0.0, 0.03, vAlong);
    float hot = exp(-vAlong * 14.0) * 0.9;
    // Bords doux : plus dense au cœur du cône vu de face
    float core = pow(abs(dot(vNormal, vView)), 2.6);
    // Fumée : deux octaves qui montent et dérivent
    vec3 q = vWorld * vec3(0.9, 0.55, 0.9) + vec3(uTime * 0.05, uTime * 0.12, -uTime * 0.04);
    float smoke = noise3(q) * 0.65 + noise3(q * 2.3 + 7.1) * 0.35;
    smoke = 0.35 + 1.1 * smoothstep(0.25, 0.85, smoke);
    float a = (fade * smoke + hot) * core * uIntensity * 0.55;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** Halo de lentille (texture radiale partagée), visible quand la lyre regarde la caméra. */
function makeGlareTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.12, "rgba(255,255,255,0.55)");
  g.addColorStop(0.4, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const poolFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.15, d) * uIntensity * 0.55;
    a += smoothstep(1.0, 0.92, d) * smoothstep(0.82, 0.92, d) * uIntensity * 0.25;
    gl_FragColor = vec4(uColor * a, a);
  }
`;
const uvVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/** Angle d'ouverture (rad) et position des lyres selon le programme du cue. */
function program(mode: BeamMode, t: number, i: number): { azimuth: number; tilt: number; level: number } {
  const k = i - 2.5;
  // Symétrie cour/jardin : les lyres en miroir bougent en sens inverse, comme sur une vraie console
  const mirror = i < 3 ? 1 : -1;
  switch (mode) {
    case "still":
      return { azimuth: k * 0.07 + 0.06 * Math.sin(t * 0.6 + i), tilt: 0.24 + (i % 2) * 0.06 + 0.04 * Math.sin(t * 0.5 + i), level: 1 };
    case "fan": {
      // Éventail qui s'ouvre et se referme
      const open = 0.5 + 0.5 * Math.sin(t * 0.7);
      return { azimuth: k * (0.08 + 0.2 * open), tilt: 0.3 + 0.35 * open + 0.06 * Math.sin(t * 1.3 + i), level: 1 };
    }
    case "wave":
      // Huit couché, décalé d'une lyre à l'autre : la vague de l'avant-show
      return { azimuth: 0.55 * Math.sin(t * 0.75 + i * 0.55), tilt: 0.48 + 0.24 * Math.sin(t * 1.5 + i * 1.1), level: 1 };
    case "sweep":
      return { azimuth: 0.7 * Math.sin(t * 0.9 + i * 0.35), tilt: 0.5 + 0.15 * Math.sin(t * 1.8 + i * 0.35), level: 1 };
    case "cross":
      return { azimuth: mirror * (0.45 + 0.25 * Math.sin(t * 0.9)), tilt: 0.55 + 0.15 * Math.cos(t * 0.7 + i), level: 1 };
    case "chase": {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 - i * 0.9);
      return { azimuth: k * 0.15 + mirror * 0.2 * Math.sin(t * 0.8), tilt: 0.28 + 0.3 * pulse, level: 0.45 + 0.55 * pulse };
    }
    case "ballyhoo":
      // Ballyhoo : grands cercles rapides, en miroir
      return { azimuth: mirror * 0.8 * Math.sin(t * 0.8 + i * 0.7), tilt: 0.6 + 0.3 * Math.cos(t * 0.8 + i * 0.7), level: 0.94 + 0.06 * Math.sin(t * 1.5 + i) };
  }
}

interface HeadRefs {
  yoke: THREE.Group | null;
  head: THREE.Group | null;
  lens: THREE.Mesh | null;
  pool: THREE.Mesh | null;
  beamMat: THREE.ShaderMaterial;
  poolMat: THREE.ShaderMaterial;
  glareMat: THREE.SpriteMaterial;
  /** Projecteur réel : éclaire le plateau, le pont et la fumée (qualité haute) */
  spot: THREE.SpotLight;
  spotTarget: THREE.Object3D;
  color: THREE.Color;
  azimuth: number;
  tilt: number;
  level: number;
}

const tmpOrigin = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpCam = new THREE.Vector3();
const tmpColor = new THREE.Color();
const tmpQuat = new THREE.Quaternion();
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Six lyres asservies sur le pont de face, pilotées par le cue actif. */
function MovingHeads({ reduced, lights }: { reduced: boolean; lights: boolean }) {
  const caseMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1d1a26", metalness: 0.6, roughness: 0.32 }), []);
  const glareTexture = useMemo(() => makeGlareTexture(), []);
  const beamGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.09, 1.25, BEAM_LENGTH, 40, 1, true);
    g.translate(0, -BEAM_LENGTH / 2, 0);
    return g;
  }, []);
  const heads = useMemo<HeadRefs[]>(
    () =>
      HEADS_X.map((_, i) => {
        const color = new THREE.Color(PRESHOW.colors[i]);
        const uniforms = () => ({ uColor: { value: color }, uIntensity: { value: 1 }, uLength: { value: BEAM_LENGTH }, uTime: { value: 0 } });
        const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false } as const;
        const spot = new THREE.SpotLight(color, 0, 16, 0.2, 0.55, 1.4);
        const spotTarget = new THREE.Object3D();
        spotTarget.position.set(0, -5, 0);
        spot.target = spotTarget;
        return {
          yoke: null,
          head: null,
          lens: null,
          pool: null,
          color,
          beamMat: new THREE.ShaderMaterial({ ...common, uniforms: uniforms(), vertexShader: beamVertex, fragmentShader: beamFragment, side: THREE.DoubleSide }),
          poolMat: new THREE.ShaderMaterial({ ...common, uniforms: uniforms(), vertexShader: uvVertex, fragmentShader: poolFragment }),
          glareMat: new THREE.SpriteMaterial({ map: glareTexture, color: color.clone(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }),
          spot,
          spotTarget,
          azimuth: 0,
          tilt: 0.3,
          level: 1,
        };
      }),
    [glareTexture],
  );
  const lensMats = useMemo(() => heads.map((h) => new THREE.MeshBasicMaterial({ color: h.color, toneMapped: false })), [heads]);
  const cue = useActiveCue();
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (reduced) invalidate();
  }, [cue, reduced, invalidate]);

  useFrame((state, delta) => {
    const light = cueLight(getActiveCue());
    const t = reduced ? 2.4 : state.clock.elapsedTime * light.speed;
    const snap = reduced ? 1 : 1 - Math.exp(-delta * 2.6);
    const colorSnap = reduced ? 1 : 1 - Math.exp(-delta * 3.5);
    // Poursuite : pendant l'ouverture, une lyre suit le pointeur. L'écran est projeté sur le
    // plateau (gauche/droite → cour/jardin, haut/bas → lointain/face), indépendamment de la caméra.
    let follow: { azimuth: number; tilt: number } | null = null;
    if (getActiveCue() === -1 && POINTER.moved && !reduced) {
      const x = POINTER.x * (HALF_W - 0.6);
      const z = THREE.MathUtils.lerp(BACK_Z + 0.6, FRONT_Z + 1.6, (POINTER.y + 1) / 2);
      const dir = tmpDir.set(x - HEADS_X[FOLLOW_INDEX]!, -(TRUSS_Y - 0.6), z - FRONT_Z).normalize();
      follow = { azimuth: Math.atan2(dir.x, dir.z), tilt: Math.acos(THREE.MathUtils.clamp(-dir.y, -1, 1)) };
    }
    heads.forEach((h, i) => {
      const isFollow = follow !== null && i === FOLLOW_INDEX;
      const p = isFollow ? { ...follow!, level: 1.25 } : program(light.mode, t, i);
      const followSnap = isFollow ? 1 - Math.exp(-delta * 6) : snap;
      h.azimuth += wrapAngle(p.azimuth - h.azimuth) * followSnap;
      h.tilt += (p.tilt - h.tilt) * followSnap;
      const accent = reduced ? 1 : 0.86 + 0.14 * beatAt(state.clock.elapsedTime).pulse;
      h.level += ((isFollow ? p.level : p.level * light.intensity * accent) - h.level) * snap;
      h.color.lerp(tmpColor.set(isFollow ? FOLLOW_COLOR : light.colors[i]!), colorSnap);
      if (h.yoke) h.yoke.rotation.y = Math.PI + h.azimuth;
      if (h.head) h.head.rotation.x = h.tilt;
      h.beamMat.uniforms.uIntensity!.value = h.level;
      h.beamMat.uniforms.uTime!.value = reduced ? 4 : state.clock.elapsedTime;
      lensMats[i]!.color.copy(h.color).multiplyScalar(1.5 + h.level * 2.5);
      h.spot.color.copy(h.color);
      h.spot.intensity = lights ? h.level * 140 : 0;
      // Tache au sol : intersection du faisceau avec le plateau (y = 0)
      if (h.lens && h.pool) {
        h.lens.getWorldPosition(tmpOrigin);
        tmpDir.set(0, -1, 0).applyQuaternion(h.lens.getWorldQuaternion(tmpQuat));
        // Éblouissement : maximal quand la lentille est braquée vers la caméra
        const facing = Math.max(0, tmpDir.dot(tmpCam.copy(state.camera.position).sub(tmpOrigin).normalize()));
        h.glareMat.color.copy(h.color).multiplyScalar((0.35 + Math.pow(facing, 6) * 3.5) * h.level);
        const dist = tmpDir.y < -0.05 ? -tmpOrigin.y / tmpDir.y : Infinity;
        const onDeck = dist < BEAM_LENGTH * 1.1;
        h.pool.visible = onDeck;
        if (onDeck) {
          const hit = tmpOrigin.addScaledVector(tmpDir, dist);
          const radius = 0.15 + (dist / BEAM_LENGTH) * 1.15;
          h.pool.position.set(hit.x, 0.012, hit.z);
          h.pool.rotation.set(-Math.PI / 2, 0, Math.atan2(-tmpDir.z, tmpDir.x));
          h.pool.scale.set(radius * 2 / Math.max(0.4, -tmpDir.y), radius * 2, 1);
          h.poolMat.uniforms.uIntensity!.value = h.level * (1 - (dist / BEAM_LENGTH) * 0.5);
        }
      }
    });
  });

  return (
    <group>
      {HEADS_X.map((x, i) => {
        const h = heads[i]!;
        return (
          <group key={x}>
            <group position={[x, TRUSS_Y - 0.2, FRONT_Z]}>
              {/* Collier et embase suspendus */}
              <mesh material={caseMat} position={[0, 0.02, 0]}>
                <boxGeometry args={[0.42, 0.14, 0.42]} />
              </mesh>
              <group ref={(g) => void (h.yoke = g)}>
                {/* Lyre en U */}
                <mesh material={caseMat} position={[0, -0.12, 0]}>
                  <boxGeometry args={[0.5, 0.06, 0.1]} />
                </mesh>
                {[-0.23, 0.23].map((ax) => (
                  <mesh key={ax} material={caseMat} position={[ax, -0.3, 0]}>
                    <boxGeometry args={[0.06, 0.36, 0.1]} />
                  </mesh>
                ))}
                <group ref={(g) => void (h.head = g)} position={[0, -0.4, 0]}>
                  <mesh material={caseMat} position={[0, -0.05, 0]}>
                    <cylinderGeometry args={[0.16, 0.13, 0.42, 24]} />
                  </mesh>
                  {/* Carter : bagues de refroidissement et capot */}
                  {[0.08, -0.02, -0.12].map((y) => (
                    <mesh key={y} material={caseMat} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                      <torusGeometry args={[0.158, 0.012, 6, 24]} />
                    </mesh>
                  ))}
                  <mesh ref={(m) => void (h.lens = m)} material={lensMats[i]} position={[0, -0.27, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[0.11, 24]} />
                  </mesh>
                  <sprite material={h.glareMat} position={[0, -0.3, 0]} scale={[1.1, 1.1, 1]} />
                  <mesh geometry={beamGeo} material={h.beamMat} position={[0, -0.27, 0]} />
                  {lights ? (
                    // Source avancée dans l'axe : à quelques centimètres, elle saturerait le carter de la lyre
                    <group position={[0, -1.3, 0]}>
                      <primitive object={h.spot} />
                      <primitive object={h.spotTarget} />
                    </group>
                  ) : null}
                </group>
              </group>
            </group>
            <mesh ref={(m) => void (h.pool = m)} material={h.poolMat} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[1, 1]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── Mur LED de fond ────────────────────────────────────────────────────

const wallFragment = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uTime;
  uniform sampler2D uVideo;
  uniform float uHasVideo;
  varying vec2 vUv;
  ${noise3}
  void main() {
    vec2 uv = vUv;
    vec2 p = uv * vec2(2.6, 1.0);
    float t = uTime;
    // Repli tant que la vidéo n'est pas prête : nappes de couleur qui ondulent
    float n = noise3(vec3(p * 1.6, t * 0.18)) * 0.6 + noise3(vec3(p * 3.4 + 4.0, t * 0.3)) * 0.4;
    float flow = 0.5 + 0.5 * sin(p.x * 2.4 + n * 4.0 + t * 0.45);
    vec3 col = mix(uA, uB, flow) * (0.18 + 0.82 * smoothstep(0.2, 0.9, n));
    // Vidéo d'habillage : sa luminance est teintée aux couleurs du cue en cours
    vec3 v = texture2D(uVideo, uv).rgb;
    float lum = dot(v, vec3(0.299, 0.587, 0.114));
    vec3 tinted = mix(uA, uB, smoothstep(0.15, 0.85, lum + 0.25 * sin(p.x * 1.5 + t * 0.3))) * (0.08 + 1.15 * lum) + lum * lum * 0.35;
    col = mix(col, tinted, uHasVideo);
    // Halo central, bords plus sombres
    col *= 0.55 + 0.6 * smoothstep(1.25, 0.1, length((uv - 0.5) * vec2(1.7, 1.3)));
    // Caissons de 50 cm : joints discrets et légère dérive de calibrage (pas de trame fine, qui scintille)
    vec2 cabUv = vUv * vec2(23.0, 9.0);
    vec2 cab = abs(fract(cabUv) - 0.5);
    col *= mix(0.86, 1.0, smoothstep(0.5, 0.47, max(cab.x, cab.y)));
    col *= 0.95 + 0.05 * hash3(vec3(floor(cabUv), 1.0));
    float edge = smoothstep(0.0, 0.004, vUv.x) * smoothstep(1.0, 0.996, vUv.x) * smoothstep(0.0, 0.01, vUv.y) * smoothstep(1.0, 0.99, vUv.y);
    gl_FragColor = vec4(col * edge * 1.25, 1.0);
  }
`;

RectAreaLightUniformsLib.init();

/** Boucle d'habillage du mur LED (10 s, luminance seule : teintée par le shader). */
const WALL_VIDEO = "/landing/mur-led.mp4";

function LedWall({ reduced, lights, onMaterial }: { reduced: boolean; lights: boolean; onMaterial: (m: THREE.ShaderMaterial) => void }) {
  const spill = useRef<THREE.RectAreaLight>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uA: { value: new THREE.Color(PRESHOW.wall[0]) },
          uB: { value: new THREE.Color(PRESHOW.wall[1]) },
          uTime: { value: 0 },
          uVideo: { value: null as THREE.Texture | null },
          uHasVideo: { value: 0 },
        },
        vertexShader: uvVertex,
        fragmentShader: wallFragment,
        toneMapped: false,
      }),
    [],
  );
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => onMaterial(material), [material, onMaterial]);
  // Boucle vidéo muette ; en mouvement réduit, une image fixe
  useEffect(() => {
    const video = document.createElement("video");
    video.src = WALL_VIDEO;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    const onReady = () => {
      material.uniforms.uVideo!.value = texture;
      material.uniforms.uHasVideo!.value = 1;
      invalidate();
    };
    video.addEventListener("loadeddata", onReady, { once: true });
    if (reduced) video.currentTime = 2;
    else void video.play().catch(() => undefined);
    return () => {
      video.removeEventListener("loadeddata", onReady);
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
      material.uniforms.uHasVideo!.value = 0;
    };
  }, [material, reduced, invalidate]);
  useFrame((state, delta) => {
    const light = cueLight(getActiveCue());
    const k = reduced ? 1 : 1 - Math.exp(-delta * 2.5);
    (material.uniforms.uA!.value as THREE.Color).lerp(tmpColor.set(light.wall[0]), k);
    (material.uniforms.uB!.value as THREE.Color).lerp(tmpColor.set(light.wall[1]), k);
    material.uniforms.uTime!.value = reduced ? 3 : state.clock.elapsedTime;
    // L'écran éclaire le plateau : une source surfacique de la couleur moyenne du contenu
    if (spill.current) {
      spill.current.color.copy(material.uniforms.uA!.value as THREE.Color).lerp(material.uniforms.uB!.value as THREE.Color, 0.5);
    }
  });
  return (
    <group position={[0, 3.25, BACK_Z - 0.35]}>
      <mesh material={material}>
        <planeGeometry args={[11.5, 4.4]} />
      </mesh>
      <mesh position={[0, 0, -0.08]}>
        <boxGeometry args={[11.8, 4.7, 0.12]} />
        <meshStandardMaterial color="#09070f" roughness={0.9} />
      </mesh>
      {lights ? <rectAreaLight ref={spill} args={[undefined, 3.2, 11.5, 4.4]} position={[0, 0, 0.05]} /> : null}
    </group>
  );
}

/** Mur LED de fond et ses deux écrans latéraux, qui partagent la même vidéo. */
function Screens({ reduced, lights }: { reduced: boolean; lights: boolean }) {
  const [material, setMaterial] = useState<THREE.ShaderMaterial | null>(null);
  return (
    <>
      <LedWall reduced={reduced} lights={lights} onMaterial={setMaterial} />
      {material ? <SideScreens material={material} /> : null}
    </>
  );
}

/** Pendrillons de velours derrière l'écran : de vrais plis qui accrochent la lumière. */
function Drapes() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(24, 11, 240, 1);
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin(x * 4.2) * 0.09 + Math.sin(x * 11.3 + 1.7) * 0.025);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geometry} position={[0, 4.3, BACK_Z - 0.75]}>
      <meshStandardMaterial color="#1a1226" roughness={0.88} metalness={0} />
    </mesh>
  );
}

// ── Fumée (particules en suspension) ───────────────────────────────────

const hazeVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.11 + aSeed * 12.0) * 0.6;
    p.y += sin(uTime * 0.07 + aSeed * 7.0) * 0.35;
    p.z += cos(uTime * 0.09 + aSeed * 5.0) * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (28.0 + aSeed * 40.0) / -mv.z;
    vAlpha = 0.05 + aSeed * 0.07;
    gl_Position = projectionMatrix * mv;
  }
`;
const hazeFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d) * vAlpha;
    gl_FragColor = vec4(vec3(0.75, 0.72, 0.95) * a, a);
  }
`;

function Haze({ count, reduced }: { count: number; reduced: boolean }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 15;
      pos[i * 3 + 1] = Math.random() * 6.5;
      pos[i * 3 + 2] = BACK_Z + Math.random() * 8;
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: hazeVertex,
        fragmentShader: hazeFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useFrame((state) => {
    material.uniforms.uTime!.value = reduced ? 0 : state.clock.elapsedTime;
  });
  return <points geometry={geometry} material={material} />;
}

// ── Plateau, sonorisation et matériel ─────────────────────────────────

function LineArray({ x }: { x: number }) {
  return (
    <group position={[x, TRUSS_Y - 0.5, FRONT_Z + 0.6]}>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[1.0, 0.08, 0.6]} />
        <meshStandardMaterial color="#26222f" metalness={0.5} roughness={0.5} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[0, -i * 0.29, Math.pow(i, 1.6) * 0.035]} rotation={[-(i * 0.045), 0, 0]}>
          <boxGeometry args={[1.0, 0.27, 0.55]} />
          <meshStandardMaterial color="#141118" metalness={0.2} roughness={0.75} />
        </mesh>
      ))}
    </group>
  );
}

function Stage({ accent, reflect }: { accent: RefObject<THREE.MeshBasicMaterial | null>; reflect: boolean }) {
  return (
    <group>
      {/* Plateau */}
      <mesh position={[0, -0.6, -1.3]}>
        <boxGeometry args={[15.2, 1.2, 8.6]} />
        <meshStandardMaterial color="#120f18" metalness={0.25} roughness={0.32} />
      </mesh>
      {/* Plancher noir laqué : reflète l'écran, les lentilles et les faisceaux */}
      {reflect ? (
        <mesh position={[0, 0.002, -1.3]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[15.2, 8.6]} />
          <MeshReflectorMaterial
            resolution={512}
            blur={[380, 120]}
            mixBlur={0.9}
            mixStrength={9}
            mixContrast={1.1}
            depthScale={0.6}
            minDepthThreshold={0.5}
            maxDepthThreshold={1.6}
            roughness={0.62}
            metalness={0.55}
            color="#0d0b12"
            mirror={0}
          />
        </mesh>
      ) : null}
      {/* Jupe de scène */}
      <mesh position={[0, -0.6, 2.951]}>
        <planeGeometry args={[15.2, 1.2]} />
        <meshStandardMaterial color="#07060b" roughness={1} />
      </mesh>
      {/* Nez de scène : bande LED */}
      <mesh position={[0, -0.12, 2.96]}>
        <boxGeometry args={[15.2, 0.05, 0.02]} />
        <meshBasicMaterial ref={accent} color={PRESHOW.wall[0]} toneMapped={false} />
      </mesh>
      {/* Salle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 10]}>
        <planeGeometry args={[80, 30]} />
        <meshStandardMaterial color="#0a0812" roughness={0.95} />
      </mesh>
      {/* Retours de scène */}
      {[-2.6, 2.6].map((x) => (
        <mesh key={x} position={[x, 0.2, 2.35]} rotation={[-0.5, x > 0 ? -0.2 : 0.2, 0]}>
          <boxGeometry args={[0.7, 0.4, 0.5]} />
          <meshStandardMaterial color="#141118" roughness={0.7} />
        </mesh>
      ))}
      {/* Flight-cases en coulisses */}
      <group position={[-5.6, 0, -2.4]} rotation={[0, 0.12, 0]}>
        <Model name="flightcase" interactive={false} />
        <group position={[0, 0.82, 0]} rotation={[0, -0.08, 0]}>
          <Model name="flightcase" interactive={false} />
        </group>
        <group position={[1.35, 0, 0.2]} rotation={[0, 0.3, 0]}>
          <Model name="flightcase" interactive={false} />
        </group>
      </group>
      <group position={[5.5, 0, -2.6]} rotation={[0, -0.2, 0]}>
        <Model name="flightcase" interactive={false} />
        <group position={[-1.3, 0, 0.3]} rotation={[0, 0.25, 0]}>
          <Model name="flightcase" interactive={false} />
        </group>
      </group>
      {/* Camion au quai, derrière la scène */}
      <group position={[-17, -1.2, -10]} rotation={[0, -0.55, 0]}>
        <Model name="truck" interactive={false} />
      </group>
    </group>
  );
}

// ── Piste de danse lumineuse ───────────────────────────────────────────

const FLOOR_W = 16;
const FLOOR_D = 8;
const FLOOR_TILE = 0.8;

const floorVertex = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const floorFragment = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uTile;
  varying vec2 vPos;
  ${noise3}
  void main() {
    vec2 cell = floor(vPos / uTile);
    vec2 f = fract(vPos / uTile) - 0.5;
    vec2 c = (cell + 0.5) * uTile;
    // Onde qui part du nez de scène (y local = +4 côté scène), plus vive pendant le show
    float dist = length(c - vec2(0.0, ${(FLOOR_D / 2).toFixed(1)}));
    float speed = 0.8 + 1.6 * uEnergy;
    float ripple = 0.5 + 0.5 * sin(dist * 0.9 - uTime * speed);
    // Variation lente propre à chaque dalle : jamais de bascule brutale
    float h = hash3(vec3(cell, 3.0));
    float drift = 0.5 + 0.5 * sin(uTime * (0.6 + h) + h * 6.283);
    float v = mix(drift, ripple, 0.55 + 0.35 * uEnergy);
    vec3 col = mix(uA, uB, smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(c.x * 0.35 + uTime * 0.25 + h)));
    // Dalle en verre dépoli : centre plus lumineux, joints sombres anti-crénelés
    float d = max(abs(f.x), abs(f.y));
    float aa = fwidth(d) * 1.5;
    float tile = 1.0 - smoothstep(0.44 - aa, 0.44 + aa, d);
    float diffuse = 0.75 + 0.25 * (1.0 - length(f) * 1.4);
    float level = (0.12 + 0.6 * v * v) * (0.55 + 0.45 * uEnergy);
    gl_FragColor = vec4(col * level * diffuse * tile + vec3(0.012), 1.0);
  }
`;

/** Piste de danse en dalles LED sous le public, teintée par le cue, qui pulse avec le show. */
function DanceFloor({ reduced }: { reduced: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uA: { value: new THREE.Color(PRESHOW.colors[0]) },
          uB: { value: new THREE.Color(PRESHOW.colors[1]) },
          uTime: { value: 0 },
          uEnergy: { value: 0.3 },
          uTile: { value: FLOOR_TILE },
        },
        vertexShader: floorVertex,
        fragmentShader: floorFragment,
        toneMapped: false,
      }),
    [],
  );
  useFrame((state, delta) => {
    const cue = getActiveCue();
    const light = cueLight(cue);
    const k = reduced ? 1 : 1 - Math.exp(-delta * 2);
    (material.uniforms.uA!.value as THREE.Color).lerp(tmpColor.set(light.colors[0]), k);
    (material.uniforms.uB!.value as THREE.Color).lerp(tmpColor.set(light.wall[1]), k);
    material.uniforms.uEnergy!.value += (crowdEnergy(cue) - material.uniforms.uEnergy!.value) * k;
    material.uniforms.uTime!.value = reduced ? 2 : state.clock.elapsedTime;
  });
  return (
    <group position={[0, -1.195, 4 + FLOOR_D / 2]}>
      <mesh material={material} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FLOOR_W, FLOOR_D]} />
      </mesh>
      {/* Cadre aluminium de la piste */}
      <mesh position={[0, -0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FLOOR_W + 0.3, FLOOR_D + 0.3]} />
        <meshStandardMaterial color="#3a3644" metalness={0.8} roughness={0.35} />
      </mesh>
    </group>
  );
}

// ── Public en contre-jour ──────────────────────────────────────────────


function Crowd({ count, reduced }: { count: number; reduced: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const armsRef = useRef<THREE.InstancedMesh>(null);
  const phonesRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const body = new THREE.CapsuleGeometry(0.2, 0.75, 3, 8);
    body.translate(0, 0.6, 0);
    const head = new THREE.SphereGeometry(0.13, 10, 8);
    head.translate(0, 1.27, 0);
    return mergeGeometries([body, head])!;
  }, []);
  const armGeometry = useMemo(() => {
    const g = new THREE.CapsuleGeometry(0.05, 0.55, 2, 6);
    g.translate(0, 0.32, 0);
    return g;
  }, []);
  const phoneGeometry = useMemo(() => new THREE.PlaneGeometry(0.06, 0.11), []);
  const phoneMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#b9cfff").multiplyScalar(0.55), toneMapped: false }), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: "#040308" }), []);
  const people = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Rangs plus denses près de la scène
        const row = Math.sqrt(Math.random());
        return {
          x: (Math.random() - 0.5) * (12 + row * 8),
          z: 4.4 + (1 - row) * 7 + Math.random() * 0.3,
          s: 0.88 + Math.random() * 0.24,
          r: (Math.random() - 0.5) * 0.6,
          phase: Math.random() * Math.PI * 2,
          rate: 4.6 + Math.random() * 1.4,
          fan: i % 5 === 0,
          /** Sort son téléphone au-delà de ce niveau d'énergie */
          phone: Math.random() < 0.22 ? 0.2 + Math.random() * 0.7 : 2,
          armUp: 0.25 + Math.random() * 0.6,
        };
      }),
    [count],
  );
  const energy = useRef(0.3);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    energy.current += (crowdEnergy(getActiveCue()) - energy.current) * (reduced ? 1 : 1 - Math.exp(-delta * 1.5));
    const t = reduced ? 0 : state.clock.elapsedTime;
    const { beat } = beatAt(t);
    const arms = armsRef.current;
    const phones = phonesRef.current;
    const e = energy.current;
    people.forEach((p, i) => {
      // Sauts calés sur le tempo, avec un léger décalage propre à chacun
      const jump = Math.abs(Math.sin(beat * Math.PI + p.phase * 0.25)) * e * (p.fan ? 0.3 : 0.13);
      const sway = Math.sin(t * 0.9 + p.phase) * 0.05 * (1 - e * 0.5);
      pos.set(p.x, -1.2 + jump, p.z);
      euler.set(0, p.r, sway);
      scale.setScalar(p.s);
      mesh.setMatrixAt(i, matrix.compose(pos, q.setFromEuler(euler), scale));
      // Bras levés : les fans d'abord, puis une partie du public quand le show démarre
      if (arms) {
        const raised = p.fan ? Math.min(1, e * 1.6) : THREE.MathUtils.smoothstep(e, p.armUp, p.armUp + 0.2);
        const wave = Math.sin(beat * Math.PI * 0.5 + p.phase) * 0.25 * e;
        for (const side of [-1, 1]) {
          const shoulderX = side * 0.17 * p.s;
          pos.set(p.x + shoulderX * Math.cos(p.r), -1.2 + jump + 1.02 * p.s, p.z - shoulderX * Math.sin(p.r));
          euler.set(-0.2, p.r, side * (0.35 + wave) + (1 - raised) * side * 2.7);
          scale.set(p.s, p.s * (0.2 + 0.8 * raised), p.s);
          arms.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), matrix.compose(pos, q.setFromEuler(euler), scale));
        }
      }
      // Écrans de téléphone tenus au-dessus des têtes
      if (phones) {
        const shown = e > p.phone ? 1 : 0;
        pos.set(p.x + 0.12, -1.2 + jump + 1.62 * p.s, p.z - 0.12);
        euler.set(0.15, p.r * 0.5, Math.sin(t + p.phase) * 0.08);
        scale.setScalar(shown * p.s);
        phones.setMatrixAt(i, matrix.compose(pos, q.setFromEuler(euler), scale));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (arms) arms.instanceMatrix.needsUpdate = true;
    if (phones) phones.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />
      <instancedMesh ref={armsRef} args={[armGeometry, material, count * 2]} frustumCulled={false} />
      <instancedMesh ref={phonesRef} args={[phoneGeometry, phoneMaterial, count]} frustumCulled={false} />
    </group>
  );
}

// ── Caméra : dolly au défilement, parallaxe au pointeur ────────────────

function CameraRig({ reduced }: { reduced: boolean }) {
  const { camera, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 2.7, -1), []);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      POINTER.x = (e.clientX / window.innerWidth) * 2 - 1;
      POINTER.y = (e.clientY / window.innerHeight) * 2 - 1;
      POINTER.moved = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  useFrame((state, delta) => {
    const portrait = size.width / size.height < 1;
    const scroll = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
    const cue = getActiveCue();
    const t = state.clock.elapsedTime;
    const inShow = cue >= 0;
    const baseZ = inShow ? (portrait ? 30 : 15.5) : (portrait ? 28 : 14.5) - scroll * 2.6;
    const orbit = cue >= 0 && !reduced ? Math.sin(t * 0.12) * 1.6 : 0;
    const x = orbit + (reduced ? 0 : POINTER.x * 0.9) + (portrait ? 0 : cue >= 0 ? -2.2 : 0);
    const y = (inShow ? 2.2 : 0.8 + scroll * 1.4) - (reduced ? 0 : POINTER.y * 0.35);
    const k = reduced ? 1 : 1 - Math.exp(-delta * 2);
    camera.position.x += (x - camera.position.x) * k;
    camera.position.y += (y - camera.position.y) * k;
    camera.position.z += (baseZ - camera.position.z) * k;
    target.x += ((inShow && !portrait ? -2.4 : 0) - target.x) * k;
    target.y += ((inShow ? 3.2 : 3.1) - target.y) * k;
    camera.lookAt(target);
  });
  return null;
}

function Atmosphere({ reduced, reflect }: { reduced: boolean; reflect: boolean }) {
  const accent = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, delta) => {
    const light = cueLight(getActiveCue());
    if (accent.current) accent.current.color.lerp(tmpColor.set(light.wall[0]), reduced ? 1 : 1 - Math.exp(-delta * 2.5));
  });
  return <Stage accent={accent} reflect={reflect} />;
}

export interface StageSceneProps {
  /** Rendu actif (le plateau est visible à l'écran) */
  active: boolean;
  reduced: boolean;
  quality: "low" | "high";
}

/** Plateau de spectacle 3D de la page d'accueil. */

export default function StageScene({ active, reduced, quality }: StageSceneProps) {
  const high = quality === "high";
  return (
    <Canvas
      frameloop={active && !reduced ? "always" : "demand"}
      dpr={high ? [1, 1.75] : [1, 1.25]}
      camera={{ position: [0, 0.8, 14.5], fov: 42, near: 0.1, far: 120 }}
      gl={{ antialias: !high, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      aria-hidden
    >
      <color attach="background" args={[VELVET]} />
      <fog attach="fog" args={[VELVET, 16, 42]} />
      {/* Salle dans le noir : l'essentiel de la lumière vient des lyres et de l'écran */}
      <ambientLight intensity={high ? 0.14 : 0.35} color="#8b7fd6" />
      <hemisphereLight args={["#6f63c9", "#120e1c", high ? 0.22 : 0.45]} />
      <directionalLight position={[4, 9, 8]} intensity={high ? 0.35 : 0.7} color="#ffd9b0" />
      <pointLight position={[0, 3, 4]} intensity={high ? 3 : 6} distance={14} color="#b9a8ff" />
      <TrussRig />
      <MovingHeads reduced={reduced} lights={high} />
      <Blinders reduced={reduced} />
      <Lasers reduced={reduced} />
      <Screens reduced={reduced} lights={high} />
      <Drapes />
      <Uplights reduced={reduced} />
      <DjBooth reduced={reduced} lights={high} />
      <Co2Jets reduced={reduced} />
      <SubStacks reduced={reduced} />
      <LineArray x={-HALF_W - 0.9} />
      <LineArray x={HALF_W + 0.9} />
      <Atmosphere reduced={reduced} reflect={high} />
      <Haze count={high ? 650 : 260} reduced={reduced} />
      <DanceFloor reduced={reduced} />
      <Crowd count={high ? 190 : 90} reduced={reduced} />
      <CameraRig reduced={reduced} />
      {high ? (
        // Tampons 8 bits : un pixel infini ou NaN (spéculaire saturé, arrondi de shader) ne peut pas
        // s'y loger, donc le bloom ne peut plus le propager à toute l'image
        <EffectComposer multisampling={4} frameBufferType={THREE.UnsignedByteType}>
          <Bloom mipmapBlur luminanceThreshold={0.45} luminanceSmoothing={0.35} intensity={1.1} radius={0.8} />
          <Vignette eskil={false} offset={0.22} darkness={0.75} />
        </EffectComposer>
      ) : null}
    </Canvas>
  );
}
