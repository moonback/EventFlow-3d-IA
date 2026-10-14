-- Réglages de l'assistant vocal Eric par organisation (ajout de colonnes, sans perte de données)
ALTER TABLE "Organization" ADD COLUMN "assistantEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "assistantVoice" TEXT;
ALTER TABLE "Organization" ADD COLUMN "assistantMaxSessionMinutes" INTEGER;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_assistantMaxSessionMinutes_check" CHECK ("assistantMaxSessionMinutes" IS NULL OR ("assistantMaxSessionMinutes" BETWEEN 1 AND 240));
