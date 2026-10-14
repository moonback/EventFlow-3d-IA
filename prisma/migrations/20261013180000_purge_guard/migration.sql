-- Échappatoire contrôlée pour la suppression complète d'une organisation (fermeture de compte,
-- droit à l'effacement, réinitialisation de la démo) : uniquement dans une transaction ayant
-- exécuté `SET LOCAL eventflow.allow_purge = 'on'`. Les mises à jour restent toujours interdites.

CREATE OR REPLACE FUNCTION eventflow_forbid_movement_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('eventflow.allow_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'StockMovement is append-only (use a REVERSAL movement)' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION eventflow_protect_issued_invoice() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' AND current_setting('eventflow.allow_purge', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Issued invoice % cannot be deleted', OLD."number" USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" <> 'DRAFT' AND (
       NEW."number" IS DISTINCT FROM OLD."number"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
    OR NEW."issueDate" IS DISTINCT FROM OLD."issueDate"
    OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate"
    OR NEW."totalExclTax" IS DISTINCT FROM OLD."totalExclTax"
    OR NEW."totalTax" IS DISTINCT FROM OLD."totalTax"
    OR NEW."totalInclTax" IS DISTINCT FROM OLD."totalInclTax"
    OR NEW."globalDiscountPercent" IS DISTINCT FROM OLD."globalDiscountPercent"
    OR NEW."billingSnapshot"::text IS DISTINCT FROM OLD."billingSnapshot"::text
    OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."status" = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'Issued invoice % is immutable (issue a credit note instead)', OLD."number" USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION eventflow_protect_issued_invoice_lines() RETURNS trigger AS $$
DECLARE
  inv_status text;
  inv_id text;
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('eventflow.allow_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  inv_id := COALESCE(NEW."invoiceId", OLD."invoiceId");
  SELECT "status" INTO inv_status FROM "Invoice" WHERE "id" = inv_id;
  IF inv_status IS NOT NULL AND inv_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Lines of an issued invoice are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
