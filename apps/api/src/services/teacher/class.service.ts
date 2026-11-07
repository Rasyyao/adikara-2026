import { randomInt } from "node:crypto";
import { AppError } from "../../http/errors.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { AdminStudentRepository } from "../../types/admin/student.types.js";
import type { TeacherClassRepository } from "../../types/teacher/class.types.js";
import type { AdminClassService } from "../admin/class.service.js";
import type { AdminStudentService, StudentView } from "../admin/student.service.js";
import { toClassStudentView, toClassView, type ClassStudentView, type ClassView } from "../shared/class-views.js";

export interface TeacherStudentInput {
  username: string;
  name: string;
  password: string;
}

export interface TeacherStudentPatch {
  username?: string;
  name?: string;
  password?: string;
  /** Moves the student to another class of the same teacher. */
  classId?: string;
}

/**
 * Classes as teachers manage them: their own (an admin sees and manages all). A teacher creates, renames, archives
 * and deletes their classes, and adds, edits, moves and removes the students in them. Another teacher's class or
 * student always looks like a missing one.
 */
export interface TeacherClassService {
  list(auth: AuthContext): Promise<{ items: ClassView[] }>;
  get(auth: AuthContext, classId: string): Promise<{ class: ClassView; students: ClassStudentView[] }>;
  create(auth: AuthContext, input: { name: string; classCode?: string }): Promise<{ class: ClassView }>;
  update(auth: AuthContext, classId: string, patch: { name?: string; archived?: boolean }): Promise<{ class: ClassView }>;
  remove(auth: AuthContext, classId: string): Promise<void>;
  addStudent(auth: AuthContext, classId: string, input: TeacherStudentInput): Promise<{ student: StudentView }>;
  updateStudent(auth: AuthContext, classId: string, studentId: string, patch: TeacherStudentPatch): Promise<{ student: StudentView }>;
  removeStudent(auth: AuthContext, classId: string, studentId: string): Promise<void>;
}

// no 0/O/1/I, so a code read out loud or copied from the board is not mistaken
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateClassCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
const MAX_CODE_ATTEMPTS = 5;

export function createTeacherClassService(
  repository: TeacherClassRepository,
  admin: { classes: AdminClassService; students: AdminStudentService; studentRepository: AdminStudentRepository },
): TeacherClassService {
  const assertStaff = (auth: AuthContext) => {
    if (auth.kind !== "teacher") throw new AppError(403, "forbidden", "You do not have access to this resource");
  };

  /** The class if this person may manage it; another teacher's class is a plain 404. */
  async function ownClass(auth: AuthContext, classId: string) {
    assertStaff(auth);
    const row = await repository.findById(classId);
    if (!row || (auth.role === "TEACHER" && row.teacherId !== auth.userId)) throw new AppError(404, "class_not_found", "Class not found");
    return row;
  }

  /** The student, only if they are in this class. */
  async function studentOf(classId: string, studentId: string) {
    const student = await admin.studentRepository.findById(studentId);
    if (!student || student.classId !== classId) throw new AppError(404, "student_not_found", "Student not found");
    return student;
  }

  return {
    async list(auth) {
      assertStaff(auth);
      const rows = await repository.list(auth.role === "ADMIN" ? null : auth.userId);
      return { items: rows.map(toClassView) };
    },

    async get(auth, classId) {
      const row = await ownClass(auth, classId);
      const students = await repository.listStudents(row.id);
      return { class: toClassView(row), students: students.map(toClassStudentView) };
    },

    async create(auth, { name, classCode }) {
      assertStaff(auth);
      // a chosen code that is taken is the teacher's to fix; a generated one is simply drawn again
      if (classCode) return admin.classes.create({ name, classCode, teacherId: auth.userId });
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        try {
          return await admin.classes.create({ name, classCode: generateClassCode(), teacherId: auth.userId });
        } catch (err) {
          if (!(err instanceof AppError && err.code === "class_code_taken")) throw err;
        }
      }
      throw new AppError(503, "class_code_unavailable", "Could not make a class code, try again");
    },

    async update(auth, classId, patch) {
      await ownClass(auth, classId);
      return admin.classes.update(classId, patch);
    },

    async remove(auth, classId) {
      await ownClass(auth, classId);
      await admin.classes.remove(classId);
    },

    async addStudent(auth, classId, input) {
      await ownClass(auth, classId);
      return admin.students.create({ ...input, classId });
    },

    async updateStudent(auth, classId, studentId, patch) {
      await ownClass(auth, classId);
      await studentOf(classId, studentId);
      // a student can only go to another class of the same teacher
      if (patch.classId !== undefined && patch.classId !== classId) await ownClass(auth, patch.classId);
      return admin.students.update(studentId, patch);
    },

    async removeStudent(auth, classId, studentId) {
      await ownClass(auth, classId);
      await studentOf(classId, studentId);
      // a student inside a live session is removed with "kick", not deleted from under it
      if (await admin.studentRepository.isInLiveSession(studentId)) {
        throw new AppError(409, "student_in_live_session", "The student is in a live session. Remove them after it ends.");
      }
      await admin.students.remove(studentId);
    },
  };
}
