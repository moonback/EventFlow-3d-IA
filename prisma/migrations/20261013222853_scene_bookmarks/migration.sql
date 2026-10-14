-- CreateTable
CREATE TABLE "SceneBookmark" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" JSONB NOT NULL,
    "target" JSONB NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SceneBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SceneBookmark_organizationId_name_idx" ON "SceneBookmark"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "SceneBookmark" ADD CONSTRAINT "SceneBookmark_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
