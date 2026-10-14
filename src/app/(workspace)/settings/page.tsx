import { Bell, Building2, History, KeyRound, ListChecks, ShieldCheck, Tags, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/feedback/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { roleLabels } from "@/lib/labels";
import type { Permission } from "@/lib/permissions";
import { requirePageAuth } from "@/server/auth/session";

export const metadata = { title: "Paramètres" };

const SECTIONS: { href: string; title: string; description: string; icon: typeof Bell; permission?: Permission }[] = [
  { href: "/settings/profile", title: "Mon profil", description: "Mot de passe et sécurité du compte", icon: KeyRound },
  { href: "/settings/notifications", title: "Notifications", description: "Alertes internes et e-mails", icon: Bell },
  { href: "/settings/organization", title: "Organisation", description: "Coordonnées, TVA, délais logistiques, mentions des documents", icon: Building2, permission: "settings:manage" },
  { href: "/settings/event-types", title: "Types d'événement", description: "Mariage, séminaire, salon…", icon: Tags, permission: "settings:manage" },
  { href: "/settings/members", title: "Membres et invitations", description: "Comptes, rôles et accès", icon: Users, permission: "members:manage" },
  { href: "/settings/permissions", title: "Matrice des permissions", description: "Droits par rôle, configurables pour l'organisation", icon: ShieldCheck, permission: "members:manage" },
  { href: "/settings/audit", title: "Journal d'audit", description: "Opérations sensibles tracées", icon: History, permission: "audit:read" },
];

export default async function SettingsPage() {
  const ctx = await requirePageAuth();
  return (
    <>
      <PageHeader title="Paramètres" description={`${ctx.organization.name} · votre rôle : ${roleLabels[ctx.role]}`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.filter((s) => !s.permission || ctx.permissions.has(s.permission)).map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="flex items-start gap-3 pt-5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{s.title}</span>
                  <span className="text-sm text-muted-foreground">{s.description}</span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
        <Card className="h-full">
          <CardContent className="flex items-start gap-3 pt-5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ListChecks className="size-4" aria-hidden />
            </span>
            <span className="text-sm text-muted-foreground">Raccourcis : <kbd>Ctrl K</kbd> ou <kbd>/</kbd> recherche · <kbd>g</kbd> puis <kbd>d</kbd>/<kbd>w</kbd>/<kbd>e</kbd>/<kbd>i</kbd>/<kbd>c</kbd>/<kbd>q</kbd>/<kbd>f</kbd>/<kbd>r</kbd>/<kbd>l</kbd>/<kbd>v</kbd>/<kbd>t</kbd>/<kbd>p</kbd> navigation.</span>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
