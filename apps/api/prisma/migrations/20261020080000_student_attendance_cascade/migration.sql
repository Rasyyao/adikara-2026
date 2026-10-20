-- DropForeignKey
ALTER TABLE "session_participants" DROP CONSTRAINT "session_participants_student_id_fkey";

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

