"use client";
import { Download, Eye, FileText, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ActionButton } from "@/components/feedback/action-button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { documentCategoryLabels } from "@/lib/labels";

export interface DocItem {
  id: string;
  fileName: string;
  category: keyof typeof documentCategoryLabels;
  sizeBytes: number;
  createdAt: string;
}

const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} Mo` : `${Math.ceil(b / 1024)} Ko`);

/** Pièces jointes d'une entité : téléversement contrôlé (type/taille vérifiés serveur), téléchargement authentifié. */
export function DocumentsPanel({ target, targetId, documents, canWrite }: { target: "customer" | "event" | "vehicle" | "staff"; targetId: string; documents: DocItem[]; canWrite: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("OTHER");
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("target", target);
    fd.append("targetId", targetId);
    fd.append("category", category);
    setUploading(true);
    try {
      await apiFetch("/api/documents", { method: "POST", body: fd });
      toast.success("Document téléversé");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto" aria-label="Catégorie du document">
            {Object.entries(documentCategoryLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
          <input ref={input} type="file" className="sr-only" id={`upload-${targetId}`} accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv,.txt" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button size="sm" variant="outline" loading={uploading} onClick={() => input.current?.click()}>
            <Upload /> Téléverser
          </Button>
          <span className="text-xs text-muted-foreground">PDF, images, DOCX, XLSX, CSV — fichiers privés</span>
        </div>
      ) : null}
      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun document" description="Contrats, plans, fiches techniques… restent privés à votre organisation." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {documentCategoryLabels[d.category]} · {size(d.sizeBytes)} · {new Date(d.createdAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" asChild>
                <a href={`/api/documents/${d.id}/download?inline=1`} target="_blank" rel="noopener" aria-label={`Aperçu de ${d.fileName}`}>
                  <Eye />
                </a>
              </Button>
              <Button variant="ghost" size="icon-sm" asChild>
                <a href={`/api/documents/${d.id}/download`} aria-label={`Télécharger ${d.fileName}`}>
                  <Download />
                </a>
              </Button>
              {canWrite ? (
                <ActionButton url={`/api/documents/${d.id}`} method="DELETE" variant="ghost" size="icon-sm" aria-label={`Supprimer ${d.fileName}`} successMessage="Document supprimé" confirm={{ title: "Supprimer ce document ?", description: `« ${d.fileName} » sera définitivement supprimé.`, destructive: true, confirmLabel: "Supprimer" }}>
                  <Trash2 />
                </ActionButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
