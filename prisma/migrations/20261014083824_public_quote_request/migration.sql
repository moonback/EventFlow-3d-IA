-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('NEW', 'QUALIFIED', 'QUOTE_SENT', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "OpportunitySource" AS ENUM ('MANUAL', 'PUBLIC_FORM');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'QUOTE_REQUEST';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "publicRequestFormEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'NEW',
    "source" "OpportunitySource" NOT NULL DEFAULT 'MANUAL',
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "companyName" TEXT,
    "customerId" TEXT,
    "eventTypeId" TEXT,
    "eventDate" DATE,
    "venue" TEXT,
    "guestCount" INTEGER,
    "budget" DECIMAL(12,2),
    "estimatedAmount" DECIMAL(12,2),
    "probability" INTEGER NOT NULL DEFAULT 10,
    "message" TEXT,
    "lossReason" TEXT,
    "ownerId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_stage_createdAt_idx" ON "Opportunity"("organizationId", "stage", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_organizationId_reference_key" ON "Opportunity"("organizationId", "reference");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
