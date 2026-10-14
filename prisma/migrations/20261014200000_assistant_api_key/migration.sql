-- Clé API Gemini propre à l'organisation (chiffrée côté application, AES-256-GCM)
ALTER TABLE "Organization" ADD COLUMN "assistantApiKeyEncrypted" TEXT;
