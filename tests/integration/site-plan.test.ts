import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { BusinessRuleError, ForbiddenError } from "@/lib/errors";
import { defaultSitePlan } from "@/features/site-plan/default-plan";
import type { SitePlan } from "@/features/site-plan/schema";
import type { AuthContext } from "@/server/auth/context";
import { getScene, listLayoutVersions, restoreLayoutVersion } from "@/server/services/scene-service";
import { resetSitePlan, saveSitePlan } from "@/server/services/site-plan-service";
import { createOrg, createUserInOrg } from "../helpers/factories";

let ctxA: AuthContext;
let ctxB: AuthContext;
let readOnlyA: AuthContext;

const withPillar = (plan: SitePlan, id = "pillar-1"): SitePlan => ({ ...plan, props: [...plan.props, { id, type: "pillar", position: [5, 5], elevation: 0, rotationY: 0, size: [0.4, 3.5, 0.4] }] });

beforeAll(async () => {
  const orgA = await createOrg("Plan A");
  const orgB = await createOrg("Plan B");
  ctxA = await createUserInOrg(orgA.id, "ADMIN");
  ctxB = await createUserInOrg(orgB.id, "ADMIN");
  readOnlyA = await createUserInOrg(orgA.id, "READ_ONLY");
});

describe("plan du site", () => {
  it("livre le plan par défaut tant que l'organisation n'a rien enregistré", async () => {
    const scene = await getScene(ctxA);
    expect(scene.sitePlanRevision).toBe(0);
    expect(scene.sitePlan).toEqual(defaultSitePlan());
  });

  it("enregistre le plan, crée une version et isole les organisations", async () => {
    const saved = await saveSitePlan(ctxA, { revision: 0, plan: withPillar(defaultSitePlan()) });
    expect(saved.revision).toBe(1);
    const scene = await getScene(ctxA);
    expect(scene.sitePlanRevision).toBe(1);
    expect(scene.sitePlan.props.some((p) => p.id === "pillar-1")).toBe(true);
    // L'autre organisation garde le plan par défaut
    expect((await getScene(ctxB)).sitePlan.props.some((p) => p.id === "pillar-1")).toBe(false);
    const versions = await listLayoutVersions(ctxA);
    expect(versions.map((v) => v.label)).toContain("État initial");
  });

  it("refuse d'écraser un plan modifié entre-temps", async () => {
    const plan = (await getScene(ctxA)).sitePlan;
    await saveSitePlan(ctxA, { revision: 1, plan: withPillar(plan, "pillar-2") });
    await expect(saveSitePlan(ctxA, { revision: 1, plan })).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(saveSitePlan(ctxA, { revision: 0, plan })).rejects.toBeInstanceOf(BusinessRuleError);
    expect((await getScene(ctxA)).sitePlanRevision).toBe(2);
  });

  it("réserve la modification aux utilisateurs autorisés à agencer", async () => {
    await expect(saveSitePlan(readOnlyA, { revision: 2, plan: defaultSitePlan() })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resetSitePlan(readOnlyA)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuse un plan invalide", async () => {
    const plan = defaultSitePlan();
    await expect(saveSitePlan(ctxA, { revision: 2, plan: { ...plan, openings: [{ ...plan.openings[0]!, wallId: "inconnu" }] } })).rejects.toThrow();
  });

  it("restaure le plan d'une version et revient au plan par défaut", async () => {
    // Versions de la plus récente à la plus ancienne : la plus ancienne « Plan du site » n'a qu'un poteau
    const first = (await listLayoutVersions(ctxA)).filter((v) => v.label.startsWith("Plan du site")).at(-1)!;
    await resetSitePlan(ctxA);
    expect(await db.sitePlan.count({ where: { organizationId: ctxA.organizationId } })).toBe(0);
    expect((await getScene(ctxA)).sitePlan).toEqual(defaultSitePlan());
    await restoreLayoutVersion(ctxA, first.id);
    const props = (await getScene(ctxA)).sitePlan.props.map((p) => p.id);
    expect(props).toContain("pillar-1");
    expect(props).not.toContain("pillar-2");
  });
});
