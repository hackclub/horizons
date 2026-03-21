-- AlterEnum
ALTER TYPE "ProjectType" ADD VALUE 'hardware';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "journal_url" TEXT;
