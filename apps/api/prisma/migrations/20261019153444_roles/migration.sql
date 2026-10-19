-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('Draf', 'Disetujui', 'Dipublikasikan');

-- CreateEnum
CREATE TYPE "material_status" AS ENUM ('uploaded', 'extracted', 'failed');

-- CreateEnum
CREATE TYPE "pillar" AS ENUM ('dekomposisi', 'pola', 'abstraksi', 'algoritma');

-- CreateEnum
CREATE TYPE "item_type" AS ENUM ('board', 'teaching_card', 'practice');

-- CreateEnum
CREATE TYPE "test_phase" AS ENUM ('pretest', 'posttest');

-- CreateEnum
CREATE TYPE "diagnosis_status" AS ENUM ('perlu_diperiksa', 'kemungkinan_miskonsepsi', 'teratasi');

-- CreateEnum
CREATE TYPE "job_type" AS ENUM ('extract', 'generate_package');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "role" AS ENUM ('admin', 'teacher', 'user');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "archived_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "alias" TEXT,
ADD COLUMN     "last_seen_at" TIMESTAMPTZ,
ADD COLUMN     "role" "role" NOT NULL DEFAULT 'user';

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "role" "role" NOT NULL DEFAULT 'teacher';

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "extracted_text" TEXT,
    "status" "material_status" NOT NULL DEFAULT 'uploaded',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'Draf',
    "ai_model" TEXT,
    "published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_packages" (
    "class_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_packages_pkey" PRIMARY KEY ("class_id","package_id")
);

-- CreateTable
CREATE TABLE "concepts" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pillar" "pillar" NOT NULL,
    "board_json" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_items" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "concept_id" UUID,
    "item_type" "item_type" NOT NULL,
    "content_json" JSONB NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'Draf',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "concept_id" UUID NOT NULL,
    "phase" "test_phase" NOT NULL,
    "pair_id" UUID,
    "stem" TEXT NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'Draf',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "misconception_label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_tasks" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "concept_id" UUID NOT NULL,
    "pillar" "pillar" NOT NULL,
    "prompt" TEXT NOT NULL,
    "start_blocks" JSONB,
    "expected_json" JSONB,
    "ref_python" TEXT,
    "ref_js" TEXT,

    CONSTRAINT "practice_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hints" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "level" SMALLINT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "hints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "phase" "test_phase" NOT NULL,
    "score" DECIMAL(5,2),
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "answered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_submissions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "blocks_json" JSONB NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "hints_used" SMALLINT NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnoses" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "concept_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "misconception_label" TEXT NOT NULL,
    "evidence_count" SMALLINT NOT NULL,
    "status" "diagnosis_status" NOT NULL,
    "evidence_json" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "type" "job_type" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'queued',
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "error" TEXT,
    "result_ref" UUID,
    "locked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "packages_teacher_id_status_idx" ON "packages"("teacher_id", "status");

-- CreateIndex
CREATE INDEX "packages_material_id_idx" ON "packages"("material_id");

-- CreateIndex
CREATE INDEX "concepts_package_id_idx" ON "concepts"("package_id");

-- CreateIndex
CREATE INDEX "package_items_package_id_idx" ON "package_items"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_pair_id_key" ON "questions"("pair_id");

-- CreateIndex
CREATE INDEX "questions_package_id_phase_position_idx" ON "questions"("package_id", "phase", "position");

-- CreateIndex
CREATE INDEX "options_question_id_idx" ON "options"("question_id");

-- CreateIndex
CREATE INDEX "practice_tasks_package_id_idx" ON "practice_tasks"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "hints_task_id_level_key" ON "hints"("task_id", "level");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_student_id_package_id_phase_key" ON "attempts"("student_id", "package_id", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "answers_attempt_id_question_id_key" ON "answers"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "practice_submissions_student_id_task_id_idx" ON "practice_submissions"("student_id", "task_id");

-- CreateIndex
CREATE INDEX "diagnoses_concept_id_status_idx" ON "diagnoses"("concept_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "diagnoses_student_id_concept_id_misconception_label_key" ON "diagnoses"("student_id", "concept_id", "misconception_label");

-- CreateIndex
CREATE INDEX "jobs_status_created_at_idx" ON "jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "classes_teacher_id_idx" ON "classes"("teacher_id");

-- CreateIndex
CREATE INDEX "students_class_id_idx" ON "students"("class_id");

-- CreateIndex
CREATE INDEX "teachers_role_idx" ON "teachers"("role");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_packages" ADD CONSTRAINT "class_packages_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_packages" ADD CONSTRAINT "class_packages_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "options" ADD CONSTRAINT "options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hints" ADD CONSTRAINT "hints_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "practice_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_submissions" ADD CONSTRAINT "practice_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_submissions" ADD CONSTRAINT "practice_submissions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "practice_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
