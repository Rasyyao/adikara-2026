import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { STUDENTS } from "../helpers/fake-session-repository.js";
import { openStream, type OpenStream } from "../helpers/sse.js";
import {
  ADMIN_AUTH,
  OTHER_TEACHER_AUTH,
  SESSION_PATHS,
  TEACHER_AUTH,
  auth,
  createSession,
  joinSession,
  studentAuth,
} from "../helpers/sessions.js";

const open: OpenStream[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((stream) => stream.close()));
});

async function stream(app: Parameters<typeof openStream>[0], id: string, as = TEACHER_AUTH) {
  const s = await openStream(app, SESSION_PATHS.events(id), auth(as));
  open.push(s);
  return s;
}

describe("GET /sessions/:id/events (Server-Sent Events)", () => {
  describe("connection", () => {
    it("answers 200 text/event-stream with no-cache headers", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      const teacher = await stream(app, id);

      expect(teacher.status).toBe(200);
      expect(teacher.headers.get("content-type")).toMatch(/^text\/event-stream/);
      expect(teacher.headers.get("cache-control")).toMatch(/no-cache/);
    });

    it("the teacher's first event is a snapshot with the PIN and the people already in", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");

      const teacher = await stream(app, id);
      const snapshot = await teacher.next();

      expect(snapshot.type).toBe("snapshot");
      expect(snapshot.data.session).toMatchObject({ id, status: "LOBBY", join_code: code });
      expect(snapshot.data.participants.map((p: { username: string }) => p.username)).toEqual(["siswa.satu"]);
    });

    it("a student's snapshot has the count but not the names of classmates, and no PIN", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      await joinSession(app, code, "dua");

      const student = await stream(app, id, studentAuth("satu"));
      const snapshot = await student.next();

      expect(snapshot.type).toBe("snapshot");
      expect(snapshot.data).toEqual({
        session: { id, class_id: expect.any(String), status: "LOBBY", locked: false, started_at: null },
        participant_count: 2,
      });
    });

    it("an admin can follow any session", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      const admin = await stream(app, id, ADMIN_AUTH);
      expect((await admin.next()).type).toBe("snapshot");
    });
  });

  describe("events", () => {
    it("the teacher sees a student join, with the new head count", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      const teacher = await stream(app, id);
      await teacher.next(); // snapshot

      await joinSession(app, code, "satu");
      const event = await teacher.next();

      expect(event.type).toBe("participant_joined");
      expect(event.data).toMatchObject({ student_id: STUDENTS.satu.id, name: "Siswa Satu", state: "joined", participant_count: 1 });
    });

    it("joining twice sends only one participant_joined", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      const teacher = await stream(app, id);
      await teacher.next();

      await joinSession(app, code, "satu");
      await joinSession(app, code, "satu");
      await joinSession(app, code, "dua");

      expect((await teacher.next()).data.student_id).toBe(STUDENTS.satu.id);
      expect((await teacher.next()).data.student_id).toBe(STUDENTS.dua.id);
      expect(teacher.received.filter((e) => e.type === "participant_joined")).toHaveLength(2);
    });

    it("students never receive who else joined", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      const student = await stream(app, id, studentAuth("satu"));
      await student.next();

      await joinSession(app, code, "dua");
      await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));

      expect((await student.next()).type).toBe("session_started"); // the first thing is the start, not the join
    });

    it("Start reaches the teacher and the students", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      const teacher = await stream(app, id);
      const student = await stream(app, id, studentAuth("satu"));
      await teacher.next();
      await student.next();

      await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));

      for (const s of [teacher, student]) {
        const event = await s.next();
        expect(event.type).toBe("session_started");
        expect(event.data.started_at).toEqual(expect.any(String));
      }
    });

    it("lock and unlock reach everyone", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      const student = await stream(app, id, studentAuth("satu"));
      await student.next();

      await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: true });
      await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: false });

      expect((await student.next()).type).toBe("session_locked");
      expect((await student.next()).type).toBe("session_unlocked");
    });

    it("locking when already locked sends nothing new", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      const teacher = await stream(app, id);
      await teacher.next();

      await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: true });
      await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: true });
      await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));

      expect((await teacher.next()).type).toBe("session_locked");
      expect((await teacher.next()).type).toBe("session_started");
    });

    it("End tells everyone and then the server closes the streams", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      const teacher = await stream(app, id);
      const student = await stream(app, id, studentAuth("satu"));
      await teacher.next();
      await student.next();

      await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));

      expect((await teacher.next()).type).toBe("session_ended");
      expect((await student.next()).type).toBe("session_ended");
      await Promise.all([teacher.closed, student.closed]);
    });

    it("Kick tells the student, closes only their stream, and tells the teacher", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      await joinSession(app, code, "dua");
      const teacher = await stream(app, id);
      const kicked = await stream(app, id, studentAuth("satu"));
      const other = await stream(app, id, studentAuth("dua"));
      await teacher.next();
      await kicked.next();
      await other.next();

      await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.satu.id)).set(auth(TEACHER_AUTH));

      expect((await kicked.next()).type).toBe("kicked");
      await kicked.closed;
      const left = await teacher.next();
      expect(left.type).toBe("participant_left");
      expect(left.data).toEqual({ student_id: STUDENTS.satu.id, reason: "kicked" });

      await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
      expect((await other.next()).type).toBe("session_started"); // still connected, and never saw "kicked"
    });

    it("a student who drops and does not come back is reported as left after the grace period", async () => {
      const { app } = await buildTestApp({ sessionOptions: { presenceGraceMs: 30 } });
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      const teacher = await stream(app, id);
      const student = await stream(app, id, studentAuth("satu"));
      await teacher.next();
      await student.next();

      await student.close();

      const left = await teacher.next();
      expect(left.type).toBe("participant_left");
      expect(left.data).toEqual({ student_id: STUDENTS.satu.id, reason: "disconnected" });
    });
  });

  describe("an ended session", () => {
    it("sends the snapshot (status ENDED, no PIN) and closes at once", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));

      const teacher = await stream(app, id);
      const snapshot = await teacher.next();

      expect(snapshot.data.session).toMatchObject({ status: "ENDED", join_code: null });
      await teacher.closed;
    });
  });

  describe("failure", () => {
    it("401 without a token", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      const s = await openStream(app, SESSION_PATHS.events(id));
      open.push(s);
      expect(s.status).toBe(401);
    });

    it("404 for another teacher", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      const s = await stream(app, id, OTHER_TEACHER_AUTH);
      expect(s.status).toBe(404);
      expect(s.body.error.code).toBe("session_not_found");
    });

    it("403 not_joined for a student who has not entered the PIN", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      const s = await stream(app, id, studentAuth("satu"));
      expect(s.status).toBe(403);
      expect(s.body.error.code).toBe("not_joined");
    });

    it("403 for a student of another class even if they know the id", async () => {
      const { app } = await buildTestApp();
      const { id } = await createSession(app);
      const s = await stream(app, id, studentAuth("luar"));
      expect(s.status).toBe(403);
    });

    it("403 kicked for a removed student", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.satu.id)).set(auth(TEACHER_AUTH));

      const s = await stream(app, id, studentAuth("satu"));
      expect(s.status).toBe(403);
      expect(s.body.error.code).toBe("kicked");
    });

    it("404 for an unknown session and 400 for a malformed id", async () => {
      const { app } = await buildTestApp();
      expect((await stream(app, "00000000-0000-4000-8000-00000000dead")).status).toBe(404);
      expect((await stream(app, "nope")).status).toBe(400);
    });
  });
});
