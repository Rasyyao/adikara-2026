import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { IDS, PASSWORDS } from "../helpers/fake-repository.js";
import { PATHS, loginStudent, loginTeacher } from "../helpers/requests.js";

describe("POST /api/v1/auth/login (admin and teacher)", () => {
  describe("success", () => {
    it("teacher logs in and receives a bearer token with the user", async () => {
      const { app } = await buildTestApp();
      const res = await loginTeacher(app, "teacher@example.com", PASSWORDS.teacher);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        token_type: "Bearer",
        expires_in: 3600,
        user: { id: IDS.teacher, role: "TEACHER", name: "Bu Guru" },
      });
      expect(typeof res.body.access_token).toBe("string");
    });

    it("admin logs in through the same endpoint and gets role ADMIN", async () => {
      const { app } = await buildTestApp();
      const res = await loginTeacher(app, "admin@example.com", PASSWORDS.admin);

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("ADMIN");
    });

    it("treats the email case-insensitively", async () => {
      const { app } = await buildTestApp();
      const res = await loginTeacher(app, "  TEACHER@Example.com ", PASSWORDS.teacher);
      expect(res.status).toBe(200);
    });

    it("never returns the password or its hash", async () => {
      const { app } = await buildTestApp();
      const res = await loginTeacher(app, "teacher@example.com", PASSWORDS.teacher);
      expect(res.text).not.toMatch(/\$2[aby]\$|password/i);
    });
  });

  describe("failure: wrong credentials (401)", () => {
    it("rejects a wrong password", async () => {
      const { app } = await buildTestApp();
      const res = await loginTeacher(app, "teacher@example.com", "wrong-pass-1");

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: "invalid_credentials", message: "Invalid credentials" } });
    });

    it("answers an unknown email exactly like a wrong password", async () => {
      const { app } = await buildTestApp();
      const wrongPassword = await loginTeacher(app, "teacher@example.com", "wrong-pass-1");
      const unknownEmail = await loginTeacher(app, "ghost@example.com", "wrong-pass-1");

      expect(unknownEmail.status).toBe(wrongPassword.status);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });
  });

  describe("failure: invalid request (400, 413)", () => {
    it("rejects an invalid email and names the field", async () => {
      const { app } = await buildTestApp();
      const res = await loginTeacher(app, "not-an-email", "x");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
      expect(res.body.error.details.fields).toHaveProperty("email");
    });

    it("rejects a missing password and names the field", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(PATHS.teacherLogin).send({ email: "teacher@example.com" });

      expect(res.status).toBe(400);
      expect(res.body.error.details.fields).toHaveProperty("password");
    });

    it("rejects malformed JSON", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(PATHS.teacherLogin).set("Content-Type", "application/json").send("{bad json");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("invalid_json");
    });

    it("rejects an oversized body", async () => {
      const { app } = await buildTestApp();
      const res = await loginTeacher(app, "a@b.co", "x".repeat(20_000));

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("payload_too_large");
    });

    it("rejects operator objects instead of strings (NoSQL-style injection)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(PATHS.teacherLogin).send({ email: { $ne: "" }, password: { $ne: "" } });
      expect(res.status).toBe(400);
    });

    it("does not accept a student username in the email field", async () => {
      const { app } = await buildTestApp();
      const res = await loginTeacher(app, "siswa.satu", PASSWORDS.student);
      expect(res.status).toBe(400);
    });
  });

  describe("failure: wrong method (404)", () => {
    it("GET on the login path is not routed", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).get(PATHS.teacherLogin)).status).toBe(404);
    });
  });

  describe("isolation from student accounts", () => {
    it("a student's own login still works independently", async () => {
      const { app } = await buildTestApp();
      expect((await loginStudent(app, "siswa.satu", PASSWORDS.student)).status).toBe(200);
    });
  });
});
