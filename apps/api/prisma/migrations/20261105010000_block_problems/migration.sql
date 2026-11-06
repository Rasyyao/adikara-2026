-- CreateTable
CREATE TABLE "block_problems" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "story" TEXT NOT NULL DEFAULT '',
    "status" "content_status" NOT NULL DEFAULT 'Draf',
    "stages" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_problems_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "block_problems_teacher_id_updated_at_idx" ON "block_problems"("teacher_id", "updated_at");

-- AddForeignKey
ALTER TABLE "block_problems" ADD CONSTRAINT "block_problems_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
