-- AlterEnum
ALTER TYPE "job_type" ADD VALUE 'generate_problem';

-- AlterTable
ALTER TABLE "block_problems" ADD COLUMN     "ai_focus" TEXT,
ADD COLUMN     "chat_id" UUID,
ADD COLUMN     "generation" TEXT,
ADD COLUMN     "generation_error" TEXT,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'manual';

-- CreateIndex
CREATE INDEX "block_problems_chat_id_idx" ON "block_problems"("chat_id");

-- AddForeignKey
ALTER TABLE "block_problems" ADD CONSTRAINT "block_problems_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
