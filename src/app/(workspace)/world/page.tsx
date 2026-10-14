import { env } from "@/lib/env";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { locationOptions } from "@/server/services/inventory-service";
import { WorldShell } from "@/three/ui/world-shell";

export const metadata = { title: "Monde 3D" };

/** Monde 3D de pilotage : bureau, entrepôt, logistique, événements, centre de contrôle. */
export default async function WorldPage() {
  const ctx = await pageContext("dashboard:read");
  const locations = can(ctx, "stock:write") ? await locationOptions(ctx, ["WAREHOUSE", "ZONE", "RACK", "BIN"]) : [];
  return <WorldShell canEditLayout={can(ctx, "scene:edit")} canCount={can(ctx, "stock:write")} canDuplicate={can(ctx, "inventory:write") && can(ctx, "scene:edit")} assistant={env().ASSISTANT_ENABLED === "true" && can(ctx, "assistant:use")} locations={locations} />;
}
