-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "joe_fraud_reviewed_at" TIMESTAMP(3);

-- Widen submissions.hours_justification to TEXT so the full justification with fraud info fits
ALTER TABLE "submissions" ALTER COLUMN "hours_justification" SET DATA TYPE TEXT;
