"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { taskStatusLabels } from "@/lib/labels";

export function TaskStatusSelect({ taskId, status, disabled }: { taskId: string; status: keyof typeof taskStatusLabels; disabled?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [busy, setBusy] = useState(false);
  return (
    <NativeSelect
      aria-label="Statut de la tâche"
      className="h-8 w-36 text-xs"
      value={value}
      disabled={disabled || busy}
      onChange={async (e) => {
        const next = e.target.value as typeof status;
        setBusy(true);
        try {
          await apiFetch(`/api/tasks/${taskId}`, { method: "PATCH", body: { status: next } });
          setValue(next);
          router.refresh();
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {Object.entries(taskStatusLabels).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </NativeSelect>
  );
}
