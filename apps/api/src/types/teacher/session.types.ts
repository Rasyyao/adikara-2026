import type { SessionRecord } from "../shared/session.types.js";

export interface ClassroomRecord {
  id: string;
  teacherId: string;
  name: string;
  classCode: string;
  archived: boolean;
}

export interface ClassStudentRecord {
  id: string;
  name: string | null;
  username: string | null;
}

export interface OpenSessionRecord {
  session: SessionRecord;
  className: string;
}

/** A whiteboard scene (Excalidraw): its elements and the few app settings worth keeping. */
export interface BoardScene {
  elements: Record<string, unknown>[];
  appState: { viewBackgroundColor?: string };
}

export interface BoardRecord {
  scene: BoardScene;
  updatedAt: Date;
}

/** What a teacher (or admin) needs to start a session and read attendance. */
export interface TeacherSessionRepository {
  findClassroomByCode(classCode: string): Promise<ClassroomRecord | null>;
  listClassStudents(classId: string): Promise<ClassStudentRecord[]>;
  /** The class's session that is not ENDED, if any. */
  findOpenSessionByClass(classId: string): Promise<SessionRecord | null>;
  /** Sessions that are not ENDED, newest first. A teacher id limits it to that teacher's sessions; without one it lists all. */
  listOpenSessions(teacherId?: string): Promise<OpenSessionRecord[]>;
  /** Returns null when the PIN is already used by another open session (so the caller can try another). */
  findBoard(sessionId: string): Promise<BoardRecord | null>;
  /** Replaces the session's whiteboard (the latest save wins). */
  saveBoard(sessionId: string, scene: BoardScene): Promise<BoardRecord>;
  createSession(data: { classId: string; teacherId: string; joinCode: string; expiresAt: Date; chatId?: string | null }): Promise<SessionRecord | null>;
}
