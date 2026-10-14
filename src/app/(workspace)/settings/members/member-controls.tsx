"use client";
import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Option = { value: string; label: string };

export function MemberRoleSelect({ membershipId, role, isActive, roles }: { membershipId: string; role: string; isActive: boolean; roles: Option[] }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [busy, setBusy] = useState(false);
  return (
    <NativeSelect
      aria-label="Rôle"
      className="h-8 w-52"
      value={value}
      disabled={busy}
      onChange={async (e) => {
        const next = e.target.value;
        if (!confirm(`Changer le rôle en « ${roles.find((r) => r.value === next)?.label} » ?`)) return;
        setBusy(true);
        try {
          await apiFetch(`/api/settings/members/${membershipId}`, { method: "PATCH", body: { role: next, isActive } });
          setValue(next);
          toast.success("Rôle mis à jour (journalisé)");
          router.refresh();
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {roles.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </NativeSelect>
  );
}

const STATUS: Record<string, string> = {
  sent: "Invitation envoyée par e-mail.",
  stored: "Invitation déposée dans la boîte de développement (storage/mail-outbox).",
};

export function InviteDialog({ roles }: { roles: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("READ_ONLY");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const invite = async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ mailStatus: string; link: string | null }>("/api/settings/invitations", { method: "POST", body: { email, role } });
      if (r.link) {
        setLink(r.link);
        toast.warning("L'e-mail n'a pas pu être remis : transmettez le lien manuellement");
      } else {
        toast.success(STATUS[r.mailStatus] ?? "Invitation créée");
        setOpen(false);
      }
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setLink(null); setEmail(""); } }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus /> Inviter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un membre</DialogTitle>
          <DialogDescription>Lien d&apos;invitation à usage unique, valable 7 jours.</DialogDescription>
        </DialogHeader>
        {link ? (
          <Alert tone="warning" title="Lien à transmettre de façon sécurisée">
            <code className="block break-all text-xs">{link}</code>
          </Alert>
        ) : (
          <div className="grid gap-3">
            <Field label="E-mail" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Rôle" required>
              <NativeSelect value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        )}
        <DialogFooter>{link ? <Button onClick={() => setOpen(false)}>Fermer</Button> : <Button onClick={invite} loading={loading} disabled={!email}>Envoyer l&apos;invitation</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
