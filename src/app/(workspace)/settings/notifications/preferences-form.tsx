"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorMessage } from "@/lib/api-client";

interface Pref {
  type: string;
  label: string;
  inApp: boolean;
  email: boolean;
}

export function PreferencesForm({ initial }: { initial: Pref[] }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/notifications/preferences", { method: "PUT", body: { preferences: prefs.map(({ type, inApp, email }) => ({ type, inApp, email })) } });
      toast.success("Préférences enregistrées");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alerte</TableHead>
              <TableHead className="text-center">Dans l&apos;application</TableHead>
              <TableHead className="text-center">Par e-mail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prefs.map((p, i) => (
              <TableRow key={p.type}>
                <TableCell>{p.label}</TableCell>
                <TableCell className="text-center">
                  <Switch checked={p.inApp} onCheckedChange={(c) => setPrefs(prefs.map((x, j) => (j === i ? { ...x, inApp: c } : x)))} aria-label={`${p.label} dans l'application`} />
                </TableCell>
                <TableCell className="text-center">
                  <Switch checked={p.email} onCheckedChange={(c) => setPrefs(prefs.map((x, j) => (j === i ? { ...x, email: c } : x)))} aria-label={`${p.label} par e-mail`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
