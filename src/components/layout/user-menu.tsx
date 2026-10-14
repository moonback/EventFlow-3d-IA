"use client";
import { CalendarDays, Check, ChevronDown, LogOut, Moon, Settings, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Avatar } from "../ui/misc";

export function OrgSwitcher({ current, organizations }: { current: { id: string; name: string }; organizations: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  const switchTo = async (id: string) => {
    try {
      await apiFetch("/api/auth/switch-organization", { method: "POST", body: { organizationId: id } });
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  if (organizations.length <= 1) {
    return (
      <div className="hidden h-10 items-center gap-2.5 rounded-full border border-border bg-card/70 px-4 text-sm md:flex">
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
        <span className="max-w-44 truncate">{current.name}</span>
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="hidden h-10 items-center gap-2.5 rounded-full border border-border bg-card/70 px-4 text-sm transition-colors hover:bg-card md:inline-flex">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          <span className="max-w-44 truncate">{current.name}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Organisation</DropdownMenuLabel>
        {organizations.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => o.id !== current.id && void switchTo(o.id)}>
            {o.id === current.id ? <Check /> : <span className="size-4" />}
            <span className="truncate">{o.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ name, email, roleLabel, initialTheme }: { name: string; email: string; roleLabel: string; initialTheme: "dark" | "light" }) {
  const router = useRouter();
  const [theme, setTheme] = useState(initialTheme);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `ef_theme=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-3 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-white/5" aria-label="Menu du compte">
          <Avatar name={name} className="size-9" />
          <span className="hidden min-w-0 flex-col text-left leading-tight md:flex">
            <span className="max-w-36 truncate text-sm font-medium">{name}</span>
            <span className="max-w-36 truncate text-xs text-muted-foreground">{roleLabel}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted-foreground md:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
          <p className="mt-1 text-xs text-primary">{roleLabel}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <UserRound /> Mon profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Paramètres
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggleTheme(); }}>
          {theme === "dark" ? <Sun /> : <Moon />} Thème {theme === "dark" ? "clair" : "sombre"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void logout()}>
          <LogOut /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
