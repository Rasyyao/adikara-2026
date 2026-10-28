-- CreateTable
CREATE TABLE "session_boards" (
    "session_id" UUID NOT NULL,
    "scene" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_boards_pkey" PRIMARY KEY ("session_id")
);

-- AddForeignKey
ALTER TABLE "session_boards" ADD CONSTRAINT "session_boards_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
