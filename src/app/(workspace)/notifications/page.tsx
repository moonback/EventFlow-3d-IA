import { Bell } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { notificationTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requirePageAuth } from "@/server/auth/session";
import { listNotifications } from "@/server/services/notification-service";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requirePageAuth();
  const data = await listNotifications(ctx, { take: 200 });
  return (
    <>
      <PageHeader
        title="Notifications"
        description={`${data.unread} non lue(s) · préférences dans Paramètres › Notifications`}
        actions={
          data.unread ? (
            <ActionButton url="/api/notifications/read" body={{ ids: "all" }} size="sm" variant="outline" successMessage="Notifications marquées comme lues">
              Tout marquer comme lu
            </ActionButton>
          ) : null
        }
      />
      {data.items.length === 0 ? (
        <EmptyState icon={Bell} title="Aucune notification" />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {data.items.map((n) => (
              <li key={n.id} className={cn("flex items-start justify-between gap-3 px-4 py-3", !n.readAt && "bg-primary/5")}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</p>
                  {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt, ctx.organization.timezone)}</p>
                </div>
                <Badge>{notificationTypeLabels[n.type]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
