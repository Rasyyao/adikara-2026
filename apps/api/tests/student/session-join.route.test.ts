import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { STUDENTS } from "../helpers/fake-session-repository.js";
import { SESSION_PATHS, TEACHER_AUTH, auth, createSession, joinSession, studentAuth } from "../helpers/sessions.js";

describe("POST /api/v1/sessions/join (student enters the PIN)", () => {
  describe("success", () => {
    it("a student of the class joins and is recorded", async () => {
      const { app, sessionRepository } = await buildTestApp();
      const { id, code } = await createSession(app);

      const res = await joinSession(app, code);

      expect(res.status).toBe(200);
      expect(res.body.session).toMatchObject({ id, status: "LOBBY", locked: false });
      expect(res.body.session).not.toHaveProperty("join_code");
      expect(res.body.participant).toMatchObject({ student_id: STUDENTS.satu.id, name: "Siswa Satu", state: "joined" });
      expect([...sessionRepository.participants.values()]).toHaveLength(1);
    });

    it("joining twice (refresh, second tab) keeps one record", async () => {
      const { app, sessionRepository } = await buildTestApp();
      const { code } = await createSession(app);
      await joinSession(app, code);
      const again = await joinSession(app, code);

      expect(again.status).toBe(200);
      expect(sessionRepository.participants.size).toBe(1);
    });

    it("a student who joined can come back after the session is locked", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code);
      await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: true });

      expect((await joinSession(app, code)).status).toBe(200);
    });

    it("students can still join after the teacher pressed Start", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));

      const res = await joinSession(app, code, "dua");
      expect(res.status).toBe(200);
      expect(res.body.session.status).toBe("ACTIVE");
    });

    it("trims spaces around the PIN", async () => {
      const { app } = await buildTestApp();
      const { code } = await createSession(app);
      const res = await request(app).post(SESSION_PATHS.join).set(auth(studentAuth("satu"))).send({ code: ` ${code} ` });
      expect(res.status).toBe(200);
    });
  });

  describe("failure", () => {
    it("rejects a request without a token (401)", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).post(SESSION_PATHS.join).send({ code: "123456" })).status).toBe(401);
    });

    it("rejects a teacher (403): only students join", async () => {
      const { app } = await buildTestApp();
      const { code } = await createSession(app);
      const res = await request(app).post(SESSION_PATHS.join).set(auth(TEACHER_AUTH)).send({ code });
      expect(res.status).toBe(403);
    });

    it("a PIN that does not exist is 404 session_not_found", async () => {
      const { app } = await buildTestApp();
      const res = await joinSession(app, "000000");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("session_not_found");
    });

    it("an ended session's PIN is 404, the same answer as an unknown PIN", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));

      const res = await joinSession(app, code);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("session_not_found");
    });

    it("an expired session's PIN is 404 and the session is closed", async () => {
      let now = new Date("2026-01-01T10:00:00.000Z");
      const { app, sessionRepository } = await buildTestApp({ sessionOptions: { now: () => now, ttlMs: 60_000 } });
      const { id, code } = await createSession(app);
      now = new Date("2026-01-01T11:00:00.000Z");

      expect((await joinSession(app, code)).status).toBe(404);
      expect(sessionRepository.sessions.get(id)).toMatchObject({ status: "ENDED", joinCode: null });
    });

    it("a student of another class gets 403 not_in_class", async () => {
      const { app, sessionRepository } = await buildTestApp();
      const { code } = await createSession(app);
      const res = await joinSession(app, code, "luar");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("not_in_class");
      expect(sessionRepository.participants.size).toBe(0);
    });

    it("a new student cannot join a locked session (403 session_locked)", async () => {
      const { app, sessionRepository } = await buildTestApp();
      const { id, code } = await createSession(app);
      await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: true });

      const res = await joinSession(app, code, "dua");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("session_locked");
      expect(sessionRepository.participants.size).toBe(0);
    });

    it("a removed student cannot join again (403 kicked)", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code);
      await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.satu.id)).set(auth(TEACHER_AUTH));

      const res = await joinSession(app, code);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("kicked");
    });

    it("a token of a student who no longer exists is 401", async () => {
      const { app } = await buildTestApp();
      const { code } = await createSession(app);
      const ghost = { userId: "00000000-0000-4000-8000-0000000000ff", role: "USER", kind: "student" } as const;
      const res = await request(app).post(SESSION_PATHS.join).set(auth(ghost)).send({ code });
      expect(res.status).toBe(401);
    });

    it.each([{}, { code: "12345" }, { code: "abcdef" }, { code: 123456 }, { code: null }])("rejects the body %j (400)", async (body) => {
      const { app } = await buildTestApp();
      const res = await request(app).post(SESSION_PATHS.join).set(auth(studentAuth("satu"))).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields).toHaveProperty("code");
    });
  });

  describe("brute-force protection", () => {
    it("answers 429 after too many attempts, counted per student", async () => {
      const { app } = await buildTestApp({ config: { joinRateLimitMax: 3 } });
      for (let i = 0; i < 3; i += 1) expect((await joinSession(app, "000000")).status).toBe(404);

      const blocked = await joinSession(app, "000000");
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("too_many_requests");

      // another student has their own counter
      expect((await joinSession(app, "000000", "dua")).status).toBe(404);
    });
  });
});
