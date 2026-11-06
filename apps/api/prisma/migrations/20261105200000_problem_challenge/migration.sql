-- One challenge per problem (blocks and/or JavaScript) instead of four pillar stages. Old rows keep their array of
-- stages; the API reads the last one (algoritma) as the challenge.
ALTER TABLE "block_problems" RENAME COLUMN "stages" TO "challenge";

-- CreateTable
CREATE TABLE "session_problems" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "problem_id" UUID,
    "title" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "challenge" JSONB NOT NULL,
    "status" "quiz_status" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,

    CONSTRAINT "session_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_attempts" (
    "id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solved_at" TIMESTAMPTZ,
    "solved_with" TEXT,
    "block_checks" INTEGER NOT NULL DEFAULT 0,
    "block_answer" JSONB,
    "code_runs" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "code_passed" INTEGER,
    "code_total" INTEGER,

    CONSTRAINT "problem_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_problems_session_id_idx" ON "session_problems"("session_id");

-- CreateIndex
CREATE INDEX "problem_attempts_student_id_idx" ON "problem_attempts"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "problem_attempts_problem_id_student_id_key" ON "problem_attempts"("problem_id", "student_id");

-- AddForeignKey
ALTER TABLE "session_problems" ADD CONSTRAINT "session_problems_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_problems" ADD CONSTRAINT "session_problems_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "block_problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_attempts" ADD CONSTRAINT "problem_attempts_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "session_problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_attempts" ADD CONSTRAINT "problem_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
