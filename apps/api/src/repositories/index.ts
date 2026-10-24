import type { PrismaClient } from "../generated/prisma/client.js";
import type { AdminClassRepository } from "../types/admin/class.types.js";
import type { AdminStudentRepository } from "../types/admin/student.types.js";
import type { AdminTeacherRepository } from "../types/admin/teacher.types.js";
import type { ProfileRepository } from "../types/shared/profile.types.js";
import type { SharedSessionRepository } from "../types/shared/session.types.js";
import type { StudentAuthRepository } from "../types/student/auth.types.js";
import type { StudentSessionRepository } from "../types/student/session.types.js";
import type { TeacherAuthRepository } from "../types/teacher/auth.types.js";
import type { TeacherChatRepository } from "../types/teacher/chat.types.js";
import type { TeacherClassRepository } from "../types/teacher/class.types.js";
import type { TeacherSessionRepository } from "../types/teacher/session.types.js";
import { createAdminClassRepository } from "./admin/class.repository.js";
import { createAdminStudentRepository } from "./admin/student.repository.js";
import { createAdminTeacherRepository } from "./admin/teacher.repository.js";
import { createProfileRepository } from "./shared/profile.repository.js";
import { createSharedSessionRepository } from "./shared/session.repository.js";
import { createStudentAuthRepository } from "./student/auth.repository.js";
import { createStudentSessionRepository } from "./student/session.repository.js";
import { createTeacherAuthRepository } from "./teacher/auth.repository.js";
import { createTeacherChatRepository } from "./teacher/chat.repository.js";
import { createTeacherClassRepository } from "./teacher/class.repository.js";
import { createTeacherSessionRepository } from "./teacher/session.repository.js";

/** Every repository, grouped by the role that uses it. Tests pass in-memory versions of the same shape. */
export interface Repositories {
  admin: { teachers: AdminTeacherRepository; students: AdminStudentRepository; classes: AdminClassRepository };
  teacher: { auth: TeacherAuthRepository; sessions: TeacherSessionRepository; classes: TeacherClassRepository; chats: TeacherChatRepository };
  student: { auth: StudentAuthRepository; sessions: StudentSessionRepository };
  shared: { profile: ProfileRepository; sessions: SharedSessionRepository };
}

export function createRepositories(prisma: PrismaClient): Repositories {
  return {
    admin: {
      teachers: createAdminTeacherRepository(prisma),
      students: createAdminStudentRepository(prisma),
      classes: createAdminClassRepository(prisma),
    },
    teacher: {
      auth: createTeacherAuthRepository(prisma),
      sessions: createTeacherSessionRepository(prisma),
      classes: createTeacherClassRepository(prisma),
      chats: createTeacherChatRepository(prisma),
    },
    student: { auth: createStudentAuthRepository(prisma), sessions: createStudentSessionRepository(prisma) },
    shared: { profile: createProfileRepository(prisma), sessions: createSharedSessionRepository(prisma) },
  };
}
