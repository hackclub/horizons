-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "joe_justification" TEXT,
ADD COLUMN     "joe_outcome_reason" TEXT,
ADD COLUMN     "joe_outcome_recorded_at" TIMESTAMP(3),
ADD COLUMN     "joe_outcome_status" TEXT,
ADD COLUMN     "joe_trust_score" DOUBLE PRECISION;
