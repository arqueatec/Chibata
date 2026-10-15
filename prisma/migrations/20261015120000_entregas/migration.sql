-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "asanaAttachments" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contestReason" TEXT,
ADD COLUMN     "contestedAt" TIMESTAMP(3),
ADD COLUMN     "contestedById" TEXT,
ADD COLUMN     "evidenceUrl" TEXT,
ADD COLUMN     "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unplanned" BOOLEAN NOT NULL DEFAULT false;

