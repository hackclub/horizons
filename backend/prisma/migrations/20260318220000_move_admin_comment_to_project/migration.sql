-- AlterTable: add admin_comment to projects
ALTER TABLE "projects" ADD COLUMN "admin_comment" VARCHAR(1000);

-- Migrate existing data: copy admin_comment from submissions to their project
UPDATE "projects" p
SET "admin_comment" = s."admin_comment"
FROM "submissions" s
WHERE s."project_id" = p."project_id"
  AND s."admin_comment" IS NOT NULL;

-- AlterTable: drop admin_comment from submissions
ALTER TABLE "submissions" DROP COLUMN "admin_comment";
