/*
  Warnings:

  - You are about to drop the column `student_id` on the `chat_messages` table. All the data in the column will be lost.
  - You are about to drop the `session_chats` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `session_chunks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_chat_id_fkey";

-- DropForeignKey
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_student_id_fkey";

-- DropForeignKey
ALTER TABLE "session_chats" DROP CONSTRAINT "session_chats_session_id_fkey";

-- DropForeignKey
ALTER TABLE "session_chunks" DROP CONSTRAINT "session_chunks_material_id_fkey";

-- DropForeignKey
ALTER TABLE "session_chunks" DROP CONSTRAINT "session_chunks_session_id_fkey";

-- AlterTable
ALTER TABLE "chat_messages" DROP COLUMN "student_id";

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "chat_id" UUID;

-- DropTable
DROP TABLE "session_chats";

-- DropTable
DROP TABLE "session_chunks";

-- CreateTable
CREATE TABLE "chats" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_materials" (
    "chat_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_materials_pkey" PRIMARY KEY ("chat_id","material_id")
);

-- CreateTable
CREATE TABLE "material_chunks" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "embedding_model" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chats_teacher_id_idx" ON "chats"("teacher_id");

-- CreateIndex
CREATE INDEX "chat_materials_material_id_idx" ON "chat_materials"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_chunks_material_id_embedding_model_chunk_index_key" ON "material_chunks"("material_id", "embedding_model", "chunk_index");

-- CreateIndex
CREATE INDEX "class_sessions_chat_id_idx" ON "class_sessions"("chat_id");

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_materials" ADD CONSTRAINT "chat_materials_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_materials" ADD CONSTRAINT "chat_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
