"use client";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/misc";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };
interface CellData {
  role: string;
  permission: string;
  default: boolean;
  granted: boolean;
  overridden: boolean;
}

export function PermissionMatrix({ roles, permissions, cells, canEditAdmin }: { roles: Option[]; permissions: Option[]; cells: CellData[]; canEditAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const find = (r: string, p: string) => cells.find((c) => c.role === r && c.permission === p)!;
  const set = async (role: string, permission: string, granted: boolean | null) => {
    setBusy(`${role}:${permission}`);
    try {
      await apiFetch("/api/settings/permissions", { method: "PUT", body: { role, permission, granted } });
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 bg-card p-2 text-left font-medium">Permission</th>
            {roles.map((r) => (
              <th key={r.value} className="p-2 text-center font-medium">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permissions.map((p) => (
            <tr key={p.value} className="border-b border-border last:border-0 hover:bg-muted/30">
              <th scope="row" className="sticky left-0 bg-card p-2 text-left font-normal">
                {p.label}
                <span className="block font-mono text-[10px] text-muted-foreground">{p.value}</span>
              </th>
              {roles.map((r) => {
                const c = find(r.value, p.value);
                const disabled = busy !== null || (r.value === "ADMIN" && !canEditAdmin);
                return (
                  <td key={r.value} className={cn("p-2 text-center", c.overridden && "bg-warning/10")}>
                    <span className="inline-flex items-center gap-1">
                      <Checkbox checked={c.granted} disabled={disabled} onCheckedChange={(v) => void set(r.value, p.value, v === true)} aria-label={`${p.label} — ${r.label}`} />
                      {c.overridden ? (
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void set(r.value, p.value, null)} aria-label="Revenir à la valeur par défaut" title="Revenir à la valeur par défaut" disabled={disabled}>
                          <RotateCcw className="size-3" />
                        </button>
                      ) : null}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
