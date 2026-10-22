import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
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

describe("GET /api/v1/sessions?status=live (my live sessions)", () => {
  it("lists nothing when the teacher has no live session", async () => {
    const { app } = await buildTestApp();
    const res = await request(app).get(SESSION_PATHS.live).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it("returns the session with its class name, PIN and how many students are in", async () => {
    const { app } = await buildTestApp();
    const { id, code } = await createSession(app);
    await joinSession(app, code, "satu");
    await joinSession(app, code, "dua");

    const res = await request(app).get(SESSION_PATHS.live).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      class_name: "Kelas 7A",
      joined_count: 2,
      session: { id, join_code: code, status: "LOBBY" },
    });
  });

  it("shows the status ACTIVE after the session starts", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));

    const res = await request(app).get(SESSION_PATHS.live).set(auth(TEACHER_AUTH));
    expect(res.body.items[0].session).toMatchObject({ status: "ACTIVE" });
    expect(res.body.items[0].session.started_at).not.toBeNull();
  });

  it("leaves out ended sessions", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));

    const res = await request(app).get(SESSION_PATHS.live).set(auth(TEACHER_AUTH));
    expect(res.body.items).toEqual([]);
  });

  it("closes and leaves out a session past its expiry", async () => {
    let now = new Date("2026-01-01T10:00:00.000Z");
    const { app } = await buildTestApp({ sessionOptions: { now: () => now, ttlMs: 60_000 } });
    await createSession(app);
    now = new Date("2026-01-01T10:05:00.000Z");

    const res = await request(app).get(SESSION_PATHS.live).set(auth(TEACHER_AUTH));
    expect(res.body.items).toEqual([]);
  });

  it("a teacher sees only their own sessions; an admin sees all", async () => {
    const { app } = await buildTestApp();
    await createSession(app); // KELAS7A, owned by the teacher
    await createSession(app, ADMIN_AUTH, "KELAS8B"); // owned by the other teacher

    const mine = await request(app).get(SESSION_PATHS.live).set(auth(TEACHER_AUTH));
    expect(mine.body.items.map((i: { class_name: string }) => i.class_name)).toEqual(["Kelas 7A"]);

    const theirs = await request(app).get(SESSION_PATHS.live).set(auth(OTHER_TEACHER_AUTH));
    expect(theirs.body.items.map((i: { class_name: string }) => i.class_name)).toEqual(["Kelas 8B"]);

    const all = await request(app).get(SESSION_PATHS.live).set(auth(ADMIN_AUTH));
    expect(all.body.items).toHaveLength(2);
  });

  describe("rejections", () => {
    it("401 without a token", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).get(SESSION_PATHS.live)).status).toBe(401);
    });

    it("403 for a student", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(SESSION_PATHS.live).set(auth(studentAuth("satu")));
      expect(res.status).toBe(403);
    });

    it.each(["/api/v1/sessions", "/api/v1/sessions?status=ended", "/api/v1/sessions?status="])("400 for %s", async (path) => {
      const { app } = await buildTestApp();
      const res = await request(app).get(path).set(auth(TEACHER_AUTH));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    });
  });
});
