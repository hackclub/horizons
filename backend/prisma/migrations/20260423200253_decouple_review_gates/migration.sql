-- AlterTable
ALTER TABLE "projects" DROP COLUMN "is_fraud";

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "finalized_at" TIMESTAMP(3),
ADD COLUMN     "pending_send_email" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "review_passed" BOOLEAN,
ADD COLUMN     "reviewer_analysis" TEXT;

-- Backfill review_passed from historical approval_status
UPDATE "submissions" SET "review_passed" = true  WHERE "approval_status" = 'approved';
UPDATE "submissions" SET "review_passed" = false WHERE "approval_status" = 'rejected';

-- Auto-reject pending submissions whose fraud already failed (previously hidden from the queue).
-- review_passed stays NULL — reviewer never acted; these are "normal" fraud-driven rejects.
UPDATE "submissions"
SET "approval_status" = 'rejected',
    "finalized_at"    = NOW()
WHERE "approval_status" = 'pending'
  AND "project_id" IN (SELECT "project_id" FROM "projects" WHERE "joe_fraud_passed" = false);

-- Backfill finalized_at for historical finalized rows (best-effort via reviewed_at).
UPDATE "submissions" SET "finalized_at" = "reviewed_at"
WHERE "approval_status" IN ('approved','rejected') AND "finalized_at" IS NULL;
