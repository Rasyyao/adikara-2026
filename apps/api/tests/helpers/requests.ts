import request from "supertest";
import type { Express } from "express";

export const PATHS = {
  teacherLogin: "/api/v1/auth/login",
  studentLogin: "/api/v1/auth/student/login",
  me: "/api/v1/auth/me",
} as const;

export function loginTeacher(app: Express, email: string, password: string) {
  return request(app).post(PATHS.teacherLogin).send({ email, password });
}

export function loginStudent(app: Express, username: string, password: string) {
  return request(app).post(PATHS.studentLogin).send({ username, password });
}
