-- CreateTable
CREATE TABLE "submission_audit_logs" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "new_status" TEXT,
    "approved_hours" DOUBLE PRECISION,
    "changes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submission_audit_logs_submission_id_idx" ON "submission_audit_logs"("submission_id");

-- CreateIndex
CREATE INDEX "submission_audit_logs_admin_id_idx" ON "submission_audit_logs"("admin_id");

-- AddForeignKey
ALTER TABLE "submission_audit_logs" ADD CONSTRAINT "submission_audit_logs_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("submission_id") ON DELETE CASCADE ON UPDATE CASCADE;
