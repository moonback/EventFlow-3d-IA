import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, hint, icon: Icon, tone = "neutral", href }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent"; href?: string }) {
  const toneClass = {
    neutral: "text-muted-foreground bg-muted",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    danger: "text-destructive bg-destructive/10",
    info: "text-info bg-info/10",
    accent: "text-primary bg-primary/10",
  }[tone];
  const content = (
    <div className={cn("flex h-full items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors", href && "hover:border-primary/40")}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1.5 truncate text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {Icon ? (
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-4" aria-hidden />
        </div>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl">
      {content}
    </Link>
  ) : (
    content
  );
}
