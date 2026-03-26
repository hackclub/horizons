-- CreateTable
CREATE TABLE "shops" (
    "shop_id" SERIAL NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("shop_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_slug_key" ON "shops"("slug");

-- Insert default shop for existing items
INSERT INTO "shops" ("slug", "description", "is_active", "is_public", "created_at", "updated_at")
VALUES ('default', 'Default shop', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add shop_id as nullable first
ALTER TABLE "shop_items" ADD COLUMN "shop_id" INTEGER;

-- Set all existing items to the default shop
UPDATE "shop_items" SET "shop_id" = (SELECT "shop_id" FROM "shops" WHERE "slug" = 'default');

-- Make shop_id NOT NULL
ALTER TABLE "shop_items" ALTER COLUMN "shop_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "shop_items_shop_id_idx" ON "shop_items"("shop_id");

-- AddForeignKey
ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE CASCADE ON UPDATE CASCADE;
