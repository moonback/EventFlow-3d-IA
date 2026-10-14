import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { CommandSearch } from "@/components/layout/command-search";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { OrgSwitcher, UserMenu } from "@/components/layout/user-menu";
import { roleLabels } from "@/lib/labels";
import { requirePageAuth } from "@/server/auth/session";
import { listMyOrganizations } from "@/server/services/auth-service";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const ctx = await requirePageAuth();
  const [orgs, store] = await Promise.all([listMyOrganizations(ctx.userId), cookies()]);
  const permissions = [...ctx.permissions];
  const theme = store.get("ef_theme")?.value === "light" ? "light" : "dark";
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Aller au contenu
      </a>
      <Sidebar permissions={permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl sm:px-6">
          <MobileNav permissions={permissions} />
          <div className="flex min-w-0 flex-1 items-center">
            <CommandSearch permissions={permissions} />
          </div>
          <OrgSwitcher current={{ id: ctx.organizationId, name: ctx.organization.name }} organizations={orgs.map((o) => ({ id: o.organization.id, name: o.organization.name, role: o.role }))} />
          <NotificationsBell />
          <UserMenu name={ctx.user.name} email={ctx.user.email} roleLabel={roleLabels[ctx.role]} initialTheme={theme} />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
