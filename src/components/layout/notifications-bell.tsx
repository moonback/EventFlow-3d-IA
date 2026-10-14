"use client";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/misc";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell() {
  const [data, setData] = useState<{ unread: number; items: NotificationItem[] } | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/notifications"));
    } catch {
      /* silencieux : la cloche n'est pas bloquante */
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const markAll = async () => {
    await apiFetch("/api/notifications/read", { method: "POST", body: { ids: "all" } });
    await load();
  };

  return (
    <Popover onOpenChange={(o) => o && void load()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${data?.unread ? ` (${data.unread} non lues)` : ""}`} className="relative">
          <Bell />
          {data?.unread ? <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">{data.unread > 9 ? "9+" : data.unread}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <div className="flex items-center gap-1">
            {data?.unread ? (
              <Button variant="ghost" size="sm" onClick={markAll}>
                <CheckCheck /> Tout lire
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" asChild>
              <Link href="/notifications">Tout voir</Link>
            </Button>
          </div>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {!data?.items.length ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune notification</li> : null}
          {data?.items.slice(0, 12).map((n) => (
            <li key={n.id} className={cn("border-b border-border last:border-0", !n.readAt && "bg-primary/5")}>
              <Link
                href={n.link ?? "/notifications"}
                className="block px-4 py-3 hover:bg-accent"
                onClick={() => void apiFetch("/api/notifications/read", { method: "POST", body: { ids: [n.id] } }).then(load)}
              >
                <p className="text-sm font-medium">{n.title}</p>
                {n.body ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p> : null}
                <p className="mt-1 text-[11px] text-muted-foreground">{new Date(n.createdAt).toLocaleString("fr-FR")}</p>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
