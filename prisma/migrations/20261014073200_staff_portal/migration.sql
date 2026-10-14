-- CreateEnum
CREATE TYPE "StaffAvailabilityKind" AS ENUM ('UNAVAILABLE', 'AVAILABLE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssignmentStatus" ADD VALUE 'PROPOSED';
ALTER TYPE "AssignmentStatus" ADD VALUE 'DECLINED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STAFF_MISSION_RESPONSE';

-- AlterTable
ALTER TABLE "EventStaffAssignment" ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "respondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StaffAvailability" ADD COLUMN     "declaredViaPortal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" "StaffAvailabilityKind" NOT NULL DEFAULT 'UNAVAILABLE';

-- CreateTable
CREATE TABLE "StaffPortalToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPortalToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffPortalToken_tokenHash_key" ON "StaffPortalToken"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffPortalToken_staffId_idx" ON "StaffPortalToken"("staffId");

-- AddForeignKey
ALTER TABLE "StaffPortalToken" ADD CONSTRAINT "StaffPortalToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPortalToken" ADD CONSTRAINT "StaffPortalToken_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
