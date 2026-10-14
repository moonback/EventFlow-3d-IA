import { PageHeader } from "@/components/feedback/page-header";
import { requirePageAuth } from "@/server/auth/session";
import { getNotificationPreferences } from "@/server/services/notification-service";
import { PreferencesForm } from "./preferences-form";

export const metadata = { title: "Préférences de notification" };

export default async function NotificationPrefsPage() {
  const ctx = await requirePageAuth();
  const prefs = await getNotificationPreferences(ctx);
  return (
    <>
      <PageHeader title="Préférences de notification" description="Les e-mails ne sont envoyés que si un fournisseur d'e-mail est configuré ; leur statut réel est enregistré." breadcrumbs={[{ label: "Paramètres", href: "/settings" }, { label: "Notifications" }]} />
      <PreferencesForm initial={prefs} />
    </>
  );
}
