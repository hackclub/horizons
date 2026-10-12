-- AlterTable
ALTER TABLE "global_settings" ADD COLUMN     "shop_disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shop_disabled_at" TIMESTAMP(3),
ADD COLUMN     "shop_disabled_by" TEXT,
ADD COLUMN     "shop_whitelist" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
