import { Alert } from "@/components/feedback/alert";
import { roleLabels } from "@/lib/labels";
import { getInvitationByToken } from "@/server/services/auth-service";
import { AcceptInvitationForm } from "./accept-form";

export const metadata = { title: "Invitation" };

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const invitation = token ? await getInvitationByToken(token) : null;
  if (!token || !invitation) return <Alert tone="danger" title="Invitation invalide">Ce lien d&apos;invitation est invalide, expiré ou déjà utilisé.</Alert>;
  return <AcceptInvitationForm token={token} email={invitation.email} organization={invitation.organization.name} role={roleLabels[invitation.role]} />;
}
