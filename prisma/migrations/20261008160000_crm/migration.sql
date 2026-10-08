-- AlterTable
ALTER TABLE "User" ADD COLUMN     "crmEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CrmAccount" (
    "id" INTEGER NOT NULL,
    "companyName" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "nextAction" TEXT,
    "nextActionDate" DATE,
    "lastContactDate" TIMESTAMP(3),
    "proposedVolumeL" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchasedVolumeL" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenueTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "crmCreatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,
    "accountName" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "userEmail" TEXT,
    "toStatus" TEXT,
    "volumeL" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "text" TEXT,

    CONSTRAINT "CrmEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmEvent_day_idx" ON "CrmEvent"("day");

-- CreateIndex
CREATE INDEX "CrmEvent_type_day_idx" ON "CrmEvent"("type", "day");

