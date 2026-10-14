import { PageHeader } from "@/components/feedback/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabels } from "@/lib/labels";
import { requirePageAuth } from "@/server/auth/session";
import { ChangePasswordForm } from "./password-form";

export const metadata = { title: "Mon profil" };

export default async function ProfilePage() {
  const ctx = await requirePageAuth();
  return (
    <>
      <PageHeader title="Mon profil" breadcrumbs={[{ label: "Paramètres", href: "/settings" }, { label: "Profil" }]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Compte</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p>{ctx.user.name}</p>
            <p className="text-muted-foreground">{ctx.user.email}</p>
            <p>
              Rôle dans {ctx.organization.name} : <strong>{roleLabels[ctx.role]}</strong>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Changer de mot de passe</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
