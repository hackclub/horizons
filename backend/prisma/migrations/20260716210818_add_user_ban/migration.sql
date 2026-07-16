-- AlterTable
ALTER TABLE "users" ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "banned_at" TIMESTAMP(3),
ADD COLUMN     "banned_reason" VARCHAR(1000);
