-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "silent_reject" BOOLEAN NOT NULL DEFAULT false;

-- Mark historical submissions that were silently rejected.
-- Any rejected submission on a project with failed fraud was a fraud-silent reject;
-- they must display as 'pending' to the user so fraud actors get no feedback.
UPDATE "submissions" s
SET "silent_reject" = true
WHERE s."approval_status" = 'rejected'
  AND s."project_id" IN (SELECT "project_id" FROM "projects" WHERE "joe_fraud_passed" = false);
