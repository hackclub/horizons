/*
  Warnings:

  - You are about to drop the column `region` on the `shop_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "shop_items" DROP COLUMN "region",
ADD COLUMN     "regions" TEXT[] DEFAULT ARRAY[]::TEXT[];
