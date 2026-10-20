import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { STUDENTS } from "../helpers/fake-session-repository.js";
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

const UNKNOWN_ID = "00000000-0000-4000-8000-00000000dead";

describe("GET /sessions/:id", () => {
  it("lists the participants who joined, oldest first", async () => {
    const { app } = await buildTestApp();
    const { id, code } = await createSession(app);
    await joinSession(app, code, "satu");
    await joinSession(app, code, "dua");

    const res = await request(app).get(SESSION_PATHS.one(id)).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(id);
    expect(res.body.participants.map((p: { username: string }) => p.username)).toEqual(["siswa.satu", "siswa.dua"]);
  });

  it("an admin can read any session", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    expect((await request(app).get(SESSION_PATHS.one(id)).set(auth(ADMIN_AUTH))).status).toBe(200);
  });

  it("another teacher gets 404, not 403 (the session's existence is not revealed)", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    const res = await request(app).get(SESSION_PATHS.one(id)).set(auth(OTHER_TEACHER_AUTH));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("session_not_found");
  });

  it("a student gets 403", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    expect((await request(app).get(SESSION_PATHS.one(id)).set(auth(studentAuth("satu")))).status).toBe(403);
  });

  it("an unknown id is 404 and a malformed id is 400", async () => {
    const { app } = await buildTestApp();
    expect((await request(app).get(SESSION_PATHS.one(UNKNOWN_ID)).set(auth(TEACHER_AUTH))).status).toBe(404);
    const bad = await request(app).get(SESSION_PATHS.one("not-a-uuid")).set(auth(TEACHER_AUTH));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields).toHaveProperty("id");
  });

  it("without a token it is 401", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    expect((await request(app).get(SESSION_PATHS.one(id))).status).toBe(401);
  });
});

describe("POST /sessions/:id/start", () => {
  it("moves LOBBY to ACTIVE and stamps started_at", async () => {
    const now = new Date("2026-01-01T10:00:00.000Z");
    const { app } = await buildTestApp({ sessionOptions: { now: () => now } });
    const { id } = await createSession(app);

    const res = await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ status: "ACTIVE", started_at: now.toISOString() });
  });

  it("starting twice is 409 session_already_started", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
    const res = await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("session_already_started");
  });

  it("starting an ended session is 409 session_ended", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));
    const res = await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("session_ended");
  });

  it("another teacher cannot start it (404) and a student cannot (403)", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    expect((await request(app).post(SESSION_PATHS.start(id)).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
    expect((await request(app).post(SESSION_PATHS.start(id)).set(auth(studentAuth("satu")))).status).toBe(403);
  });

  it("an expired session cannot be started (409 session_ended)", async () => {
    let now = new Date("2026-01-01T10:00:00.000Z");
    const { app } = await buildTestApp({ sessionOptions: { now: () => now, ttlMs: 60_000 } });
    const { id } = await createSession(app);
    now = new Date("2026-01-01T12:00:00.000Z");
    const res = await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("session_ended");
  });
});

describe("POST /sessions/:id/lock", () => {
  it("locks and unlocks", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);

    const locked = await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: true });
    expect(locked.body.session.locked).toBe(true);

    const open = await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: false });
    expect(open.body.session.locked).toBe(false);
  });

  it("locking an already locked session is fine", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: true });
    const again = await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: true });
    expect(again.status).toBe(200);
  });

  it.each([{}, { locked: "yes" }, { locked: 1 }])("rejects the body %j (400)", async (body) => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    expect((await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send(body)).status).toBe(400);
  });

  it("an ended session cannot be locked (409)", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));
    expect((await request(app).post(SESSION_PATHS.lock(id)).set(auth(TEACHER_AUTH)).send({ locked: true })).status).toBe(409);
  });

  it("another teacher gets 404 and a student 403", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    expect((await request(app).post(SESSION_PATHS.lock(id)).set(auth(OTHER_TEACHER_AUTH)).send({ locked: true })).status).toBe(404);
    expect((await request(app).post(SESSION_PATHS.lock(id)).set(auth(studentAuth("satu"))).send({ locked: true })).status).toBe(403);
  });
});

describe("POST /sessions/:id/end", () => {
  it("ends the session, frees the PIN and returns the attendance", async () => {
    const now = new Date("2026-01-01T10:00:00.000Z");
    const { app, sessionRepository } = await buildTestApp({ sessionOptions: { now: () => now } });
    const { id, code } = await createSession(app);
    await joinSession(app, code, "satu");

    const res = await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));

    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ status: "ENDED", join_code: null, ended_at: now.toISOString() });
    expect(res.body.attendance.summary).toEqual({ present: 1, late: 0, absent: 2, kicked: 0, total: 3 });
    expect(sessionRepository.sessions.get(id)?.joinCode).toBeNull();
  });

  it("ending twice is 409 session_ended", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));
    const res = await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("session_ended");
  });

  it("another teacher gets 404 and a student 403", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    expect((await request(app).post(SESSION_PATHS.end(id)).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
    expect((await request(app).post(SESSION_PATHS.end(id)).set(auth(studentAuth("satu")))).status).toBe(403);
  });
});

describe("DELETE /sessions/:id/participants/:studentId (kick)", () => {
  it("marks the student kicked and left", async () => {
    const { app } = await buildTestApp();
    const { id, code } = await createSession(app);
    await joinSession(app, code, "satu");

    const res = await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.satu.id)).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(200);
    expect(res.body.participant).toMatchObject({ student_id: STUDENTS.satu.id, state: "kicked" });
    expect(res.body.participant.kicked_at).not.toBeNull();
    expect(res.body.participant.left_at).not.toBeNull();
  });

  it("kicking again is fine", async () => {
    const { app } = await buildTestApp();
    const { id, code } = await createSession(app);
    await joinSession(app, code, "satu");
    await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.satu.id)).set(auth(TEACHER_AUTH));
    expect((await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.satu.id)).set(auth(TEACHER_AUTH))).status).toBe(200);
  });

  it("a student who never joined is 404 participant_not_found", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    const res = await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.dua.id)).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("participant_not_found");
  });

  it("an ended session is 409", async () => {
    const { app } = await buildTestApp();
    const { id, code } = await createSession(app);
    await joinSession(app, code, "satu");
    await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));
    expect((await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.satu.id)).set(auth(TEACHER_AUTH))).status).toBe(409);
  });

  it("another teacher gets 404, a student 403, a malformed student id 400", async () => {
    const { app } = await buildTestApp();
    const { id, code } = await createSession(app);
    await joinSession(app, code, "satu");
    expect((await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.satu.id)).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
    expect((await request(app).delete(SESSION_PATHS.kick(id, STUDENTS.satu.id)).set(auth(studentAuth("dua")))).status).toBe(403);
    const bad = await request(app).delete(SESSION_PATHS.kick(id, "nope")).set(auth(TEACHER_AUTH));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields).toHaveProperty("studentId");
  });
});
