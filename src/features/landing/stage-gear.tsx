"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { getActiveCue } from "./cue-store";
import { CUES, GEL, PRESHOW, type LightCue } from "./cues";

// ── Plateau : dimensions communes (mètres) ─────────────────────────────

export const TRUSS_Y = 6.6;
export const FRONT_Z = 1.2;
export const BACK_Z = -3.8;
export const HALF_W = 7;

// ── Temps musical ──────────────────────────────────────────────────────

/** Tempo du set : tout ce qui bouge sur le plateau se cale dessus. */
export const BPM = 124;

/** Numéro de temps (continu), position dans le temps et impulsion qui retombe après chaque temps. */
export function beatAt(t: number) {
  const beat = (t * BPM) / 60;
  const frac = beat - Math.floor(beat);
  return { beat, frac, pulse: Math.exp(-frac * 5) };
}

const SHOW_INDEX = CUES.findIndex((c) => c.id === "show");

/** Énergie du plateau selon le cue : pleine pendant le show, modérée à l'ouverture, calme ailleurs. */
export const showEnergy = (cue: number) => (cue === SHOW_INDEX ? 1 : cue < 0 ? 0.35 : 0.12);

export const cueLight = (index: number): LightCue => (index < 0 ? PRESHOW : (CUES[index]?.light ?? PRESHOW));

/** Rapproche une valeur de sa cible, à vitesse constante quelle que soit la cadence d'image. */
export const approach = (value: number, target: number, delta: number, rate: number, reduced: boolean) =>
  reduced ? target : value + (target - value) * (1 - Math.exp(-delta * rate));

const tmpColor = new THREE.Color();

// ── Faisceaux simples (barres de beams, lasers) ────────────────────────

const shaftVertex = /* glsl */ `
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vV;
  uniform float uLength;
  void main() {
    vAlong = clamp(-position.y / uLength, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const shaftFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uFalloff;
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    // max() : l'interpolation peut dépasser 1 d'un ulp, et pow() d'une base négative donne NaN
    float fade = pow(max(1.0 - vAlong, 0.0), uFalloff) * smoothstep(0.0, 0.02, vAlong);
    float core = pow(abs(dot(vN, vV)), 1.8);
    float a = fade * core * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

function shaftMaterial(length: number, falloff = 1.6) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uIntensity: { value: 0 }, uLength: { value: length }, uFalloff: { value: falloff } },
    vertexShader: shaftVertex,
    fragmentShader: shaftFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** Cône ouvert dont la pointe est à l'origine et qui s'étend vers -Y. */
function coneGeometry(top: number, bottom: number, length: number, segments = 24) {
  const g = new THREE.CylinderGeometry(top, bottom, length, segments, 1, true);
  g.translate(0, -length / 2, 0);
  return g;
}

const darkMetal = () => new THREE.MeshStandardMaterial({ color: "#16131c", metalness: 0.55, roughness: 0.4 });

// ── Régie DJ ───────────────────────────────────────────────────────────

const facadeFragment = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uTime;
  uniform float uPulse;
  uniform float uEnergy;
  varying vec2 vUv;
  void main() {
    // Égaliseur : 28 barres segmentées dont la hauteur suit le morceau
    float bars = 28.0;
    float i = floor(vUv.x * bars);
    vec2 f = vec2(fract(vUv.x * bars), fract(vUv.y * 16.0));
    float wave = (0.5 + 0.5 * sin(uTime * 1.9 + i * 0.83)) * (0.55 + 0.45 * sin(uTime * 0.7 + i * 0.37));
    float centre = 1.0 - abs(i / (bars - 1.0) - 0.5) * 1.2;
    float h = 0.12 + (0.25 + 0.5 * wave) * (0.45 + 0.55 * uEnergy) + uPulse * 0.22 * uEnergy * centre;
    float aax = fwidth(f.x) * 1.5;
    float aay = fwidth(f.y) * 1.5;
    float cellMask = smoothstep(0.12 - aax, 0.12 + aax, f.x) * (1.0 - smoothstep(0.88 - aax, 0.88 + aax, f.x))
      * smoothstep(0.15 - aay, 0.15 + aay, f.y) * (1.0 - smoothstep(0.85 - aay, 0.85 + aay, f.y));
    float lit = 1.0 - smoothstep(h - 0.01, h + 0.01, vUv.y);
    vec3 col = mix(uA, uB, vUv.y) * lit * cellMask * 1.3 + mix(uA, uB, 0.5) * 0.025;
    gl_FragColor = vec4(col, 1.0);
  }
`;
const uvVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

