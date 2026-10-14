"use client";
import { TIMELINE, timelineX } from "@/features/scene/layout";
import { BOX, standard } from "../materials/palette";
import { Label } from "./label";

const noRaycast = () => null;
const AXIS = standard("#475569", { emissive: "#64748b", emissiveIntensity: 0.2 });
const TICK = standard("#94a3b8", { emissive: "#94a3b8", emissiveIntensity: 0.15 });
const TODAY = standard("#22d3ee", { emissive: "#22d3ee", emissiveIntensity: 1.2, glow: true });
const PAST = standard("#0f172a", { transparent: true, opacity: 0.45 });
const DAY_MS = 86_400_000;

/**
 * Frise au sol de la zone Événements : axe J-14 → J+60, graduations quotidiennes, une étiquette par lundi,
 * zone du passé assombrie et curseur lumineux « Aujourd'hui ».
 */
export function Timeline({ now }: { now: string }) {
  const nowDate = new Date(now);
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const days = Array.from({ length: TIMELINE.pastDays + TIMELINE.futureDays + 1 }, (_, i) => new Date(today.getTime() + (i - TIMELINE.pastDays) * DAY_MS));
  const xNow = timelineX(nowDate, nowDate);
  const z = TIMELINE.axisZ;
  const depth = TIMELINE.lanes[TIMELINE.lanes.length - 1]! - z + 3;
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  return (
    <group>
      <mesh geometry={BOX} material={AXIS} position={[(TIMELINE.x0 + TIMELINE.x1) / 2, 0.03, z]} scale={[TIMELINE.x1 - TIMELINE.x0, 0.04, 0.18]} raycast={noRaycast} />
      {/* Passé assombri */}
      <mesh geometry={BOX} material={PAST} position={[(TIMELINE.x0 + xNow) / 2, 0.02, z + depth / 2]} scale={[xNow - TIMELINE.x0, 0.02, depth]} raycast={noRaycast} />
      {days.map((d) => {
        const x = timelineX(d, nowDate);
        const monday = d.getDay() === 1;
        return (
          <group key={d.getTime()}>
            <mesh geometry={BOX} material={TICK} position={[x, 0.04, z]} scale={[0.06, 0.05, monday ? 1.1 : 0.45]} raycast={noRaycast} />
            {monday ? <Label text={fmt.format(d)} position={[x, 0.6, z - 1.2]} height={0.5} dim maxDistance={70} /> : null}
          </group>
        );
      })}
      {/* Curseur « aujourd'hui » */}
      <mesh geometry={BOX} material={TODAY} position={[xNow, 0.05, z + depth / 2 - 0.6]} scale={[0.12, 0.06, depth + 1.2]} raycast={noRaycast} />
      <mesh geometry={BOX} material={TODAY} position={[xNow, 1.2, z - 0.6]} scale={[0.08, 2.4, 0.08]} raycast={noRaycast} />
      <Label text="Aujourd'hui" position={[xNow, 2.9, z - 0.6]} height={0.6} accent="#22d3ee" maxDistance={140} />
    </group>
  );
}
