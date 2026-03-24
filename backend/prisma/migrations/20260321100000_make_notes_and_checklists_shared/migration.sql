-- Remove reviewer_id from reviewer_notes, making notes shared across all reviewers
-- Prisma creates unique constraints as indexes, so use DROP INDEX instead of DROP CONSTRAINT
DROP INDEX IF EXISTS "reviewer_notes_target_type_target_id_reviewer_id_key";
DROP INDEX IF EXISTS "reviewer_notes_reviewer_id_idx";

-- Deduplicate before dropping reviewer_id: keep the most recently updated note per (target_type, target_id)
DELETE FROM "reviewer_notes" a USING "reviewer_notes" b
  WHERE a.id < b.id
    AND a.target_type = b.target_type
    AND a.target_id = b.target_id;

ALTER TABLE "reviewer_notes" DROP COLUMN "reviewer_id";
CREATE UNIQUE INDEX "reviewer_notes_target_type_target_id_key" ON "reviewer_notes"("target_type", "target_id");

-- Remove reviewer_id from reviewer_checklists, making checklists shared across all reviewers
DROP INDEX IF EXISTS "reviewer_checklists_submission_id_reviewer_id_key";

-- Deduplicate before dropping reviewer_id: keep the most recently updated checklist per submission_id
DELETE FROM "reviewer_checklists" a USING "reviewer_checklists" b
  WHERE a.id < b.id
    AND a.submission_id = b.submission_id;

ALTER TABLE "reviewer_checklists" DROP COLUMN "reviewer_id";
CREATE UNIQUE INDEX "reviewer_checklists_submission_id_key" ON "reviewer_checklists"("submission_id");
