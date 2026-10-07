-- AlterTable
ALTER TABLE "Indicator" ADD COLUMN     "autoRule" JSONB;

-- AlterTable
ALTER TABLE "IndicatorEntry" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "asanaGid" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "asanaFields" JSONB,
ADD COLUMN     "asanaGid" TEXT,
ADD COLUMN     "asanaSyncedAt" TIMESTAMP(3),
ADD COLUMN     "asanaUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "asanaEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "TaskFieldChange" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "asanaGid" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "toValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskFieldChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskFieldChange_asanaGid_key" ON "TaskFieldChange"("asanaGid");

-- CreateIndex
CREATE INDEX "TaskFieldChange_taskId_changedAt_idx" ON "TaskFieldChange"("taskId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_asanaGid_key" ON "Project"("asanaGid");

-- CreateIndex
CREATE UNIQUE INDEX "Task_asanaGid_key" ON "Task"("asanaGid");

-- AddForeignKey
ALTER TABLE "TaskFieldChange" ADD CONSTRAINT "TaskFieldChange_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

