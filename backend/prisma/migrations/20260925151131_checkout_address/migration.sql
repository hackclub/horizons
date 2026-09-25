-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "order_notes" VARCHAR(1000);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address_first_name" TEXT,
ADD COLUMN     "address_last_name" TEXT;
