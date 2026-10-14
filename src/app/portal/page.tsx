import { Alert } from "@/components/feedback/alert";
import { PortalView } from "@/features/staff-portal/components/portal-view";
import { isAppError } from "@/lib/errors";
import { getPortalOverview } from "@/server/services/staff-portal-service";
import { resolvePortalToken } from "@/server/services/staff-portal-token-service";

export const metadata = { title: "Mes missions", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let overview;
  try {
    overview = await getPortalOverview(await resolvePortalToken(token ?? ""));
  } catch (e) {
    if (!isAppError(e)) throw e;
    return (
      <Alert tone="danger" title="Lien invalide">
        Ce lien est invalide, expiré ou a été révoqué. Demandez un nouveau lien à votre contact.
      </Alert>
    );
  }
  return <PortalView token={token!} initial={overview} />;
}
