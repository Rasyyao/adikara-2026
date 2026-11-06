import type { Repositories } from "../repositories/index.js";
import { createObjectStorage, type ObjectStorage } from "../lib/storage.js";
import { createEventHub } from "../lib/event-hub.js";
import type { TokenService } from "../lib/token.js";
import { createAdminClassService, type AdminClassService } from "./admin/class.service.js";
import { createAdminStudentService, type AdminStudentService } from "./admin/student.service.js";
import { createAdminTeacherService, type AdminTeacherService } from "./admin/teacher.service.js";
import { createCredentialChecker } from "./shared/credentials.js";
import { createProfileService, type ProfileService } from "./shared/profile.service.js";
import { createSessionCore, type SessionOptions } from "./shared/session-core.js";
import { createLiveBoardService, type LiveBoardService } from "./shared/live-board.service.js";
import { createQuizService, type QuizService } from "./shared/quiz.service.js";
import { createSessionProblemService, type SessionProblemService } from "./shared/session-problem.service.js";
import { createSessionStreamService, type SessionStreamService } from "./shared/session-stream.service.js";
import { createStudentAuthService, type StudentAuthService } from "./student/auth.service.js";
import { createStudentSessionService, type StudentSessionService } from "./student/session.service.js";
import { createTeacherAuthService, type TeacherAuthService } from "./teacher/auth.service.js";
import { createTeacherChatService, type TeacherChatService } from "./teacher/chat.service.js";
import { createTeacherClassService, type TeacherClassService } from "./teacher/class.service.js";
import { createTeacherInsightsService, type TeacherInsightsService } from "./teacher/insights.service.js";
import { createTeacherProblemService, type TeacherProblemService } from "./teacher/problem.service.js";
import { createTeacherSessionService, type TeacherSessionService } from "./teacher/session.service.js";

/** Every service, grouped by the role that uses it (same shape as `Repositories`). */
export interface Services {
  admin: { teachers: AdminTeacherService; students: AdminStudentService; classes: AdminClassService };
  teacher: { auth: TeacherAuthService; sessions: TeacherSessionService; classes: TeacherClassService; chats: TeacherChatService; insights: TeacherInsightsService; problems: TeacherProblemService };
  student: { auth: StudentAuthService; sessions: StudentSessionService };
  shared: { profile: ProfileService; sessionStream: SessionStreamService; liveBoard: LiveBoardService; quizzes: QuizService; problems: SessionProblemService };
}

export interface ServiceOptions {
  bcryptCost: number;
  session: Partial<SessionOptions>;
  /** Where uploaded materials go. Defaults to "not configured" (uploads answer 503). */
  storage?: ObjectStorage;
}

export async function createServices(repositories: Repositories, tokens: TokenService, options: ServiceOptions): Promise<Services> {
  const credentials = await createCredentialChecker(tokens, { bcryptCost: options.bcryptCost });
  // one core, so teacher, student and stream share the same hub, timers and rules
  const core = createSessionCore(repositories.shared.sessions, createEventHub(), options.session);
  const liveBoard = createLiveBoardService(core, {
    findBoard: (id) => repositories.teacher.sessions.findBoard(id),
    saveBoard: (id, scene) => repositories.teacher.sessions.saveBoard(id, scene),
    findTeacherName: async (id) => (await repositories.shared.profile.findTeacherById(id))?.name ?? null,
  });

  return {
    admin: {
      teachers: createAdminTeacherService(repositories.admin.teachers, options),
      students: createAdminStudentService(repositories.admin.students, repositories.admin.classes, options),
      classes: createAdminClassService(repositories.admin.classes, repositories.admin.teachers),
    },
    teacher: {
      auth: createTeacherAuthService(repositories.teacher.auth, credentials),
      sessions: createTeacherSessionService(repositories.teacher.sessions, core, liveBoard),
      classes: createTeacherClassService(repositories.teacher.classes),
      chats: createTeacherChatService(repositories.teacher.chats, options.storage ?? createObjectStorage(null)),
      insights: createTeacherInsightsService(repositories.teacher.insights, core.options.now),
      problems: createTeacherProblemService(repositories.teacher.problems),
    },
    student: {
      auth: createStudentAuthService(repositories.student.auth, credentials),
      sessions: createStudentSessionService(repositories.student.sessions, core),
    },
    shared: {
      profile: createProfileService(repositories.shared.profile),
      sessionStream: createSessionStreamService(core, liveBoard),
      liveBoard,
      quizzes: createQuizService(core, repositories.shared.quizzes),
      problems: createSessionProblemService(core, repositories.shared.problems, repositories.teacher.problems),
    },
  };
}
