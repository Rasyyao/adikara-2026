import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { STUDENTS } from "../helpers/fake-session-repository.js";
import {
  OTHER_TEACHER_AUTH,
  SESSION_PATHS,
  TEACHER_AUTH,
  auth,
  createSession,
  joinSession,
  studentAuth,
} from "../helpers/sessions.js";

const statusOf = (body: { students: { username: string; status: string }[] }, username: string) =>
  body.students.find((s) => s.username === username)?.status;

describe("GET /sessions/:id/attendance", () => {
  describe("success", () => {
    it("lists every student of the class, absent ones included", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");

      const res = await request(app).get(SESSION_PATHS.attendance(id)).set(auth(TEACHER_AUTH));

      expect(res.status).toBe(200);
      expect(res.body.students.map((s: { username: string }) => s.username)).toEqual(["siswa.dua", "siswa.satu", "siswa.tiga"]);
      expect(statusOf(res.body, "siswa.satu")).toBe("present");
      expect(statusOf(res.body, "siswa.dua")).toBe("absent");
      expect(res.body.summary).toEqual({ present: 1, late: 0, absent: 2, kicked: 0, total: 3 });
    });

    it("a student who joins after Start is late; one before Start is present", async () => {
      let now = new Date("2026-01-01T10:00:00.000Z");
      const { app } = await buildTestApp({ sessionOptions: { now: () => now } });
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");

      now = new Date("2026-01-01T10:05:00.000Z");
      await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
      now = new Date("2026-01-01T10:06:00.000Z");
      await joinSession(app, code, "dua");

      const res = await request(app).get(SESSION_PATHS.attendance(id)).set(auth(TEACHER_AUTH));
      expect(statusOf(res.body, "siswa.satu")).toBe("present");
      expect(statusOf(res.body, "siswa.dua")).toBe("late");
      expect(res.body.summary).toMatchObject({ present: 1, late: 1, absent: 1 });
    });

    it("a removed student is listed as kicked, not present", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.satu.id)).set(auth(TEACHER_AUTH));

      const res = await request(app).get(SESSION_PATHS.attendance(id)).set(auth(TEACHER_AUTH));
      expect(statusOf(res.body, "siswa.satu")).toBe("kicked");
      expect(res.body.summary.kicked).toBe(1);
    });

    it("students of other classes never appear", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      const res = await request(app).get(SESSION_PATHS.attendance(id)).set(auth(TEACHER_AUTH));
      expect(statusOf(res.body, "siswa.luar")).toBeUndefined();
    });

    it("still works after the session ended", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));

      const res = await request(app).get(SESSION_PATHS.attendance(id)).set(auth(TEACHER_AUTH));
      expect(res.status).toBe(200);
      expect(res.body.summary.present).toBe(1);
    });

    it("the summary numbers add up to the total", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      await joinSession(app, code, "dua");
      const { summary } = (await request(app).get(SESSION_PATHS.attendance(id)).set(auth(TEACHER_AUTH))).body;
      expect(summary.present + summary.late + summary.absent + summary.kicked).toBe(summary.total);
    });
  });

  describe("failure", () => {
    it("401 without a token", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      expect((await request(app).get(SESSION_PATHS.attendance(id))).status).toBe(401);
    });

    it("403 for a student", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      expect((await request(app).get(SESSION_PATHS.attendance(id)).set(auth(studentAuth("satu")))).status).toBe(403);
    });

    it("404 for another teacher", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      expect((await request(app).get(SESSION_PATHS.attendance(id)).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
    });
  });
});
