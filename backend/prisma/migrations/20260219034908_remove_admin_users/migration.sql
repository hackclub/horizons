/*
  Warnings:

  - You are about to drop the `admin_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `admin_users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "admin_sessions" DROP CONSTRAINT "admin_sessions_adminUserId_fkey";

-- DropTable
DROP TABLE "admin_sessions";

-- DropTable
DROP TABLE "admin_users";