interface Limb {
  shoulder: THREE.Group | null;
  elbow: THREE.Group | null;
}

/**
 * La régie DJ au centre du plateau : praticable, table avec deux platines, table de mixage et
 * ordinateur, façade LED en égaliseur, et le DJ qui joue son set en rythme.
 */
export function DjBooth({ reduced, lights }: { reduced: boolean; lights: boolean }) {
  const metal = useMemo(darkMetal, []);
  const cloth = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1d1a27", roughness: 0.85 }), []);
  const skin = useMemo(() => new THREE.MeshStandardMaterial({ color: "#a07a65", roughness: 0.55 }), []);
  const phones = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0d0c10", metalness: 0.6, roughness: 0.3 }), []);
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: GEL.amber, toneMapped: false }), []);
  const screen = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#9fc4ff").multiplyScalar(0.9), toneMapped: false }), []);
  const meterMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(GEL.green).multiplyScalar(1.4), toneMapped: false }), []);
  const facade = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uA: { value: new THREE.Color(PRESHOW.wall[0]) },
          uB: { value: new THREE.Color(PRESHOW.wall[1]) },
          uTime: { value: 0 },
          uPulse: { value: 0 },
          uEnergy: { value: 0.35 },
        },
        vertexShader: uvVertex,
        fragmentShader: facadeFragment,
        toneMapped: false,
      }),
    [],
  );
  const key = useMemo(() => {
    const light = new THREE.SpotLight("#ffe0c2", 0, 14, 0.32, 0.7, 1.5);
    const target = new THREE.Object3D();
    target.position.set(0, 2.1, 0.1);
    light.target = target;
    return { light, target };
  }, []);

  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const left = useRef<Limb>({ shoulder: null, elbow: null });
  const right = useRef<Limb>({ shoulder: null, elbow: null });
  const jogs = useRef<(THREE.Group | null)[]>([]);
  const meters = useRef<(THREE.Mesh | null)[]>([]);
  const state = useRef({ energy: 0.35, raise: 0, scratch: 0 });

  useFrame((frame, delta) => {
    const cue = getActiveCue();
    const light = cueLight(cue);
    const s = state.current;
    s.energy = approach(s.energy, showEnergy(cue), delta, 1.5, reduced);
    const e = s.energy;
    const t = reduced ? 1.2 : frame.clock.elapsedTime;
    const { beat, frac, pulse } = beatAt(t);
    const groove = 0.35 + 0.65 * e;

    // Façade et lumières de la régie
    const k = reduced ? 1 : 1 - Math.exp(-delta * 2.5);
    (facade.uniforms.uA!.value as THREE.Color).lerp(tmpColor.set(light.wall[0]), k);
    (facade.uniforms.uB!.value as THREE.Color).lerp(tmpColor.set(light.wall[1]), k);
    facade.uniforms.uTime!.value = t;
    facade.uniforms.uPulse!.value = reduced ? 0 : pulse;
    facade.uniforms.uEnergy!.value = e;
    glow.color.copy(facade.uniforms.uA!.value as THREE.Color).multiplyScalar(1.6);
    key.light.intensity = lights ? 26 + 14 * e : 0;

    // Platines qui tournent, vumètres qui suivent le temps
    jogs.current.forEach((jog, i) => {
      if (jog && !reduced) jog.rotation.y -= delta * (i === 0 ? 3.5 : 3.4);
    });
    meters.current.forEach((m, i) => {
      if (m) m.scale.y = 0.25 + 0.75 * (reduced ? 0.6 : Math.max(0.15, pulse * (0.7 + 0.3 * Math.sin(t * 3 + i))) * groove);
    });

    // Le DJ : genoux qui plient sur le temps, tête qui bat la mesure, épaules qui roulent
    const bounce = 0.5 + 0.5 * Math.cos(frac * Math.PI * 2);
    if (root.current) root.current.position.y = reduced ? 0 : -0.05 * bounce * groove;
    if (torso.current) {
      torso.current.rotation.y = reduced ? 0 : 0.14 * Math.sin(beat * Math.PI * 0.5) * groove;
      torso.current.rotation.x = 0.1 + (reduced ? 0 : 0.05 * bounce * groove);
    }
    if (head.current) head.current.rotation.x = -0.05 + (reduced ? 0 : 0.24 * pulse * groove);

    // Main gauche sur la platine : scratch une mesure sur deux
    const bar = Math.floor(beat / 4);
    s.scratch = approach(s.scratch, bar % 2 === 1 ? 1 : 0, delta, 6, reduced);
    const l = left.current;
    if (l.shoulder && l.elbow) {
      l.shoulder.rotation.set(-0.5, reduced ? 0 : s.scratch * 0.16 * Math.sin(beat * Math.PI * 4), -0.12);
      l.elbow.rotation.x = -0.55;
    }
    // Main droite : au mixer, puis levée vers le public pendant le show (4 mesures sur 8)
    const wantRaise = e > 0.6 && Math.floor(beat / 16) % 2 === 1 ? 1 : 0;
    s.raise = approach(s.raise, wantRaise, delta, 4, reduced);
    const r = right.current;
    if (r.shoulder && r.elbow) {
      const wave = reduced ? 0 : Math.sin(beat * Math.PI) * 0.15 * s.raise;
      const tweak = reduced ? 0 : (1 - s.raise) * 0.06 * Math.sin(t * 2.3);
      r.shoulder.rotation.set(THREE.MathUtils.lerp(-0.5, -0.15, s.raise), tweak, THREE.MathUtils.lerp(0.12, 2.75, s.raise) + wave);
      r.elbow.rotation.x = THREE.MathUtils.lerp(-0.55, -0.3, s.raise);
    }
  });

  const arm = (side: -1 | 1, limb: RefObject<Limb>) => (
    <group position={[side * 0.23, 0.58, 0]} ref={(g) => void (limb.current.shoulder = g)}>
      <mesh material={cloth} position={[0, -0.15, 0]}>
        <capsuleGeometry args={[0.055, 0.22, 4, 8]} />
      </mesh>
      <group position={[0, -0.3, 0]} ref={(g) => void (limb.current.elbow = g)}>
        <mesh material={cloth} position={[0, -0.13, 0]}>
          <capsuleGeometry args={[0.047, 0.2, 4, 8]} />
        </mesh>
        <mesh material={skin} position={[0, -0.29, 0]}>
          <sphereGeometry args={[0.05, 10, 8]} />
        </mesh>
      </group>
    </group>
  );

  return (
    <group position={[0, 0, 0.5]}>
      {/* Praticable */}
      <mesh material={metal} position={[0, 0.25, 0]}>
        <boxGeometry args={[3.6, 0.5, 2.2]} />
      </mesh>
      <mesh material={glow} position={[0, 0.47, 1.105]}>
        <boxGeometry args={[3.6, 0.025, 0.01]} />
      </mesh>

      <group position={[0, 0.5, 0]}>
        {/* Table et façade LED */}
        <mesh material={metal} position={[0, 1.0, 0]}>
          <boxGeometry args={[2.6, 0.05, 0.72]} />
        </mesh>
        <mesh material={facade} position={[0, 0.5, 0.37]}>
          <planeGeometry args={[2.6, 0.95]} />
        </mesh>
        {[-1.3, 1.3].map((x) => (
          <mesh key={x} material={metal} position={[x, 0.5, 0]}>
            <boxGeometry args={[0.05, 1.0, 0.72]} />
          </mesh>
        ))}

        {/* Platines */}
        {[-0.55, 0.55].map((x, i) => (
          <group key={x} position={[x, 1.07, -0.02]}>
            <mesh material={metal}>
              <boxGeometry args={[0.34, 0.08, 0.42]} />
            </mesh>
            <group position={[0, 0.05, 0.03]} ref={(g) => void (jogs.current[i] = g)}>
              <mesh material={phones}>
                <cylinderGeometry args={[0.11, 0.11, 0.02, 28]} />
              </mesh>
              <mesh material={glow} position={[0, 0.011, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.112, 0.006, 6, 32, Math.PI * 1.6]} />
              </mesh>
            </group>
          </group>
        ))}
        {/* Table de mixage et vumètres */}
        <group position={[0, 1.075, -0.02]}>
          <mesh material={metal}>
            <boxGeometry args={[0.34, 0.09, 0.4]} />
          </mesh>
          {[-0.06, -0.02, 0.02, 0.06].map((x, i) => (
            <mesh key={x} material={meterMat} position={[x, 0.047, 0.05]} rotation={[-Math.PI / 2, 0, 0]} ref={(m) => void (meters.current[i] = m)}>
              <planeGeometry args={[0.018, 0.14]} />
            </mesh>
          ))}
        </group>
        {/* Ordinateur sur son support : écran vers le DJ, logo lumineux vers le public */}
        <group position={[1.0, 1.18, 0.05]} rotation={[0, -0.25, 0]}>
          <mesh material={metal} position={[0, -0.075, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.15, 8]} />
          </mesh>
          <mesh material={metal}>
            <boxGeometry args={[0.33, 0.012, 0.23]} />
          </mesh>
          <group position={[0, 0, 0.115]} rotation={[-1.85, 0, 0]}>
            <mesh material={metal} position={[0, 0.11, 0]}>
              <boxGeometry args={[0.33, 0.22, 0.01]} />
            </mesh>
            <mesh material={screen} position={[0, 0.11, -0.006]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[0.3, 0.19]} />
            </mesh>
            <mesh material={glow} position={[0, 0.11, 0.006]}>
              <circleGeometry args={[0.025, 16]} />
            </mesh>
          </group>
        </group>

        {/* Le DJ */}
        <group position={[0, 0, -0.5]} ref={root}>
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} material={cloth} position={[x, 0.45, 0]}>
              <capsuleGeometry args={[0.085, 0.7, 4, 8]} />
            </mesh>
          ))}
          <group position={[0, 0.88, 0]} ref={torso}>
            <mesh material={cloth} position={[0, 0.34, 0]} scale={[1.15, 1, 0.75]}>
              <capsuleGeometry args={[0.17, 0.4, 4, 12]} />
            </mesh>
            <group position={[0, 0.74, 0]} ref={head}>
              <mesh material={skin} position={[0, 0.04, 0]}>
                <cylinderGeometry args={[0.05, 0.06, 0.1, 10]} />
              </mesh>
              <mesh material={skin} position={[0, 0.17, 0.01]}>
                <sphereGeometry args={[0.12, 16, 12]} />
              </mesh>
              {/* Casquette */}
              <mesh material={phones} position={[0, 0.19, 0.01]}>
                <sphereGeometry args={[0.128, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              </mesh>
              <mesh material={phones} position={[0, 0.195, 0.14]} rotation={[0.2, 0, 0]}>
                <boxGeometry args={[0.18, 0.012, 0.12]} />
              </mesh>
              {/* Casque sur une oreille, comme en cabine */}
              <mesh material={phones} position={[0, 0.2, -0.01]}>
                <torusGeometry args={[0.135, 0.014, 6, 24, Math.PI]} />
              </mesh>
              {[-1, 1].map((side) => (
                <mesh key={side} material={phones} position={[side * 0.135, side < 0 ? 0.15 : 0.19, side < 0 ? -0.01 : -0.06]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.055, 0.055, 0.045, 16]} />
                </mesh>
              ))}
            </group>
            {arm(-1, left)}
            {arm(1, right)}
          </group>
        </group>
      </group>

      {lights ? (
        <group position={[0, TRUSS_Y - 0.3, FRONT_Z + 0.3 - 0.5]}>
          <primitive object={key.light} />
          <primitive object={key.target} position={[0, 2.1 - (TRUSS_Y - 0.3), -0.5 - (FRONT_Z + 0.3 - 0.5)]} />
        </group>
      ) : null}
    </group>
  );
}

