import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { CLASS } from "../helpers/fake-session-repository.js";
import {
  ADMIN_AUTH,
  OTHER_TEACHER_AUTH,
  SESSION_PATHS,
  TEACHER_AUTH,
  auth,
  createSession,
  studentAuth,
} from "../helpers/sessions.js";

describe("POST /api/v1/sessions (start a live session)", () => {
  describe("success", () => {
    it("the class's teacher gets 201, status LOBBY and a 6-digit PIN", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(SESSION_PATHS.create).set(auth(TEACHER_AUTH)).send({ class_code: "KELAS7A" });

      expect(res.status).toBe(201);
      expect(res.body.session).toMatchObject({ class_id: CLASS.id, status: "LOBBY", locked: false, started_at: null });
      expect(res.body.session.join_code).toMatch(/^\d{6}$/);
      expect(res.body.participants).toEqual([]);
    });

    it("accepts the class code in lower case", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(SESSION_PATHS.create).set(auth(TEACHER_AUTH)).send({ class_code: "kelas7a" });
      expect(res.status).toBe(201);
    });

    it("an admin can start a session for any class (the session belongs to the class's teacher)", async () => {
      const { app, sessionRepository } = await buildTestApp();
      const { id } = await createSession(app, ADMIN_AUTH);
      expect(sessionRepository.sessions.get(id)?.teacherId).toBe(TEACHER_AUTH.userId);
    });

    it("expires_at is the configured lifetime after now", async () => {
      const now = new Date("2026-01-01T10:00:00.000Z");
      const { app } = await buildTestApp({ sessionOptions: { now: () => now, ttlMs: 2 * 60 * 60 * 1000 } });
      const res = await request(app).post(SESSION_PATHS.create).set(auth(TEACHER_AUTH)).send({ class_code: "KELAS7A" });
      expect(res.body.session.expires_at).toBe("2026-01-01T12:00:00.000Z");
    });

    it("a class can get a new session after the previous one ended", async () => {
      const { app } = await buildTestApp();
      const first = await createSession(app);
      await request(app).post(SESSION_PATHS.end(first.id)).set(auth(TEACHER_AUTH));
      const second = await createSession(app);
      expect(second.id).not.toBe(first.id);
    });

    it("draws another PIN when the first one belongs to a live session", async () => {
      const codes = ["111111", "111111", "222222"];
      const { app } = await buildTestApp({ sessionOptions: { generateCode: () => codes.shift() ?? "999999" } });
      const first = await createSession(app); // takes 111111 and stays live
      const second = await createSession(app, ADMIN_AUTH, "KELAS8B"); // draws 111111 (taken), then 222222

      expect(first.code).toBe("111111");
      expect(second.code).toBe("222222");
    });

    it("an ended session releases its PIN for the next session", async () => {
      const { app } = await buildTestApp({ sessionOptions: { generateCode: () => "111111" } });
      const first = await createSession(app);
      await request(app).post(SESSION_PATHS.end(first.id)).set(auth(TEACHER_AUTH));

      expect((await createSession(app, ADMIN_AUTH, "KELAS8B")).code).toBe("111111");
    });
  });

  describe("failure", () => {
    it("rejects a request without a token (401)", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).post(SESSION_PATHS.create).send({ class_code: "KELAS7A" })).status).toBe(401);
    });

    it("rejects a student (403)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(SESSION_PATHS.create).set(auth(studentAuth("satu"))).send({ class_code: "KELAS7A" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    });

    it("rejects another teacher's class as if it did not exist (404)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(SESSION_PATHS.create).set(auth(OTHER_TEACHER_AUTH)).send({ class_code: "KELAS7A" });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("class_not_found");
    });

    it("rejects an unknown class code (404)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(SESSION_PATHS.create).set(auth(TEACHER_AUTH)).send({ class_code: "NOPE999" });
      expect(res.status).toBe(404);
    });

    it("rejects an archived class (409)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(SESSION_PATHS.create).set(auth(TEACHER_AUTH)).send({ class_code: CLASS.archivedCode });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("class_archived");
    });

    it("rejects a second live session for the same class (409) and names the running one", async () => {
      const { app } = await buildTestApp();
      const first = await createSession(app);
      const res = await request(app).post(SESSION_PATHS.create).set(auth(TEACHER_AUTH)).send({ class_code: "KELAS7A" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("session_already_active");
      expect(res.body.error.details.session_id).toBe(first.id);
    });

    it("lets the expired session go and creates a new one", async () => {
      let now = new Date("2026-01-01T10:00:00.000Z");
      const { app } = await buildTestApp({ sessionOptions: { now: () => now, ttlMs: 60_000 } });
      const first = await createSession(app);
      now = new Date("2026-01-01T10:05:00.000Z");
      const second = await createSession(app);
      expect(second.id).not.toBe(first.id);
    });

    it.each([{}, { class_code: "" }, { class_code: "a b" }, { class_code: 5 }])("rejects the body %j (400)", async (body) => {
      const { app } = await buildTestApp();
      const res = await request(app).post(SESSION_PATHS.create).set(auth(TEACHER_AUTH)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    });

    it("gives up with 503 when no free PIN can be found", async () => {
      const { app } = await buildTestApp({ sessionOptions: { generateCode: () => "123456" } });
      await createSession(app); // takes 123456
      const res = await request(app).post(SESSION_PATHS.create).set(auth(ADMIN_AUTH)).send({ class_code: "KELAS8B" });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("join_code_unavailable");
    });
  });
});
