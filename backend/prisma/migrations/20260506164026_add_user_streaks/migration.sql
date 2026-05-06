-- AlterTable
ALTER TABLE "users" ADD COLUMN     "current_streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_active_date" DATE,
ADD COLUMN     "longest_streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "user_daily_activity" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "local_date" DATE NOT NULL,
    "seconds" INTEGER NOT NULL,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_daily_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_daily_activity_user_id_local_date_idx" ON "user_daily_activity"("user_id", "local_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "user_daily_activity_user_id_local_date_key" ON "user_daily_activity"("user_id", "local_date");

-- AddForeignKey
ALTER TABLE "user_daily_activity" ADD CONSTRAINT "user_daily_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
