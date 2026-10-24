import { randomUUID } from "node:crypto";
import { hashPassword } from "../../src/lib/password.js";
import type { Repositories } from "../../src/repositories/index.js";
import type { Role } from "../../src/types/auth.types.js";
import type { ClassRow } from "../../src/types/shared/class.types.js";
import type { ParticipantRecord, SessionRecord } from "../../src/types/shared/session.types.js";
import type { ChatMaterialRow, ChatMessageRow, ChatRow, NewMaterial } from "../../src/types/teacher/chat.types.js";

export const PASSWORDS = {
  admin: "Admin-pass-1",
  teacher: "Teacher-pass-1",
  student: "Student-pass-1",
} as const;

export const IDS = {
  admin: "00000000-0000-4000-8000-000000000001",
  teacher: "00000000-0000-4000-8000-000000000002",
  student: "00000000-0000-4000-8000-000000000003",
  studentNoPassword: "00000000-0000-4000-8000-000000000004",
} as const;

/** Classes: KELAS7A (the teacher's), KELAS8B (another teacher's) and an archived one (the teacher's). */
export const CLASS = {
  id: "00000000-0000-4000-8000-0000000000c1",
  code: "KELAS7A",
  otherId: "00000000-0000-4000-8000-0000000000c2",
  otherCode: "KELAS8B",
  archivedId: "00000000-0000-4000-8000-0000000000c3",
  archivedCode: "LAMA2020",
  otherTeacherId: "00000000-0000-4000-8000-0000000000f1",
} as const;

/** Students of KELAS7A (siswa.satu has the id of IDS.student), plus one in KELAS8B. */
export const STUDENTS = {
  satu: { id: IDS.student, name: "Siswa Satu", username: "siswa.satu", classId: CLASS.id },
  dua: { id: "00000000-0000-4000-8000-0000000000a2", name: "Siswa Dua", username: "siswa.dua", classId: CLASS.id },
  tiga: { id: "00000000-0000-4000-8000-0000000000a3", name: "Siswa Tiga", username: "siswa.tiga", classId: CLASS.id },
  luar: { id: "00000000-0000-4000-8000-0000000000a4", name: "Siswa Luar", username: "siswa.luar", classId: CLASS.otherId },
} as const;

export interface TeacherData {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string | null;
  createdAt: Date;
}
export interface StudentData {
  id: string;
  username: string | null;
  name: string | null;
  role: Role;
  classId: string;
  passwordHash: string | null;
  createdAt: Date;
}
export interface ClassData {
  id: string;
  name: string;
  classCode: string;
  teacherId: string;
  archived: boolean;
  createdAt: Date;
}

export interface FakeDatabase {
  repositories: Repositories;
  teachersById: Map<string, TeacherData>;
  studentsById: Map<string, StudentData>;
  classesById: Map<string, ClassData>;
  sessions: Map<string, SessionRecord>;
  participants: Map<string, ParticipantRecord & { sessionId: string }>;
  /** Students that have learning records (attempts, ...). They cannot be deleted. */
  studentsWithRecords: Set<string>;
  /** Teachers that own other data (materials, packages). They cannot be deleted. */
  teachersWithData: Set<string>;
  chats: Map<string, ChatRow>;
  chatMessages: ChatMessageRow[];
  /** Materials by id, with the chat they were sent in and the storage key. */
  materials: Map<string, ChatMaterialRow & NewMaterial & { chatId: string }>;
  /** The queue: what the API would insert into `jobs`, in order. `notified` counts the NOTIFYs sent after a commit. */
  jobs: { type: "EXTRACT" | "CHAT_REPLY"; payload: Record<string, string>; status: "QUEUED" | "RUNNING" | "DONE" | "FAILED" }[];
  queue: { notified: number };
}

const CREATED = new Date("2026-01-01T00:00:00.000Z");
const includes = (text: string | null, search?: string) => !search || (text ?? "").toLowerCase().includes(search.toLowerCase());
const byNameThenId = <T extends { id: string }>(name: (item: T) => string | null) => (a: T, b: T) =>
  (name(a) ?? "").localeCompare(name(b) ?? "") || a.id.localeCompare(b.id);
