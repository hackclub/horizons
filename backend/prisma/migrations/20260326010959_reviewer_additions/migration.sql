-- AlterTable
ALTER TABLE "users" ADD COLUMN     "admin_comment" VARCHAR(1000);

-- CreateTable
CREATE TABLE "reviewer_checklists" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "checked_items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviewer_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_checklists_submission_id_key" ON "reviewer_checklists"("submission_id");

-- AddForeignKey
ALTER TABLE "reviewer_checklists" ADD CONSTRAINT "reviewer_checklists_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("submission_id") ON DELETE CASCADE ON UPDATE CASCADE;
