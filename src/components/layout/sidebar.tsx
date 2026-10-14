"use client";
import { Boxes, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "./nav";

function NavLinks({ permissions, onNavigate }: { permissions: string[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = NAV_SECTIONS.map((section) => ({ ...section, items: section.items.filter((i) => permissions.includes(i.permission)) })).filter((s) => s.items.length > 0);
  return (
    <nav aria-label="Navigation principale" className="flex flex-col">
      {sections.map((section, index) => (
        <div key={section.title} className={cn(index > 0 && "mt-3 border-t border-sidebar-border/70 pt-3")}>
          <p className="sr-only">{section.title}</p>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-white/5 hover:text-foreground",
                      active && "bg-gradient-to-r from-blue-600/90 to-indigo-600/70 font-medium text-white shadow-lg shadow-blue-900/30 hover:bg-transparent hover:text-white",
                    )}
                  >
                    <item.icon className={cn("size-[18px] shrink-0 text-sidebar-foreground/70 group-hover:text-foreground", active && "text-white group-hover:text-white")} aria-hidden />
                    <span className="truncate">{item.label}</span>
                    {item.shortcut ? <kbd className={cn("ml-auto hidden text-[10px] text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 xl:inline", active && "text-white/60")}>g {item.shortcut}</kbd> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3 px-3" aria-label="EventFlow — accueil">
      <span className="relative flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-900/40">
        <Boxes className="size-5" aria-hidden />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-xl font-semibold tracking-tight">
          Event<span className="text-blue-400">Flow</span>
        </span>
        <span className="text-[11px] text-muted-foreground">Agence événementielle</span>
      </span>
    </Link>
  );
}

/** Encart promotionnel en bas de la barre latérale (scène stylisée en CSS, sans image externe). */
function ProjectCard({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="mx-3 overflow-hidden rounded-2xl border border-sidebar-border bg-card">
      <div
        aria-hidden
        className="relative h-24"
        style={{
          background:
            "radial-gradient(ellipse 35% 80% at 30% 0%, rgb(96 165 250 / 0.55), transparent 70%), radial-gradient(ellipse 30% 90% at 70% 0%, rgb(168 85 247 / 0.6), transparent 70%), radial-gradient(ellipse 50% 40% at 50% 100%, rgb(236 72 153 / 0.35), transparent 70%), linear-gradient(180deg, #0b1020, #1a1240)",
        }}
      >
        <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute inset-x-6 bottom-2 flex items-end justify-between">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="w-1.5 rounded-t-full bg-black/80" style={{ height: `${8 + ((i * 7) % 11)}px` }} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <p className="text-sm leading-snug font-semibold">
          Votre événement,
          <br />
          notre métier.
        </p>
        {canCreate ? (
          <Link href="/events/new" className="flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-medium text-white shadow-lg shadow-indigo-900/40 transition-opacity hover:opacity-90">
            Nouveau projet
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function Sidebar({ permissions }: { permissions: string[] }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-sidebar-border bg-sidebar py-5 scrollbar-thin lg:flex">
      <Brand />
      <div className="px-3">
        <NavLinks permissions={permissions} />
      </div>
      <div className="mt-auto">
        <ProjectCard canCreate={permissions.includes("events:write")} />
      </div>
    </aside>
  );
}

export function MobileNav({ permissions }: { permissions: string[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button type="button" className="rounded-md p-2 hover:bg-accent lg:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu" aria-expanded={open}>
        <Menu className="size-5" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 overflow-y-auto bg-sidebar py-4 shadow-2xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 hover:bg-accent" aria-label="Fermer le menu">
                <X className="size-5" />
              </button>
            </div>
            <div className="px-2">
              <NavLinks permissions={permissions} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
