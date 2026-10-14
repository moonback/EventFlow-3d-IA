import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: { icon: Info, cls: "border-info/30 bg-info/10 text-info" },
  success: { icon: CheckCircle2, cls: "border-success/30 bg-success/10 text-success" },
  warning: { icon: AlertTriangle, cls: "border-warning/30 bg-warning/10 text-warning" },
  danger: { icon: XCircle, cls: "border-destructive/30 bg-destructive/10 text-destructive" },
};

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof tones; title?: string; children?: ReactNode; className?: string }) {
  const { icon: Icon, cls } = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-foreground">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
