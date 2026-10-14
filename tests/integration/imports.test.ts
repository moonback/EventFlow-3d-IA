import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { AuthContext } from "@/server/auth/context";
import { applyImport, exportDataset, previewImport } from "@/server/services/import-service";
import { createOrg, createUserInOrg, uid } from "../helpers/factories";

let admin: AuthContext;
let otherOrgAdmin: AuthContext;
let readOnly: AuthContext;

beforeAll(async () => {
  const org = await createOrg("Import");
  const other = await createOrg("ImportB");
  admin = await createUserInOrg(org.id, "ADMIN");
  otherOrgAdmin = await createUserInOrg(other.id, "ADMIN");
  readOnly = await createUserInOrg(org.id, "READ_ONLY");
});

describe("import CSV de clients", () => {
  it("prévisualise, signale les lignes invalides puis n'applique que les lignes valides", async () => {
    const tag = uid("imp");
    const csv = [
      "kind;name;first_name;last_name;email;phone;siret;vat_number;notes",
      `COMPANY;Traiteur ${tag};;;contact-${tag}@exemple.test;;;;`,
      `INDIVIDUAL;;Alice;Martin ${tag};;;;;`,
      `COMPANY;Sans email ${tag};;;pas-un-email;;;;`,
    ].join("\n");
    const preview = await previewImport(admin, "customers", "clients.csv", csv);
    expect(preview).toMatchObject({ rowCount: 3, toCreate: 2, errorCount: 1 });
    // Rien n'est écrit avant confirmation
    expect(
      await db.customer.count({ where: { organizationId: admin.organizationId, name: { contains: tag } } }),
    ).toBe(0);

    // Un autre utilisateur, une autre organisation ou un rôle sans droit ne peut pas l'appliquer
    await expect(applyImport(otherOrgAdmin, preview.jobId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(applyImport(readOnly, preview.jobId)).rejects.toBeInstanceOf(ForbiddenError);

    const result = await applyImport(admin, preview.jobId);
    expect(result).toEqual({ created: 2, updated: 0 });
    expect(
      await db.customer.count({ where: { organizationId: admin.organizationId, name: { contains: tag } } }),
    ).toBe(2);
    await expect(applyImport(admin, preview.jobId)).rejects.toBeInstanceOf(BusinessRuleError);

    // Réimport : mise à jour par e-mail, pas de doublon
    const again = await previewImport(admin, "customers", "clients.csv", csv);
    expect(again).toMatchObject({ toCreate: 1, toUpdate: 1 });
  });

  it("refuse l'aperçu sans permission d'import", async () => {
    await expect(
      previewImport(readOnly, "customers", "x.csv", "kind;name\nCOMPANY;X"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("export CSV", () => {
  it("neutralise les formules et reste limité à l'organisation", async () => {
    const tag = uid("exp");
    await db.customer.create({
      data: { organizationId: admin.organizationId, kind: "COMPANY", name: `=HYPERLINK("http://x");${tag}` },
    });
    const csv = await exportDataset(admin, "customers");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const line = csv.split("\r\n").find((l) => l.includes(tag))!;
    expect(line).toContain(`"'=HYPERLINK(""http://x"");${tag}"`);
    expect(await exportDataset(otherOrgAdmin, "customers")).not.toContain(tag);
  });
});
