import type { Repositories } from "../repositories/index.js";
import { createEventHub } from "../lib/event-hub.js";
import type { TokenService } from "../lib/token.js";
import { createAdminClassService, type AdminClassService } from "./admin/class.service.js";
import { createAdminStudentService, type AdminStudentService } from "./admin/student.service.js";
import { createAdminTeacherService, type AdminTeacherService } from "./admin/teacher.service.js";
import { createCredentialChecker } from "./shared/credentials.js";
import { createProfileService, type ProfileService } from "./shared/profile.service.js";
import { createSessionCore, type SessionOptions } from "./shared/session-core.js";
import { createSessionStreamService, type SessionStreamService } from "./shared/session-stream.service.js";
import { createStudentAuthService, type StudentAuthService } from "./student/auth.service.js";
import { createStudentSessionService, type StudentSessionService } from "./student/session.service.js";
import { createTeacherAuthService, type TeacherAuthService } from "./teacher/auth.service.js";
import { createTeacherClassService, type TeacherClassService } from "./teacher/class.service.js";
import { createTeacherSessionService, type TeacherSessionService } from "./teacher/session.service.js";

/** Every service, grouped by the role that uses it (same shape as `Repositories`). */
export interface Services {
  admin: { teachers: AdminTeacherService; students: AdminStudentService; classes: AdminClassService };
  teacher: { auth: TeacherAuthService; sessions: TeacherSessionService; classes: TeacherClassService };
  student: { auth: StudentAuthService; sessions: StudentSessionService };
  shared: { profile: ProfileService; sessionStream: SessionStreamService };
}

export interface ServiceOptions {
  bcryptCost: number;
  session: Partial<SessionOptions>;
}

export async function createServices(repositories: Repositories, tokens: TokenService, options: ServiceOptions): Promise<Services> {
  const credentials = await createCredentialChecker(tokens, { bcryptCost: options.bcryptCost });
  // one core, so teacher, student and stream share the same hub, timers and rules
  const core = createSessionCore(repositories.shared.sessions, createEventHub(), options.session);

  return {
    admin: {
      teachers: createAdminTeacherService(repositories.admin.teachers, options),
      students: createAdminStudentService(repositories.admin.students, repositories.admin.classes, options),
      classes: createAdminClassService(repositories.admin.classes, repositories.admin.teachers),
    },
    teacher: {
      auth: createTeacherAuthService(repositories.teacher.auth, credentials),
      sessions: createTeacherSessionService(repositories.teacher.sessions, core),
      classes: createTeacherClassService(repositories.teacher.classes),
    },
    student: {
      auth: createStudentAuthService(repositories.student.auth, credentials),
      sessions: createStudentSessionService(repositories.student.sessions, core),
    },
    shared: {
      profile: createProfileService(repositories.shared.profile),
      sessionStream: createSessionStreamService(core),
    },
  };
}
