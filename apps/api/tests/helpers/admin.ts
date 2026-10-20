import request from "supertest";
import type { Express } from "express";
import { ADMIN_AUTH, auth } from "./sessions.js";

export const ADMIN_PATHS = {
  teachers: "/api/v1/admin/teachers",
  teacher: (id: string) => `/api/v1/admin/teachers/${id}`,
  students: "/api/v1/admin/students",
  student: (id: string) => `/api/v1/admin/students/${id}`,
  classes: "/api/v1/admin/classes",
  class: (id: string) => `/api/v1/admin/classes/${id}`,
} as const;

export const UNKNOWN_ID = "00000000-0000-4000-8000-00000000dead";

export const asAdmin = auth(ADMIN_AUTH);

export const NEW_TEACHER = { email: "pak.budi@example.com", name: "Pak Budi", password: "Guru-pass-123" };

export async function createTeacher(app: Express, body: Record<string, unknown> = NEW_TEACHER) {
  const res = await request(app).post(ADMIN_PATHS.teachers).set(asAdmin).send(body);
  if (res.status !== 201) throw new Error(`createTeacher failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.teacher as { id: string; email: string; name: string };
}
