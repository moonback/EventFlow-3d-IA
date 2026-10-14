-- AlterTable
ALTER TABLE "SceneLayoutVersion" ADD COLUMN     "sitePlan" JSONB;

-- CreateTable
CREATE TABLE "SitePlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SitePlan_organizationId_key" ON "SitePlan"("organizationId");

-- AddForeignKey
ALTER TABLE "SitePlan" ADD CONSTRAINT "SitePlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
