import { PageHeader } from "@/components/feedback/page-header";
import { Alert } from "@/components/feedback/alert";
import { roleLabels } from "@/lib/labels";
import { permissionLabels } from "@/lib/permissions";
import { pageContext } from "@/server/auth/page";
import { getPermissionMatrix } from "@/server/services/settings-service";
import { PermissionMatrix } from "./permission-matrix";

export const metadata = { title: "Permissions" };

export default async function PermissionsPage() {
  const ctx = await pageContext("members:manage");
  const m = await getPermissionMatrix(ctx);
  return (
    <>
      <PageHeader title="Matrice des permissions" description="Droits par défaut, ajustables pour votre organisation. Le rôle Propriétaire dispose toujours de tous les droits." breadcrumbs={[{ label: "Paramètres", href: "/settings" }, { label: "Permissions" }]} />
      <Alert tone="info" className="mb-4">
        Les contrôles sont appliqués côté serveur à chaque requête : masquer un bouton n&apos;est jamais une mesure de sécurité. Les cellules modifiées par rapport aux valeurs par défaut sont signalées ; chaque changement est journalisé.
      </Alert>
      <PermissionMatrix roles={m.roles.map((r) => ({ value: r, label: roleLabels[r] }))} permissions={m.permissions.map((p) => ({ value: p, label: permissionLabels[p] }))} cells={m.cells} canEditAdmin={ctx.role === "OWNER"} />
    </>
  );
}