const page = <T>(items: T[], limit: number, offset: number) => ({ items: items.slice(offset, offset + limit), total: items.length });

/**
 * In-memory stand-in for the whole database, behind the same repository interfaces as the Prisma ones
 * (same ordering, same uniqueness and "in use" rules), so every layer above can be tested without PostgreSQL.
 * Seeded with an admin, two teachers, three classes (one archived) and five students.
 */
export async function createFakeDatabase(): Promise<FakeDatabase> {
  const hash = async (password: string | null) => (password ? hashPassword(password, 4) : null);
  const studentHash = await hash(PASSWORDS.student);

  const teachersById = new Map<string, TeacherData>(
    (
      [
        { id: IDS.admin, email: "admin@example.com", name: "Admin", role: "ADMIN", passwordHash: await hash(PASSWORDS.admin), createdAt: CREATED },
        { id: IDS.teacher, email: "teacher@example.com", name: "Bu Guru", role: "TEACHER", passwordHash: await hash(PASSWORDS.teacher), createdAt: CREATED },
        { id: CLASS.otherTeacherId, email: "teacher2@example.com", name: "Pak Dua", role: "TEACHER", passwordHash: await hash(PASSWORDS.teacher), createdAt: CREATED },
      ] as TeacherData[]
    ).map((t) => [t.id, t]),
  );

  const classesById = new Map<string, ClassData>(
    (
      [
        { id: CLASS.id, name: "Kelas 7A", classCode: CLASS.code, teacherId: IDS.teacher, archived: false, createdAt: CREATED },
        { id: CLASS.otherId, name: "Kelas 8B", classCode: CLASS.otherCode, teacherId: CLASS.otherTeacherId, archived: false, createdAt: CREATED },
        { id: CLASS.archivedId, name: "Lama", classCode: CLASS.archivedCode, teacherId: IDS.teacher, archived: true, createdAt: CREATED },
      ] as ClassData[]
    ).map((c) => [c.id, c]),
  );

  const student = (id: string, username: string, name: string, classId: string, passwordHash: string | null): StudentData => ({
    id,
    username,
    name,
    role: "USER",
    classId,
    passwordHash,
    createdAt: CREATED,
  });
  const studentsById = new Map<string, StudentData>(
    [
      student(STUDENTS.satu.id, STUDENTS.satu.username, STUDENTS.satu.name, CLASS.id, studentHash),
      student(STUDENTS.dua.id, STUDENTS.dua.username, STUDENTS.dua.name, CLASS.id, studentHash),
      student(STUDENTS.tiga.id, STUDENTS.tiga.username, STUDENTS.tiga.name, CLASS.id, studentHash),
      student(STUDENTS.luar.id, STUDENTS.luar.username, STUDENTS.luar.name, CLASS.otherId, studentHash),
      student(IDS.studentNoPassword, "siswa.anon", "Anon", CLASS.otherId, null), // a student with no password set
    ].map((s) => [s.id, s]),
  );

  const sessions = new Map<string, SessionRecord>();
  const participants = new Map<string, ParticipantRecord & { sessionId: string }>();
  const studentsWithRecords = new Set<string>();
  const teachersWithData = new Set<string>();
  const chats = new Map<string, ChatRow>();
  const chatMessages: ChatMessageRow[] = [];
  const materials: FakeDatabase["materials"] = new Map();
  const jobs: FakeDatabase["jobs"] = [];
  const queue = { notified: 0 };
  const key = (sessionId: string, studentId: string) => `${sessionId}:${studentId}`;

  const accountOf = (t: { id: string; role: Role; name: string | null; passwordHash: string | null }) => ({
    id: t.id,
    role: t.role,
    name: t.name,
    passwordHash: t.passwordHash,
  });

  const classRow = (c: ClassData): ClassRow => ({
    id: c.id,
    name: c.name,
    classCode: c.classCode,
    teacherId: c.teacherId,
    teacherName: teachersById.get(c.teacherId)?.name ?? "",
    archived: c.archived,
    createdAt: c.createdAt,
    studentCount: [...studentsById.values()].filter((s) => s.classId === c.id).length,
  });
  const studentRow = (s: StudentData) => {
    const c = classesById.get(s.classId) as ClassData;
    return { id: s.id, username: s.username, name: s.name, classId: s.classId, className: c.name, classCode: c.classCode, createdAt: s.createdAt };
  };
  const teacherRow = (t: TeacherData) => ({
    id: t.id,
    email: t.email,
    name: t.name,
    createdAt: t.createdAt,
    classCount: [...classesById.values()].filter((c) => c.teacherId === t.id).length,
  });
  const participantRecord = ({ sessionId: _sessionId, ...p }: ParticipantRecord & { sessionId: string }): ParticipantRecord => {
    const s = studentsById.get(p.studentId);
    return { ...p, name: s?.name ?? p.name, username: s?.username ?? p.username };
  };
  const classHasSessions = (classId: string) => [...sessions.values()].some((s) => s.classId === classId);
  const classStudents = (classId: string) => [...studentsById.values()].filter((s) => s.classId === classId);
  const liveSessionIds = () => new Set([...sessions.values()].filter((s) => s.status !== "ENDED").map((s) => s.id));

  const repositories: Repositories = {
    admin: {
      teachers: {
        async list({ limit, offset, search }) {
          const rows = [...teachersById.values()]
            .filter((t) => t.role === "TEACHER" && (includes(t.name, search) || includes(t.email, search)))
            .sort(byNameThenId((t) => t.name));
          const result = page(rows, limit, offset);
          return { items: result.items.map(teacherRow), total: result.total };
        },
        async findById(id) {
          const t = teachersById.get(id);
          return t && t.role === "TEACHER" ? teacherRow(t) : null;
        },
        async create({ email, name, passwordHash }) {
          if ([...teachersById.values()].some((t) => t.email === email)) return "email_taken";
          const t: TeacherData = { id: randomUUID(), email, name, role: "TEACHER", passwordHash, createdAt: new Date() };
          teachersById.set(t.id, t);
          return teacherRow(t);
        },
        async update(id, patch) {
          const t = teachersById.get(id);
          if (!t || t.role !== "TEACHER") return null;
          if (patch.email && [...teachersById.values()].some((o) => o.id !== id && o.email === patch.email)) return "email_taken";
          Object.assign(t, patch);
          return teacherRow(t);
        },
        async delete(id) {
          const t = teachersById.get(id);
          if (!t || t.role !== "TEACHER") return "not_found";
          const inUse =
            teachersWithData.has(id) || [...classesById.values()].some((c) => c.teacherId === id) || [...sessions.values()].some((s) => s.teacherId === id);
          if (inUse) return "in_use";
          teachersById.delete(id);
          return "deleted";
        },
      },
      students: {
        async list({ limit, offset, classId, search }) {
          const rows = [...studentsById.values()]
            .filter((s) => (!classId || s.classId === classId) && (includes(s.name, search) || includes(s.username, search)))
            .sort(byNameThenId((s) => s.name));
          const result = page(rows, limit, offset);
          return { items: result.items.map(studentRow), total: result.total };
        },
        async findById(id) {
          const s = studentsById.get(id);
          return s ? studentRow(s) : null;
        },
        async create({ username, name, passwordHash, classId }) {
          if ([...studentsById.values()].some((s) => s.username === username)) return "username_taken";
          const s = student(randomUUID(), username, name, classId, passwordHash);
          s.createdAt = new Date();
          studentsById.set(s.id, s);
          return studentRow(s);
        },
        async update(id, patch) {
          const s = studentsById.get(id);
          if (!s) return null;
          if (patch.username && [...studentsById.values()].some((o) => o.id !== id && o.username === patch.username)) return "username_taken";
          Object.assign(s, patch);
          return studentRow(s);
        },
        async delete(id) {
          if (!studentsById.has(id)) return "not_found";
          if (studentsWithRecords.has(id)) return "in_use";
          studentsById.delete(id);
          for (const k of [...participants.keys()]) if (k.endsWith(`:${id}`)) participants.delete(k); // ON DELETE CASCADE
          return "deleted";
        },
        async isInLiveSession(studentId) {
          const live = liveSessionIds();
          return [...participants.values()].some((p) => p.studentId === studentId && !p.kickedAt && live.has(p.sessionId));
        },
      },
      classes: {
        async list({ limit, offset, teacherId, includeArchived, search }) {
          const rows = [...classesById.values()]
            .filter((c) => (!teacherId || c.teacherId === teacherId) && (includeArchived || !c.archived) && (includes(c.name, search) || includes(c.classCode, search)))
            .sort(byNameThenId((c) => c.name));
          const result = page(rows, limit, offset);
          return { items: result.items.map(classRow), total: result.total };
        },
        async findById(id) {
          const c = classesById.get(id);
          return c ? classRow(c) : null;
        },
        async listStudents(classId) {
          return classStudents(classId)
            .sort(byNameThenId((s) => s.name))
            .map((s) => ({ id: s.id, username: s.username, name: s.name }));
        },
        async create({ name, classCode, teacherId }) {
          if ([...classesById.values()].some((c) => c.classCode === classCode)) return "class_code_taken";
          const c: ClassData = { id: randomUUID(), name, classCode, teacherId, archived: false, createdAt: new Date() };
          classesById.set(c.id, c);
          return classRow(c);
        },
        async update(id, patch) {
          const c = classesById.get(id);
          if (!c) return null;
          Object.assign(c, patch);
          return classRow(c);
        },
        async delete(id) {
          if (!classesById.has(id)) return "not_found";
          if (classStudents(id).length > 0 || classHasSessions(id)) return "in_use";
          classesById.delete(id);
          return "deleted";
        },
        async hasLiveSession(classId) {
          return [...sessions.values()].some((s) => s.classId === classId && s.status !== "ENDED");
        },
      },
    },

    teacher: {
      auth: {
        async findByEmail(email) {
          const t = [...teachersById.values()].find((o) => o.email === email);
          return t ? accountOf(t) : null;
        },
      },
      classes: {
        async list(teacherId) {
          return [...classesById.values()]
            .filter((c) => !c.archived && (!teacherId || c.teacherId === teacherId))
            .sort(byNameThenId((c) => c.name))
            .map(classRow);
        },
        async findById(id) {
          const c = classesById.get(id);
          return c ? classRow(c) : null;
        },
        async listStudents(classId) {
          return classStudents(classId)
            .sort(byNameThenId((s) => s.name))
            .map((s) => ({ id: s.id, username: s.username, name: s.name }));
        },
      },
      chats: {
        async create(teacherId, title) {
          const chat = { id: randomUUID(), teacherId, title, createdAt: new Date(Date.now() + chats.size) };
          chats.set(chat.id, chat);
          return chat;
        },
        async list(teacherId) {
          return [...chats.values()]
            .filter((c) => !teacherId || c.teacherId === teacherId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        },
        async findById(id) {
          return chats.get(id) ?? null;
        },
        async listMessages(chatId, { limit, after }) {
          const all = chatMessages.filter((m) => m.chatId === chatId);
          if (!after) return all.slice(-limit);
          const index = all.findIndex((m) => m.id === after);
          return index === -1 ? [] : all.slice(index + 1, index + 1 + limit);
        },
        async listMaterials(chatId) {
          return [...materials.values()]
            .filter((m) => m.chatId === chatId)
            .map(({ id, title, fileType, status, error }) => ({ id, title, fileType, status, error }));
        },
        async hasPendingReply(chatId) {
          return jobs.some((j) => j.type === "CHAT_REPLY" && j.payload.chatId === chatId && (j.status === "QUEUED" || j.status === "RUNNING"));
        },
        async addMessage({ chatId, content, material }) {
          const message: ChatMessageRow = { id: randomUUID(), chatId, role: "USER", content, sources: null, createdAt: new Date(Date.now() + chatMessages.length) };
          chatMessages.push(message);
          let row: ChatMaterialRow | null = null;
          if (material) {
            row = { id: randomUUID(), title: material.title, fileType: material.fileType, status: "UPLOADED", error: null };
            materials.set(row.id, { ...row, ...material, chatId });
            jobs.push({ type: "EXTRACT", payload: { materialId: row.id }, status: "QUEUED" });
          }
          jobs.push({ type: "CHAT_REPLY", payload: { chatId, messageId: message.id }, status: "QUEUED" });
          queue.notified += 1;
          return { message, material: row };
        },
      },
      sessions: {
        async findClassroomByCode(code) {
          const c = [...classesById.values()].find((o) => o.classCode === code);
          return c ? { id: c.id, teacherId: c.teacherId, name: c.name, classCode: c.classCode, archived: c.archived } : null;
        },
        async listClassStudents(classId) {
          return classStudents(classId).map(({ id, name, username }) => ({ id, name, username }));
        },
        async findOpenSessionByClass(classId) {
          return [...sessions.values()].find((s) => s.classId === classId && s.status !== "ENDED") ?? null;
        },
        async listOpenSessions(teacherId) {
          return [...sessions.values()]
            .filter((s) => s.status !== "ENDED" && (!teacherId || s.teacherId === teacherId))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((session) => ({ session, className: classesById.get(session.classId)?.name ?? "" }));
        },
        async createSession(data) {
          if ([...sessions.values()].some((s) => s.joinCode === data.joinCode)) return null;
          const record: SessionRecord = {
            id: randomUUID(),
            classId: data.classId,
            teacherId: data.teacherId,
            joinCode: data.joinCode,
            status: "LOBBY",
            locked: false,
            startedAt: null,
            endedAt: null,
            expiresAt: data.expiresAt,
            createdAt: new Date(),
          };
          sessions.set(record.id, record);
          return record;
        },
      },
    },

    student: {
      auth: {
        async findByUsername(username) {
          const s = [...studentsById.values()].find((o) => o.username === username);
          return s ? accountOf(s) : null;
        },
      },
      sessions: {
        async findStudentClassId(studentId) {
          return studentsById.get(studentId)?.classId ?? null;
        },
        async findSessionByCode(code) {
          return [...sessions.values()].find((s) => s.joinCode === code) ?? null;
        },
        async addParticipant(sessionId, studentId, joinedAt) {
          const existing = participants.get(key(sessionId, studentId));
          if (existing) return participantRecord(existing);
          const s = studentsById.get(studentId);
          const row = { sessionId, studentId, name: s?.name ?? null, username: s?.username ?? null, joinedAt, leftAt: null, kickedAt: null };
          participants.set(key(sessionId, studentId), row);
          return participantRecord(row);
        },
      },
    },

    shared: {
      profile: {
        async findTeacherById(id) {
          const t = teachersById.get(id);
          return t ? accountOf(t) : null;
        },
        async findStudentById(id) {
          const s = studentsById.get(id);
          return s ? accountOf(s) : null;
        },
      },
      sessions: {
        async findSessionById(id) {
          return sessions.get(id) ?? null;
        },
        async updateSession(id, patch) {
          const current = sessions.get(id);
          if (!current) throw new Error("no such session");
          const updated = { ...current, ...patch };
          sessions.set(id, updated);
          return updated;
        },
        async listParticipants(sessionId) {
          return [...participants.values()]
            .filter((p) => p.sessionId === sessionId)
            .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
            .map(participantRecord);
        },
        async findParticipant(sessionId, studentId) {
          const row = participants.get(key(sessionId, studentId));
          return row ? participantRecord(row) : null;
        },
        async updateParticipant(sessionId, studentId, patch) {
          const row = participants.get(key(sessionId, studentId));
          if (!row) throw new Error("no such participant");
          Object.assign(row, patch);
          return participantRecord(row);
        },
      },
    },
  };

  return { repositories, teachersById, studentsById, classesById, sessions, participants, studentsWithRecords, teachersWithData, chats, chatMessages, materials, jobs, queue };
}