// ── Sonorisation au sol ────────────────────────────────────────────────

/** Deux piles de caissons de basses devant la scène ; les membranes poussent sur chaque temps. */
export function SubStacks({ reduced }: { reduced: boolean }) {
  const cabinet = useMemo(() => new THREE.MeshStandardMaterial({ color: "#121016", roughness: 0.85 }), []);
  const cone = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1c1a22", roughness: 0.6, metalness: 0.2 }), []);
  const cones = useRef<(THREE.Mesh | null)[]>([]);
  const energy = useRef(0.35);
  useFrame((frame, delta) => {
    energy.current = approach(energy.current, showEnergy(getActiveCue()), delta, 1.5, reduced);
    const { pulse } = beatAt(frame.clock.elapsedTime);
    const push = reduced ? 0 : pulse * (0.3 + 0.7 * energy.current);
    cones.current.forEach((c) => {
      if (c) c.scale.set(1, 1, 1 + push * 2.2);
    });
  });
  let n = 0;
  return (
    <group>
      {[-8.8, 8.8].map((x) => (
        <group key={x} position={[x, -1.2, 3.7]} rotation={[0, x < 0 ? 0.25 : -0.25, 0]}>
          {[0.33, 0.99].map((y) => (
            <group key={y} position={[0, y, 0]}>
              <mesh material={cabinet}>
                <boxGeometry args={[1.3, 0.64, 0.9]} />
              </mesh>
              {[-0.3, 0.3].map((cx) => {
                const index = n++;
                return (
                  <group key={cx} position={[cx, 0, 0.451]}>
                    <mesh material={cabinet}>
                      <torusGeometry args={[0.24, 0.025, 8, 32]} />
                    </mesh>
                    <mesh material={cone} rotation={[-Math.PI / 2, 0, 0]} ref={(m) => void (cones.current[index] = m)}>
                      <coneGeometry args={[0.22, 0.08, 32, 1, true]} />
                    </mesh>
                  </group>
                );
              })}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

// ── Blinders ───────────────────────────────────────────────────────────

const BLINDER_X = [-6, -2, 2, 6];

/** Blinders sur le pont de face : un coup de lumière chaude toutes les 4 temps pendant le show. */
export function Blinders({ reduced }: { reduced: boolean }) {
  const housing = useMemo(darkMetal, []);
  const lamp = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffb36b", toneMapped: false }), []);
  const energy = useRef(0.35);
  useFrame((frame, delta) => {
    energy.current = approach(energy.current, showEnergy(getActiveCue()), delta, 1.5, reduced);
    const { beat, frac } = beatAt(frame.clock.elapsedTime);
    const e = energy.current;
    const hit = !reduced && e > 0.6 && Math.floor(beat) % 4 === 0 ? Math.exp(-frac * 4) * e : 0;
    lamp.color.set("#ffb36b").multiplyScalar(0.12 + hit * 3);
  });
  return (
    <group>
      {BLINDER_X.map((x) => (
        <group key={x} position={[x, TRUSS_Y - 0.05, FRONT_Z + 0.32]} rotation={[0.45, 0, 0]}>
          <mesh material={housing}>
            <boxGeometry args={[0.56, 0.56, 0.2]} />
          </mesh>
          {[
            [-0.13, -0.13],
            [0.13, -0.13],
            [-0.13, 0.13],
            [0.13, 0.13],
          ].map(([lx, ly]) => (
            <mesh key={`${lx}${ly}`} material={lamp} position={[lx!, ly!, 0.101]}>
              <circleGeometry args={[0.1, 20]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ── Barres de beams au sol ─────────────────────────────────────────────

const UPLIGHT_X = [-6.2, -4.8, -3.4, -2, 2, 3.4, 4.8, 6.2];

/** Huit projecteurs posés derrière la régie : des faisceaux fins qui montent et balaient en éventail. */
export function Uplights({ reduced }: { reduced: boolean }) {
  const housing = useMemo(darkMetal, []);
  const geometry = useMemo(() => coneGeometry(0.035, 0.5, 7.5), []);
  const beams = useMemo(() => UPLIGHT_X.map(() => shaftMaterial(7.5, 1.4)), []);
  const lenses = useMemo(() => UPLIGHT_X.map(() => new THREE.MeshBasicMaterial({ toneMapped: false })), []);
  const pivots = useRef<(THREE.Group | null)[]>([]);
  const energy = useRef(0.35);
  useFrame((frame, delta) => {
    const cue = getActiveCue();
    const light = cueLight(cue);
    energy.current = approach(energy.current, showEnergy(cue), delta, 1.5, reduced);
    const e = energy.current;
    const t = reduced ? 1.5 : frame.clock.elapsedTime;
    const { beat, pulse } = beatAt(t);
    const k = reduced ? 1 : 1 - Math.exp(-delta * 3);
    UPLIGHT_X.forEach((x, i) => {
      const toward = x < 0 ? -1 : 1;
      // Éventail qui s'ouvre et se referme sur 8 temps, en miroir cour/jardin
      const open = 0.5 + 0.5 * Math.sin((beat * Math.PI) / 4 + Math.abs(x) * 0.4);
      const pivot = pivots.current[i];
      if (pivot) pivot.rotation.set(0.12, 0, toward * (0.05 + 0.4 * open));
      const color = beams[i]!.uniforms.uColor!.value as THREE.Color;
      color.lerp(tmpColor.set(light.colors[(i + 3) % 6]!), k);
      const level = (0.2 + 0.8 * e) * (0.8 + 0.2 * (reduced ? 0 : pulse) * e);
      beams[i]!.uniforms.uIntensity!.value = level * 0.7;
      lenses[i]!.color.copy(color).multiplyScalar(1 + level * 2.5);
    });
  });
  return (
    <group>
      {UPLIGHT_X.map((x, i) => (
        <group key={x} position={[x, 0, BACK_Z + 0.35]}>
          <mesh material={housing} position={[0, 0.09, 0]}>
            <boxGeometry args={[0.32, 0.18, 0.32]} />
          </mesh>
          <group position={[0, 0.2, 0]} ref={(g) => void (pivots.current[i] = g)}>
            <mesh material={housing} position={[0, -0.05, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.16, 16]} />
            </mesh>
            <mesh material={lenses[i]} position={[0, 0.031, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.07, 16]} />
            </mesh>
            <mesh geometry={geometry} material={beams[i]} rotation={[Math.PI, 0, 0]} />
          </group>
        </group>
      ))}
    </group>
  );
}

// ── Lasers ─────────────────────────────────────────────────────────────

const LASER_COUNT = 11;

/** Laser sur le pont arrière : un éventail de rayons au-dessus du public qui ondule lentement. */
export function Lasers({ reduced }: { reduced: boolean }) {
  const geometry = useMemo(() => coneGeometry(0.008, 0.045, 26, 6), []);
  const material = useMemo(() => shaftMaterial(26, 1.1), []);
  const housing = useMemo(darkMetal, []);
  const rays = useRef<(THREE.Group | null)[]>([]);
  const energy = useRef(0.35);
  useFrame((frame, delta) => {
    const cue = getActiveCue();
    energy.current = approach(energy.current, showEnergy(cue), delta, 1.2, reduced);
    const e = energy.current;
    const t = reduced ? 2 : frame.clock.elapsedTime;
    const { beat } = beatAt(t);
    const color = material.uniforms.uColor!.value as THREE.Color;
    color.lerp(tmpColor.set(e > 0.6 ? "#39ff88" : GEL.cyan), reduced ? 1 : 1 - Math.exp(-delta * 2));
    material.uniforms.uIntensity!.value = THREE.MathUtils.smoothstep(e, 0.25, 0.5) * 1.4;
    const spread = 0.55 + 0.4 * Math.sin((beat * Math.PI) / 8);
    const dip = 0.1 + 0.07 * Math.sin((beat * Math.PI) / 4);
    rays.current.forEach((ray, i) => {
      if (!ray) return;
      const u = i / (LASER_COUNT - 1) - 0.5;
      ray.rotation.set(-(Math.PI / 2 - dip - 0.05 * Math.sin(t * 1.3 + i)), u * spread * 1.6, 0, "YXZ");
    });
  });
  return (
    <group position={[0, TRUSS_Y - 0.35, BACK_Z + 0.3]}>
      <mesh material={housing}>
        <boxGeometry args={[0.45, 0.22, 0.4]} />
      </mesh>
      {Array.from({ length: LASER_COUNT }, (_, i) => (
        <group key={i} position={[0, -0.02, 0.21]} ref={(g) => void (rays.current[i] = g)}>
          <mesh geometry={geometry} material={material} />
        </group>
      ))}
    </group>
  );
}

// ── Jets de CO2 ────────────────────────────────────────────────────────

const plumeFragment = /* glsl */ `
  uniform float uAlpha;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float edge = sin(vUv.x * 3.14159);
    float rise = smoothstep(0.0, 0.15, vUv.y) * (1.0 - vUv.y);
    float puff = 0.65 + 0.35 * sin(vUv.y * 18.0 - uTime * 9.0 + vUv.x * 6.0);
    float a = edge * edge * rise * puff * uAlpha;
    gl_FragColor = vec4(vec3(0.9, 0.92, 1.0) * a, a);
  }
`;

const JET_X = [-6, -3.6, 3.6, 6];

/** Canons à CO2 au nez de scène : une colonne blanche toutes les 8 mesures pendant le show. */
export function Co2Jets({ reduced }: { reduced: boolean }) {
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.55, 0.06, 1, 20, 8, true);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 } },
        vertexShader: uvVertex,
        fragmentShader: plumeFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const housing = useMemo(darkMetal, []);
  const plumes = useRef<(THREE.Mesh | null)[]>([]);
  const energy = useRef(0.35);
  useFrame((frame, delta) => {
    energy.current = approach(energy.current, showEnergy(getActiveCue()), delta, 1.5, reduced);
    const t = frame.clock.elapsedTime;
    const { beat } = beatAt(t);
    // Tir sur les 2 premiers temps de chaque cycle de 32, puis la colonne se dissipe
    const cycle = beat % 32;
    const on = !reduced && energy.current > 0.7 && cycle < 3;
    const growth = on ? THREE.MathUtils.smoothstep(cycle, 0, 0.6) : 0;
    const fade = on ? (cycle < 1.8 ? 1 : Math.max(0, 1 - (cycle - 1.8) / 1.2)) : 0;
    material.uniforms.uAlpha!.value = fade * 0.55;
    material.uniforms.uTime!.value = t;
    plumes.current.forEach((p) => {
      if (!p) return;
      p.visible = fade > 0.01;
      p.scale.set(0.6 + 0.4 * growth, Math.max(0.01, 4.2 * growth), 0.6 + 0.4 * growth);
    });
  });
  return (
    <group>
      {JET_X.map((x, i) => (
        <group key={x} position={[x, 0, 2.55]}>
          <mesh material={housing} position={[0, 0.12, 0]}>
            <boxGeometry args={[0.26, 0.24, 0.26]} />
          </mesh>
          <mesh geometry={geometry} material={material} position={[0, 0.25, 0]} ref={(m) => void (plumes.current[i] = m)} visible={false} />
        </group>
      ))}
    </group>
  );
}

// ── Écrans latéraux ────────────────────────────────────────────────────

/** Deux écrans suspendus de part et d'autre de la scène, qui reprennent le contenu du mur LED. */
export function SideScreens({ material }: { material: THREE.Material }) {
  const frame = useMemo(darkMetal, []);
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 10.7, 4.6, 0.9]} rotation={[0, -side * 0.38, 0]}>
          <mesh material={material}>
            <planeGeometry args={[3.6, 2.03]} />
          </mesh>
          <mesh material={frame} position={[0, 0, -0.06]}>
            <boxGeometry args={[3.75, 2.18, 0.1]} />
          </mesh>
          {/* Élingues jusqu'au plafond */}
          {[-1.6, 1.6].map((x) => (
            <mesh key={x} material={frame} position={[x, 2.6, -0.05]}>
              <cylinderGeometry args={[0.008, 0.008, 3.2, 4]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
