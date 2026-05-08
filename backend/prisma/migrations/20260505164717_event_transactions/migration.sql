/*
  Warnings:

  - A unique constraint covering the columns `[user_id,event_id,kind]` on the table `transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('ShopItem', 'EventRsvp', 'EventTicket');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "rsvp_cost" DOUBLE PRECISION,
ADD COLUMN     "rsvp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ticket_cost" DOUBLE PRECISION,
ADD COLUMN     "ticket_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "event_id" INTEGER,
ADD COLUMN     "kind" "TransactionKind" NOT NULL DEFAULT 'ShopItem',
ALTER COLUMN "item_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "transactions_event_id_idx" ON "transactions"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_event_id_kind_key" ON "transactions"("user_id", "event_id", "kind");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;
