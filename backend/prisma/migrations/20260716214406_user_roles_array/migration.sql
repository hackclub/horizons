-- AlterTable: replace scalar `role` with `roles` array.
-- Add the new column, backfill each existing single role into a one-element
-- array, then drop the old column. The backfill (line 2) is what prevents the
-- data loss the default Prisma diff would cause.
ALTER TABLE "users" ADD COLUMN "roles" TEXT[] NOT NULL DEFAULT ARRAY['user']::TEXT[];
UPDATE "users" SET "roles" = ARRAY["role"];
ALTER TABLE "users" DROP COLUMN "role";
