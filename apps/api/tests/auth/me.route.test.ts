import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTokenService } from "../../src/lib/token.js";
import { buildTestApp } from "../helpers/app.js";
import { TEST_SECRET } from "../helpers/config.js";
import { IDS, PASSWORDS } from "../helpers/fake-repository.js";
import { PATHS, loginStudent, loginTeacher } from "../helpers/requests.js";

describe("GET /api/v1/auth/me", () => {
  describe("success", () => {
    it("returns the teacher for a token obtained from login", async () => {
      const { app } = await buildTestApp();
      const login = await loginTeacher(app, "teacher@example.com", PASSWORDS.teacher);
      const res = await request(app).get(PATHS.me).set("Authorization", `Bearer ${login.body.access_token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ user: { id: IDS.teacher, role: "TEACHER", name: "Bu Guru" } });
    });

    it("returns the student for a student token", async () => {
      const { app } = await buildTestApp();
      const login = await loginStudent(app, "siswa.satu", PASSWORDS.student);
      const res = await request(app).get(PATHS.me).set("Authorization", `Bearer ${login.body.access_token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("USER");
    });
  });

  describe("failure: not authenticated (401)", () => {
    it("rejects a request without a token", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(PATHS.me);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("unauthenticated");
    });

    it("rejects a garbage token", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(PATHS.me).set("Authorization", "Bearer garbage");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("invalid_token");
    });

    it("rejects an expired token", async () => {
      const { app } = await buildTestApp();
      const expired = createTokenService({ secret: TEST_SECRET, ttlSeconds: -5 }).sign({
        userId: IDS.teacher,
        role: "TEACHER",
        kind: "teacher",
      });
      const res = await request(app).get(PATHS.me).set("Authorization", `Bearer ${expired}`);
      expect(res.status).toBe(401);
    });

    it("rejects a valid token whose account was deleted afterwards", async () => {
      const { app, repository, tokens } = await buildTestApp();
      const token = tokens.sign({ userId: IDS.teacher, role: "TEACHER", kind: "teacher" });
      repository.teachersById.delete(IDS.teacher);

      const res = await request(app).get(PATHS.me).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
    });
  });
});
