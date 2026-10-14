-- CreateTable
CREATE TABLE "SceneLayoutVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdByName" TEXT,
    "objectCount" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SceneLayoutVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SceneLayoutVersion_organizationId_createdAt_idx" ON "SceneLayoutVersion"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "SceneLayoutVersion" ADD CONSTRAINT "SceneLayoutVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
