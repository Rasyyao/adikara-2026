import request from "supertest";
import type { Express } from "express";
import type { AuthContext } from "../../src/types/auth.types.js";
import { IDS } from "./fake-repository.js";
import { STUDENTS } from "./fake-session-repository.js";
import { bearer } from "./identities.js";

export const SESSION_PATHS = {
  create: "/api/v1/sessions",
  live: "/api/v1/sessions?status=live",
  join: "/api/v1/sessions/join",
  one: (id: string) => `/api/v1/sessions/${id}`,
  board: (id: string) => `/api/v1/sessions/${id}/board`,
  material: (id: string) => `/api/v1/sessions/${id}/material`,
  start: (id: string) => `/api/v1/sessions/${id}/start`,
  lock: (id: string) => `/api/v1/sessions/${id}/lock`,
  end: (id: string) => `/api/v1/sessions/${id}/end`,
  kick: (id: string, studentId: string) => `/api/v1/sessions/${id}/participants/${studentId}`,
  attendance: (id: string) => `/api/v1/sessions/${id}/attendance`,
  events: (id: string) => `/api/v1/sessions/${id}/events`,
} as const;

/** The teacher who owns KELAS7A, another teacher, an admin, and the students (ids match the fake repositories). */
export const TEACHER_AUTH: AuthContext = { userId: IDS.teacher, role: "TEACHER", kind: "teacher" };
export const OTHER_TEACHER_AUTH: AuthContext = {
  userId: "00000000-0000-4000-8000-0000000000f1",
  role: "TEACHER",
  kind: "teacher",
};
export const ADMIN_AUTH: AuthContext = { userId: IDS.admin, role: "ADMIN", kind: "teacher" };

type StudentKey = keyof typeof STUDENTS;
export const studentAuth = (key: StudentKey): AuthContext => ({ userId: STUDENTS[key].id, role: "USER", kind: "student" });

export const auth = (context: AuthContext) => ({ Authorization: bearer(context) });

/** Teacher creates a session for KELAS7A; returns its id and PIN. */
export async function createSession(app: Express, as: AuthContext = TEACHER_AUTH, classCode = "KELAS7A") {
  const res = await request(app).post(SESSION_PATHS.create).set(auth(as)).send({ class_code: classCode });
  if (res.status !== 201) throw new Error(`createSession failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.session.id as string, code: res.body.session.join_code as string };
}

export function joinSession(app: Express, code: string, student: StudentKey = "satu") {
  return request(app).post(SESSION_PATHS.join).set(auth(studentAuth(student))).send({ code });
}
