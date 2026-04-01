-- AlterTable
ALTER TABLE "submissions" ADD COLUMN "airtable_rec_id" TEXT;

-- Migrate existing airtable_rec_id from projects to the latest approved submission
UPDATE "submissions" s
SET "airtable_rec_id" = p."airtable_rec_id"
FROM "projects" p
WHERE s."project_id" = p."project_id"
  AND p."airtable_rec_id" IS NOT NULL
  AND s."approval_status" = 'approved'
  AND s."submission_id" = (
    SELECT MAX(s2."submission_id")
    FROM "submissions" s2
    WHERE s2."project_id" = p."project_id"
      AND s2."approval_status" = 'approved'
  );

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "airtable_rec_id";
