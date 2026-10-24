-- AlterEnum
ALTER TYPE "job_type" ADD VALUE 'chat_reply';

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "error" TEXT;
