import { pageContext } from "@/server/auth/page";
import { WallView } from "@/three/ui/wall-view";

export const metadata = { title: "Mur d'écrans" };

/** Mode « mur d'écrans » : monde 3D en plein écran pour une TV de l'agence (rotation automatique entre les zones). */
export default async function WallPage() {
  const ctx = await pageContext("dashboard:read");
  return <WallView organizationName={ctx.organization.name} timezone={ctx.organization.timezone} />;
}
