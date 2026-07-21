-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "reviewer_payout_id" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "reviewer_boosted_rate_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewer_payouts_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "reviewer_payouts" (
    "id" SERIAL NOT NULL,
    "reviewer_user_id" INTEGER NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "reviews_counted_before" INTEGER NOT NULL,
    "reviews_counted_after" INTEGER NOT NULL,
    "boosted_rate_applied" BOOLEAN NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "created_by_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviewer_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_payouts_transaction_id_key" ON "reviewer_payouts"("transaction_id");

-- CreateIndex
CREATE INDEX "reviewer_payouts_reviewer_user_id_idx" ON "reviewer_payouts"("reviewer_user_id");

-- CreateIndex
CREATE INDEX "submissions_reviewer_payout_id_idx" ON "submissions"("reviewer_payout_id");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewer_payout_id_fkey" FOREIGN KEY ("reviewer_payout_id") REFERENCES "reviewer_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewer_payouts" ADD CONSTRAINT "reviewer_payouts_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewer_payouts" ADD CONSTRAINT "reviewer_payouts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("transaction_id") ON DELETE CASCADE ON UPDATE CASCADE;
