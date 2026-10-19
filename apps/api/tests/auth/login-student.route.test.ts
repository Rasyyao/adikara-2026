import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { IDS, PASSWORDS } from "../helpers/fake-repository.js";
import { loginStudent, loginTeacher } from "../helpers/requests.js";

describe("POST /api/v1/auth/student/login", () => {
  describe("success", () => {
    it("student logs in and receives a USER token", async () => {
      const { app } = await buildTestApp();
      const res = await loginStudent(app, "siswa.satu", PASSWORDS.student);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({ id: IDS.student, role: "USER", name: "Siswa Satu" });
      expect(res.body.token_type).toBe("Bearer");
    });

    it("treats the username case-insensitively", async () => {
      const { app } = await buildTestApp();
      expect((await loginStudent(app, " Siswa.Satu ", PASSWORDS.student)).status).toBe(200);
    });
  });

  describe("failure: wrong credentials (401)", () => {
    it("rejects a wrong password", async () => {
      const { app } = await buildTestApp();
      const res = await loginStudent(app, "siswa.satu", "wrong-pass-1");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("invalid_credentials");
    });

    it("rejects an unknown username with the same body as a wrong password", async () => {
      const { app } = await buildTestApp();
      const wrongPassword = await loginStudent(app, "siswa.satu", "wrong-pass-1");
      const unknownUser = await loginStudent(app, "ghost", "wrong-pass-1");

      expect(unknownUser.status).toBe(401);
      expect(unknownUser.body).toEqual(wrongPassword.body);
    });

    it("rejects a student account that has no password set", async () => {
      const { app } = await buildTestApp();
      expect((await loginStudent(app, "siswa.anon", "anything-1")).status).toBe(401);
    });
  });

  describe("failure: invalid request (400)", () => {
    it("rejects an invalid username and names the field", async () => {
      const { app } = await buildTestApp();
      const res = await loginStudent(app, "a b", "x");

      expect(res.status).toBe(400);
      expect(res.body.error.details.fields).toHaveProperty("username");
    });

    it("does not accept a teacher email as username", async () => {
      const { app } = await buildTestApp();
      const res = await loginStudent(app, "teacher@example.com", PASSWORDS.teacher);
      expect(res.status).toBe(400);
    });
  });

  describe("isolation from teacher accounts", () => {
    it("teacher login still works independently", async () => {
      const { app } = await buildTestApp();
      expect((await loginTeacher(app, "teacher@example.com", PASSWORDS.teacher)).status).toBe(200);
    });
  });
});
