-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "sent_to_admin_at" TIMESTAMP(3),
ADD COLUMN     "sent_to_admin_by_id" INTEGER,
ADD COLUMN     "sent_to_admin_note" TEXT;
