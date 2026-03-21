-- CreateTable
CREATE TABLE "reviewer_notes" (
    "id" SERIAL NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" INTEGER NOT NULL,
    "reviewer_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviewer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviewer_checklists" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "reviewer_id" INTEGER NOT NULL,
    "checked_items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviewer_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviewer_notes_reviewer_id_idx" ON "reviewer_notes"("reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_notes_target_type_target_id_reviewer_id_key" ON "reviewer_notes"("target_type", "target_id", "reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_checklists_submission_id_reviewer_id_key" ON "reviewer_checklists"("submission_id", "reviewer_id");
