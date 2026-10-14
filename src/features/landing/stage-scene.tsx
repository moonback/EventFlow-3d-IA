"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Model } from "@/three/objects/models";
import { getActiveCue, useActiveCue } from "./cue-store";
import { CUES, PRESHOW, type BeamMode, type LightCue } from "./cues";

// ── Dimensions du plateau (mètres) ─────────────────────────────────────
const TRUSS_Y = 6.6;
const FRONT_Z = 1.2;
const BACK_Z = -3.8;
const HALF_W = 7;
const HEADS_X = [-5, -3, -1, 1, 3, 5];
const BEAM_LENGTH = 9.5;
const VELVET = "#0e0b1a";

/** Pointeur de la page (coordonnées normalisées), partagé par la caméra et la poursuite. */
const POINTER = { x: 0, y: 0, moved: false };
/** Lyre qui devient poursuite et suit le pointeur pendant l'ouverture. */
const FOLLOW_INDEX = 2;
const FOLLOW_COLOR = "#f4f1ff";

const cueLight = (index: number): LightCue => (index < 0 ? PRESHOW : (CUES[index]?.light ?? PRESHOW));

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
  uniform float uLength;
  void main() {
    vAlong = clamp(-position.y / uLength, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float fade = pow(1.0 - vAlong, 1.7) * smoothstep(0.0, 0.04, vAlong);
    float core = pow(abs(dot(vNormal, vView)), 2.2);
    float a = fade * core * uIntensity * 0.5;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

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
  switch (mode) {
    case "still":
      return { azimuth: k * 0.07, tilt: 0.22 + (i % 2) * 0.06, level: 1 };
    case "fan":
      return { azimuth: k * 0.22 + 0.06 * Math.sin(t * 0.8), tilt: 0.45 + 0.1 * Math.sin(t + i * 0.6), level: 1 };
    case "sweep":
      return { azimuth: 0.62 * Math.sin(t * 0.9 + i * 0.35), tilt: 0.5 + 0.05 * Math.cos(t * 0.5), level: 1 };
    case "cross":
      return { azimuth: (i < 3 ? 1 : -1) * (0.45 + 0.15 * Math.sin(t)), tilt: 0.55 + 0.1 * Math.cos(t * 0.7 + i), level: 1 };
    case "chase": {
      const pulse = Math.max(0, Math.sin(t * 2.2 - i * 0.9));
      return { azimuth: k * 0.15, tilt: 0.28 + 0.3 * pulse, level: 0.35 + 0.65 * pulse };
    }
    case "ballyhoo":
      return { azimuth: 0.9 * Math.sin(t * 0.7 + i * 1.3), tilt: 0.55 + 0.35 * Math.sin(t * 1.1 + i * 2.1), level: 0.85 + 0.15 * Math.sin(t * 6 + i) };
  }
}

interface HeadRefs {
  yoke: THREE.Group | null;
  head: THREE.Group | null;
  lens: THREE.Mesh | null;
  pool: THREE.Mesh | null;
  beamMat: THREE.ShaderMaterial;
  poolMat: THREE.ShaderMaterial;
  color: THREE.Color;
  azimuth: number;
  tilt: number;
  level: number;
}

const tmpOrigin = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpColor = new THREE.Color();
const tmpQuat = new THREE.Quaternion();
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Six lyres asservies sur le pont de face, pilotées par le cue actif. */
function MovingHeads({ reduced }: { reduced: boolean }) {
  const caseMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1d1a26", metalness: 0.35, roughness: 0.5 }), []);
  const beamGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.09, 1.25, BEAM_LENGTH, 40, 1, true);
    g.translate(0, -BEAM_LENGTH / 2, 0);
    return g;
  }, []);
  const heads = useMemo<HeadRefs[]>(
    () =>
      HEADS_X.map((_, i) => {
        const color = new THREE.Color(PRESHOW.colors[i]);
        const uniforms = () => ({ uColor: { value: color }, uIntensity: { value: 1 }, uLength: { value: BEAM_LENGTH } });
        const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false } as const;
        return {
          yoke: null,
          head: null,
          lens: null,
          pool: null,
          color,
          beamMat: new THREE.ShaderMaterial({ ...common, uniforms: uniforms(), vertexShader: beamVertex, fragmentShader: beamFragment, side: THREE.DoubleSide }),
          poolMat: new THREE.ShaderMaterial({ ...common, uniforms: uniforms(), vertexShader: uvVertex, fragmentShader: poolFragment }),
          azimuth: 0,
          tilt: 0.3,
          level: 1,
        };
      }),
    [],
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
      h.level += ((isFollow ? p.level : p.level * light.intensity) - h.level) * snap;
      h.color.lerp(tmpColor.set(isFollow ? FOLLOW_COLOR : light.colors[i]!), colorSnap);
      if (h.yoke) h.yoke.rotation.y = Math.PI + h.azimuth;
      if (h.head) h.head.rotation.x = h.tilt;
      h.beamMat.uniforms.uIntensity!.value = h.level;
      lensMats[i]!.color.copy(h.color).multiplyScalar(1.5 + h.level * 2.5);
      // Tache au sol : intersection du faisceau avec le plateau (y = 0)
      if (h.lens && h.pool) {
        h.lens.getWorldPosition(tmpOrigin);
        tmpDir.set(0, -1, 0).applyQuaternion(h.lens.getWorldQuaternion(tmpQuat));
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
                  <mesh ref={(m) => void (h.lens = m)} material={lensMats[i]} position={[0, -0.27, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[0.11, 24]} />
                  </mesh>
                  <mesh geometry={beamGeo} material={h.beamMat} position={[0, -0.27, 0]} />
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
  varying vec2 vUv;
  void main() {
    vec2 grid = vec2(132.0, 50.0);
    vec2 cell = floor(vUv * grid) / grid;
    vec2 f = fract(vUv * grid) - 0.5;
    float dot_ = smoothstep(0.5, 0.28, length(f));
    float wave = 0.5 + 0.5 * sin(cell.x * 9.0 + uTime * 0.9 + sin(cell.y * 6.0 + uTime * 0.6) * 1.6);
    float band = smoothstep(0.0, 0.12, abs(fract(cell.y * 1.5 - uTime * 0.12) - 0.5));
    vec3 col = mix(uA, uB, wave) * (0.25 + 0.55 * wave) * (0.55 + 0.45 * band);
    float edge = smoothstep(0.0, 0.02, vUv.x) * smoothstep(1.0, 0.98, vUv.x) * smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
    gl_FragColor = vec4(col * dot_ * edge, 1.0);
  }
`;

function LedWall({ reduced }: { reduced: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uA: { value: new THREE.Color(PRESHOW.wall[0]) }, uB: { value: new THREE.Color(PRESHOW.wall[1]) }, uTime: { value: 0 } },
        vertexShader: uvVertex,
        fragmentShader: wallFragment,
        toneMapped: false,
      }),
    [],
  );
  useFrame((state, delta) => {
    const light = cueLight(getActiveCue());
    const k = reduced ? 1 : 1 - Math.exp(-delta * 2.5);
    (material.uniforms.uA!.value as THREE.Color).lerp(tmpColor.set(light.wall[0]), k);
    (material.uniforms.uB!.value as THREE.Color).lerp(tmpColor.set(light.wall[1]), k);
    material.uniforms.uTime!.value = reduced ? 3 : state.clock.elapsedTime;
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
    </group>
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

function Stage({ accent }: { accent: RefObject<THREE.MeshBasicMaterial | null> }) {
  return (
    <group>
      {/* Plateau */}
      <mesh position={[0, -0.6, -1.3]}>
        <boxGeometry args={[15.2, 1.2, 8.6]} />
        <meshStandardMaterial color="#17131f" metalness={0.25} roughness={0.32} />
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
      {[-2.4, 2.4].map((x) => (
        <mesh key={x} position={[x, 0.2, 2.3]} rotation={[-0.5, x > 0 ? -0.2 : 0.2, 0]}>
          <boxGeometry args={[0.7, 0.4, 0.5]} />
          <meshStandardMaterial color="#141118" roughness={0.7} />
        </mesh>
      ))}
      {/* Pupitre au centre */}
      <mesh position={[0, 0.55, 0.9]}>
        <cylinderGeometry args={[0.03, 0.03, 1.1, 8]} />
        <meshStandardMaterial color="#3a3446" metalness={0.6} roughness={0.4} />
      </mesh>
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

// ── Public en contre-jour ──────────────────────────────────────────────

/** Énergie du public selon le cue : il saute pendant le show, ondule ailleurs. */
const crowdEnergy = (cue: number) => (cue === CUES.findIndex((c) => c.id === "show") ? 1 : cue < 0 ? 0.3 : 0.12);

function Crowd({ count, reduced }: { count: number; reduced: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const body = new THREE.CapsuleGeometry(0.2, 0.75, 3, 8);
    body.translate(0, 0.6, 0);
    const head = new THREE.SphereGeometry(0.13, 10, 8);
    head.translate(0, 1.27, 0);
    return mergeGeometries([body, head])!;
  }, []);
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
    people.forEach((p, i) => {
      const jump = Math.abs(Math.sin(t * p.rate * 0.5 + p.phase)) * energy.current * (p.fan ? 0.32 : 0.14);
      const sway = Math.sin(t * 0.9 + p.phase) * 0.05 * (1 - energy.current * 0.5);
      pos.set(p.x, -1.2 + jump, p.z);
      euler.set(0, p.r, sway);
      scale.setScalar(p.s);
      mesh.setMatrixAt(i, matrix.compose(pos, q.setFromEuler(euler), scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />;
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

function Atmosphere({ reduced }: { reduced: boolean }) {
  const accent = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, delta) => {
    const light = cueLight(getActiveCue());
    if (accent.current) accent.current.color.lerp(tmpColor.set(light.wall[0]), reduced ? 1 : 1 - Math.exp(-delta * 2.5));
  });
  return <Stage accent={accent} />;
}

export interface StageSceneProps {
  /** Rendu actif (le plateau est visible à l'écran) */
  active: boolean;
  reduced: boolean;
  quality: "low" | "high";
}

/** Plateau de spectacle 3D de la page d'accueil. */
export default function StageScene({ active, reduced, quality }: StageSceneProps) {
  return (
    <Canvas
      frameloop={active && !reduced ? "always" : "demand"}
      dpr={quality === "high" ? [1, 1.75] : [1, 1.25]}
      camera={{ position: [0, 0.8, 14.5], fov: 42, near: 0.1, far: 120 }}
      gl={{ antialias: quality === "low", powerPreference: "high-performance" }}
      aria-hidden
    >
      <color attach="background" args={[VELVET]} />
      <fog attach="fog" args={[VELVET, 16, 42]} />
      <ambientLight intensity={0.35} color="#8b7fd6" />
      <hemisphereLight args={["#6f63c9", "#120e1c", 0.45]} />
      <directionalLight position={[4, 9, 8]} intensity={0.7} color="#ffd9b0" />
      <pointLight position={[0, 3, 4]} intensity={6} distance={14} color="#b9a8ff" />
      <TrussRig />
      <MovingHeads reduced={reduced} />
      <LedWall reduced={reduced} />
      <LineArray x={-HALF_W - 0.9} />
      <LineArray x={HALF_W + 0.9} />
      <Atmosphere reduced={reduced} />
      <Haze count={quality === "high" ? 650 : 260} reduced={reduced} />
      <Crowd count={quality === "high" ? 190 : 90} reduced={reduced} />
      <CameraRig reduced={reduced} />
      {quality === "high" ? (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={0.35} luminanceSmoothing={0.3} intensity={1.15} radius={0.75} />
          <Vignette eskil={false} offset={0.22} darkness={0.7} />
        </EffectComposer>
      ) : null}
    </Canvas>
  );
}
