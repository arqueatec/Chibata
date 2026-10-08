-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('PROSPECT', 'PREPARING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXECUTING', 'REPORTING', 'CLOSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "GrantItemKind" AS ENUM ('DELIVERABLE', 'REPORT', 'INSTALLMENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "grantsTeam" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Grant" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "funder" TEXT NOT NULL,
    "callName" TEXT,
    "url" TEXT,
    "status" "GrantStatus" NOT NULL DEFAULT 'PROSPECT',
    "ownerId" TEXT NOT NULL,
    "requestedAmount" DOUBLE PRECISION,
    "approvedAmount" DOUBLE PRECISION,
    "counterpartAmount" DOUBLE PRECISION,
    "submissionDeadline" DATE,
    "resultExpected" DATE,
    "executionStart" DATE,
    "executionEnd" DATE,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantItem" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "kind" "GrantItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATE,
    "doneAt" TIMESTAMP(3),
    "assigneeId" TEXT,
    "amount" DOUBLE PRECISION,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantStatusChange" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "fromStatus" "GrantStatus",
    "toStatus" "GrantStatus" NOT NULL,
    "day" DATE NOT NULL,
    "actorId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Grant_status_idx" ON "Grant"("status");

-- CreateIndex
CREATE INDEX "Grant_ownerId_idx" ON "Grant"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "GrantItem_taskId_key" ON "GrantItem"("taskId");

-- CreateIndex
CREATE INDEX "GrantItem_grantId_idx" ON "GrantItem"("grantId");

-- CreateIndex
CREATE INDEX "GrantItem_dueDate_idx" ON "GrantItem"("dueDate");

-- CreateIndex
CREATE INDEX "GrantStatusChange_day_idx" ON "GrantStatusChange"("day");

-- CreateIndex
CREATE INDEX "GrantStatusChange_grantId_idx" ON "GrantStatusChange"("grantId");

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantItem" ADD CONSTRAINT "GrantItem_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantItem" ADD CONSTRAINT "GrantItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantItem" ADD CONSTRAINT "GrantItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantStatusChange" ADD CONSTRAINT "GrantStatusChange_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

