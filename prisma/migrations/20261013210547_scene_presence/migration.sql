-- CreateTable
CREATE TABLE "ScenePresence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "camera" JSONB NOT NULL,
    "selectedKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenePresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScenePresence_organizationId_updatedAt_idx" ON "ScenePresence"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScenePresence_organizationId_userId_key" ON "ScenePresence"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "ScenePresence" ADD CONSTRAINT "ScenePresence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
