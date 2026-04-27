-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "claim_heartbeat_at" TIMESTAMP(3),
ADD COLUMN     "claimed_at" TIMESTAMP(3),
ADD COLUMN     "claimed_by_id" INTEGER;

-- CreateIndex
CREATE INDEX "submissions_claimed_by_id_idx" ON "submissions"("claimed_by_id");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
