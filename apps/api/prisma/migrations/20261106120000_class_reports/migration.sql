-- AlterEnum
ALTER TYPE "job_type" ADD VALUE 'generate_report';

-- CreateTable
CREATE TABLE "class_reports" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL,
    "feedback" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "class_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_reports_class_id_created_at_idx" ON "class_reports"("class_id", "created_at");

-- AddForeignKey
ALTER TABLE "class_reports" ADD CONSTRAINT "class_reports_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
