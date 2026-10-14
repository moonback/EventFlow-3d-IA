import { PageHeader } from "@/components/feedback/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/feedback/action-button";
import { formatDate, formatDateTime } from "@/lib/dates";
import { roleLabels } from "@/lib/labels";
import { assignableRoles } from "@/lib/permissions";
import { pageContext } from "@/server/auth/page";
import { listMembers } from "@/server/services/auth-service";
import { InviteDialog, MemberRoleSelect } from "./member-controls";

export const metadata = { title: "Membres" };

export default async function MembersPage() {
  const ctx = await pageContext("members:manage");
  const { members, invitations } = await listMembers(ctx);
  const roles = assignableRoles(ctx.role).map((r) => ({ value: r, label: roleLabels[r] }));
  const tz = ctx.organization.timezone;
  return (
    <>
      <PageHeader title="Membres et invitations" description="Les changements de rôle sont journalisés et prennent effet à la requête suivante." breadcrumbs={[{ label: "Paramètres", href: "/settings" }, { label: "Membres" }]} actions={<InviteDialog roles={roles} />} />
      <Card className="mb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Dernière connexion</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Accès</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const self = m.user.id === ctx.userId;
              const locked = self || (m.role === "OWNER" && ctx.role !== "OWNER");
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.user.name} {self ? <Badge>Vous</Badge> : null}
                  </TableCell>
                  <TableCell>{m.user.email}</TableCell>
                  <TableCell>{m.user.lastLoginAt ? formatDateTime(m.user.lastLoginAt, tz) : "—"}</TableCell>
                  <TableCell>{locked ? roleLabels[m.role] : <MemberRoleSelect membershipId={m.id} role={m.role} isActive={m.isActive} roles={roles} />}</TableCell>
                  <TableCell>
                    {locked ? (
                      <Badge tone={m.isActive ? "success" : "neutral"}>{m.isActive ? "Actif" : "Désactivé"}</Badge>
                    ) : (
                      <ActionButton url={`/api/settings/members/${m.id}`} method="PATCH" body={{ role: m.role, isActive: !m.isActive }} size="sm" variant={m.isActive ? "outline" : "default"} successMessage={m.isActive ? "Accès désactivé" : "Accès réactivé"} confirm={m.isActive ? { title: "Désactiver l'accès ?", description: `${m.user.name} sera déconnecté(e) immédiatement.`, destructive: true } : undefined}>
                        {m.isActive ? "Désactiver" : "Réactiver"}
                      </ActionButton>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invitations en attente</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune invitation en attente.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {invitations.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2">
                  <span>
                    {i.email} · {roleLabels[i.role]} <span className="text-xs text-muted-foreground">· expire le {formatDate(i.expiresAt, tz)}</span>
                  </span>
                  <ActionButton url={`/api/settings/invitations/${i.id}`} method="DELETE" size="sm" variant="ghost" successMessage="Invitation révoquée" confirm={{ title: "Révoquer l'invitation ?", description: i.email, destructive: true }}>
                    Révoquer
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
