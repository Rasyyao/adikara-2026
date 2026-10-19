-- AlterTable
ALTER TABLE "students" ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "username" TEXT,
ALTER COLUMN "token_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "students_username_key" ON "students"("username");

