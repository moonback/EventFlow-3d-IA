-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "dashboardWidgets" TEXT[] DEFAULT ARRAY[]::TEXT[];
