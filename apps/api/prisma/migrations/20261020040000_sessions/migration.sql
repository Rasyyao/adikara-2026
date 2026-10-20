-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('LOBBY', 'ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "join_code" TEXT,
    "status" "session_status" NOT NULL DEFAULT 'LOBBY',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ,
    "kicked_at" TIMESTAMPTZ,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_join_code_key" ON "class_sessions"("join_code");

-- CreateIndex
CREATE INDEX "class_sessions_class_id_status_idx" ON "class_sessions"("class_id", "status");

-- CreateIndex
CREATE INDEX "class_sessions_teacher_id_idx" ON "class_sessions"("teacher_id");

-- CreateIndex
CREATE INDEX "session_participants_student_id_idx" ON "session_participants"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_participants_session_id_student_id_key" ON "session_participants"("session_id", "student_id");

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

