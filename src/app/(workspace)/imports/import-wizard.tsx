"use client";
import { CheckCircle2, Download, FileUp, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorMessage } from "@/lib/api-client";

interface Preview {
  jobId: string;
  rowCount: number;
  toCreate: number;
  toUpdate: number;
  errorCount: number;
  rows: { line: number; action: "create" | "update" | "error"; key: string; errors: string[] }[];
}

export function ImportWizard({ canProducts, canCustomers }: { canProducts: boolean; canCustomers: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(canProducts ? "products" : "customers");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    setLoading(true);
    setResult(null);
    try {
      setPreview(await apiFetch<Preview>("/api/imports/preview", { method: "POST", body: fd }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
      if (input.current) input.current.value = "";
    }
  };
  const apply = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const r = await apiFetch<{ created: number; updated: number }>(`/api/imports/${preview.jobId}/apply`, { method: "POST", body: {} });
      setResult(r);
      setPreview(null);
      toast.success(`Import appliqué : ${r.created} création(s), ${r.updated} mise(s) à jour`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Choisir le type et le fichier</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field label="Type de données">
            <NativeSelect value={kind} onChange={(e) => { setKind(e.target.value); setPreview(null); }} className="w-56">
              {canProducts ? <option value="products">Catalogue matériel</option> : null}
              {canCustomers ? <option value="customers">Clients</option> : null}
            </NativeSelect>
          </Field>
          <Button variant="outline" asChild>
            <a href={`/api/imports/template/${kind}`}>
              <Download /> Modèle CSV
            </a>
          </Button>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Fichier CSV" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button loading={loading && !preview} onClick={() => input.current?.click()}>
            <FileUp /> Analyser un fichier
          </Button>
          <p className="w-full text-xs text-muted-foreground">Séparateur « ; » ou « , », encodage UTF-8, 2 000 lignes max. {kind === "products" ? "Les catégories sont référencées par leur code (ex. LUM). Le stock n'est jamais importé : il s'initialise par des réceptions tracées." : "Les clients existants sont reconnus par leur e-mail."}</p>
        </CardContent>
      </Card>
      {result ? (
        <Alert tone="success" title="Import terminé">
          {result.created} création(s), {result.updated} mise(s) à jour.
        </Alert>
      ) : null}
      {preview ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>2. Vérifier l&apos;aperçu</CardTitle>
            <div className="flex gap-2 text-xs">
              <Badge tone="success">{preview.toCreate} à créer</Badge>
              <Badge tone="info">{preview.toUpdate} à mettre à jour</Badge>
              <Badge tone={preview.errorCount ? "danger" : "neutral"}>{preview.errorCount} en erreur</Badge>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ligne</TableHead>
                <TableHead>Clé</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Erreurs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((r) => (
                <TableRow key={r.line} className={r.action === "error" ? "bg-destructive/5" : undefined}>
                  <TableCell className="tabular-nums">{r.line}</TableCell>
                  <TableCell className="font-mono text-xs">{r.key}</TableCell>
                  <TableCell>
                    {r.action === "error" ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <XCircle className="size-4" /> Rejetée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckCircle2 className="size-4" /> {r.action === "create" ? "Création" : "Mise à jour"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-destructive">{r.errors.join(" · ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <p className="text-sm text-muted-foreground">{preview.errorCount ? "Les lignes en erreur seront ignorées. Corrigez le fichier et relancez l'analyse si nécessaire." : "Toutes les lignes sont valides."}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>
                Abandonner
              </Button>
              <Button onClick={apply} loading={loading} disabled={preview.toCreate + preview.toUpdate === 0}>
                3. Confirmer l&apos;import ({preview.toCreate + preview.toUpdate} ligne(s))
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
