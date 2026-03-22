-- Remove reviewer_id from reviewer_notes, making notes shared across all reviewers
-- First drop the old unique constraint, then the column, then add the new constraint
ALTER TABLE "reviewer_notes" DROP CONSTRAINT "reviewer_notes_target_type_target_id_reviewer_id_key";
DROP INDEX IF EXISTS "reviewer_notes_reviewer_id_idx";
ALTER TABLE "reviewer_notes" DROP COLUMN "reviewer_id";
ALTER TABLE "reviewer_notes" ADD CONSTRAINT "reviewer_notes_target_type_target_id_key" UNIQUE ("target_type", "target_id");

-- Remove reviewer_id from reviewer_checklists, making checklists shared across all reviewers
ALTER TABLE "reviewer_checklists" DROP CONSTRAINT "reviewer_checklists_submission_id_reviewer_id_key";
ALTER TABLE "reviewer_checklists" DROP COLUMN "reviewer_id";
ALTER TABLE "reviewer_checklists" ADD CONSTRAINT "reviewer_checklists_submission_id_key" UNIQUE ("submission_id");
