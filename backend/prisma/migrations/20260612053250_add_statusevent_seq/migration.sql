-- DropIndex
DROP INDEX "StatusEvent_complaintId_idx";

-- AlterTable
ALTER TABLE "StatusEvent" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "StatusEvent_complaintId_seq_idx" ON "StatusEvent"("complaintId", "seq");
