-- AlterTable
ALTER TABLE "shop_items" ADD COLUMN     "event_hours_reduction" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "event_hours_credit" DOUBLE PRECISION;
