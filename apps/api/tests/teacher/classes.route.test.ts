import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { UNKNOWN_ID } from "../helpers/admin.js";
import { CLASS, STUDENTS } from "../helpers/fake-database.js";

const STUDENT_ID = { satu: STUDENTS.satu.id, tiga: STUDENTS.tiga.id, luar: STUDENTS.luar.id };
import { ADMIN_AUTH, OTHER_TEACHER_AUTH, TEACHER_AUTH, auth, createSession, joinSession, studentAuth } from "../helpers/sessions.js";

const LIST = "/api/v1/classes";
const ONE = (id: string) => `/api/v1/classes/${id}`;

describe("teacher · classes (/api/v1/classes)", () => {
  describe("success", () => {
    it("a teacher sees only the classes assigned to them (archived ones left out)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(LIST).set(auth(TEACHER_AUTH));

      expect(res.status).toBe(200);
      expect(res.body.items.map((c: { class_code: string }) => c.class_code)).toEqual(["KELAS7A"]);
      expect(res.body.items[0]).toMatchObject({ student_count: 3, teacher: { name: "Bu Guru" } });
    });

    it("another teacher sees their own class, not the first teacher's", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(LIST).set(auth(OTHER_TEACHER_AUTH));
      expect(res.body.items.map((c: { class_code: string }) => c.class_code)).toEqual(["KELAS8B"]);
    });

    it("an admin sees every active class", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(LIST).set(auth(ADMIN_AUTH));
      expect(res.body.items.map((c: { class_code: string }) => c.class_code).sort()).toEqual(["KELAS7A", "KELAS8B"]);
    });

    it("reads one class with its students, to get the class code for a live session", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(ONE(CLASS.id)).set(auth(TEACHER_AUTH));

      expect(res.status).toBe(200);
      expect(res.body.class.class_code).toBe("KELAS7A");
      expect(res.body.students.map((s: { username: string }) => s.username)).toEqual(["siswa.dua", "siswa.satu", "siswa.tiga"]);
    });

    it("an admin can read any class", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).get(ONE(CLASS.otherId)).set(auth(ADMIN_AUTH))).status).toBe(200);
    });

    it("never shows password hashes of the students", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(ONE(CLASS.id)).set(auth(TEACHER_AUTH));
      expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);
    });
  });

  describe("failure", () => {
    it("a class of another teacher is 404, the same as a missing one", async () => {
      const { app } = await buildTestApp();
      const foreign = await request(app).get(ONE(CLASS.otherId)).set(auth(TEACHER_AUTH));
      const missing = await request(app).get(ONE(UNKNOWN_ID)).set(auth(TEACHER_AUTH));
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual(missing.body);
    });

    it("a malformed id is 400", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).get(ONE("nope")).set(auth(TEACHER_AUTH))).status).toBe(400);
    });

    it("a student gets 403 and no token gets 401", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).get(LIST).set(auth(studentAuth("satu")))).status).toBe(403);
      expect((await request(app).get(ONE(CLASS.id)).set(auth(studentAuth("satu")))).status).toBe(403);
      expect((await request(app).get(LIST)).status).toBe(401);
    });
  });

  describe("manage classes", () => {
    it("creates a class owned by the teacher, with a made-up code when none is given", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(LIST).set(auth(TEACHER_AUTH)).send({ name: "  Kelas 7B " });

      expect(res.status).toBe(201);
      expect(res.body.class).toMatchObject({ name: "Kelas 7B", student_count: 0, teacher: { name: "Bu Guru" } });
      expect(res.body.class.class_code).toMatch(/^[A-Z2-9]{6}$/);
      const mine = await request(app).get(LIST).set(auth(TEACHER_AUTH));
      expect(mine.body.items.map((c: { name: string }) => c.name)).toContain("Kelas 7B");
      const others = await request(app).get(LIST).set(auth(OTHER_TEACHER_AUTH));
      expect(others.body.items.map((c: { name: string }) => c.name)).not.toContain("Kelas 7B");
    });

    it("takes a chosen class code (upper-cased) and refuses one already used", async () => {
      const { app } = await buildTestApp();
      const ok = await request(app).post(LIST).set(auth(TEACHER_AUTH)).send({ name: "X", class_code: "mine-1" });
      expect(ok.body.class.class_code).toBe("MINE-1");
      const taken = await request(app).post(LIST).set(auth(TEACHER_AUTH)).send({ name: "Y", class_code: "KELAS8B" });
      expect(taken.status).toBe(409);
      expect(taken.body.error.code).toBe("class_code_taken");
    });

    it("rejects an empty name and a bad class code", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).post(LIST).set(auth(TEACHER_AUTH)).send({ name: " " })).status).toBe(400);
      expect((await request(app).post(LIST).set(auth(TEACHER_AUTH)).send({ name: "A", class_code: "a b" })).status).toBe(400);
    });

    it("renames and archives a class, but never changes its code or owner", async () => {
      const { app } = await buildTestApp();
      const renamed = await request(app).patch(ONE(CLASS.id)).set(auth(TEACHER_AUTH)).send({ name: "Kelas 7 Baru" });
      expect(renamed.body.class).toMatchObject({ name: "Kelas 7 Baru", class_code: "KELAS7A" });
      expect((await request(app).patch(ONE(CLASS.id)).set(auth(TEACHER_AUTH)).send({ class_code: "ZZZ" })).status).toBe(400);
      expect((await request(app).patch(ONE(CLASS.id)).set(auth(TEACHER_AUTH)).send({ teacher_id: CLASS.otherTeacherId })).status).toBe(400);
      expect((await request(app).patch(ONE(CLASS.id)).set(auth(TEACHER_AUTH)).send({})).status).toBe(400);

      const archived = await request(app).patch(ONE(CLASS.id)).set(auth(TEACHER_AUTH)).send({ archived: true });
      expect(archived.body.class.archived).toBe(true);
      const list = await request(app).get(LIST).set(auth(TEACHER_AUTH));
      expect(list.body.items).toEqual([]);
    });

    it("cannot archive a class that has a live session", async () => {
      const { app } = await buildTestApp();
      await createSession(app);
      const res = await request(app).patch(ONE(CLASS.id)).set(auth(TEACHER_AUTH)).send({ archived: true });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("class_has_live_session");
    });

    it("deletes an empty class, and keeps one that still has students", async () => {
      const { app } = await buildTestApp();
      const made = await request(app).post(LIST).set(auth(TEACHER_AUTH)).send({ name: "Kosong" });
      expect((await request(app).delete(ONE(made.body.class.id)).set(auth(TEACHER_AUTH))).status).toBe(204);
      expect((await request(app).get(ONE(made.body.class.id)).set(auth(TEACHER_AUTH))).status).toBe(404);

      const full = await request(app).delete(ONE(CLASS.id)).set(auth(TEACHER_AUTH));
      expect(full.status).toBe(409);
      expect(full.body.error.code).toBe("class_in_use");
    });

    it("a teacher cannot rename, archive or delete another teacher's class", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ONE(CLASS.otherId)).set(auth(TEACHER_AUTH)).send({ name: "Hack" })).status).toBe(404);
      expect((await request(app).delete(ONE(CLASS.otherId)).set(auth(TEACHER_AUTH))).status).toBe(404);
      expect((await request(app).get(ONE(CLASS.otherId)).set(auth(OTHER_TEACHER_AUTH))).body.class.name).toBe("Kelas 8B");
    });

    it("a student cannot manage classes", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).post(LIST).set(auth(studentAuth("satu"))).send({ name: "x" })).status).toBe(403);
      expect((await request(app).delete(ONE(CLASS.id)).set(auth(studentAuth("satu")))).status).toBe(403);
    });
  });

  describe("manage students", () => {
    const STUDENTS = (id: string) => `${ONE(id)}/students`;
    const NEW = { username: "Siswa.Baru", name: "Siswa Baru", password: "Rahasia-123" };

    it("adds a student who can log in and join only their own class's session", async () => {
      const { app } = await buildTestApp();
      const made = await request(app).post(LIST).set(auth(TEACHER_AUTH)).send({ name: "Kelas Baru", class_code: "BARU1" });
      const classId = made.body.class.id as string;

      const added = await request(app).post(STUDENTS(classId)).set(auth(TEACHER_AUTH)).send(NEW);
      expect(added.status).toBe(201);
      expect(added.body.student).toMatchObject({ username: "siswa.baru", name: "Siswa Baru", class: { id: classId, class_code: "BARU1" } });
      expect(JSON.stringify(added.body)).not.toMatch(/password|\$2[aby]\$/i);

      const login = await request(app).post("/api/v1/auth/student/login").send({ username: "siswa.baru", password: NEW.password });
      expect(login.status).toBe(200);
      const studentHeader = { Authorization: `Bearer ${login.body.token ?? login.body.access_token}` };

      const { code } = await createSession(app, TEACHER_AUTH, "BARU1");
      const joined = await request(app).post("/api/v1/sessions/join").set(studentHeader).send({ code });
      expect(joined.status).toBe(200);

      // a student of the teacher's other class is turned away from this room
      const outsider = await joinSession(app, code, "satu");
      expect(outsider.status).toBe(403);
      expect(outsider.body.error.code).toBe("not_in_class");

      const detail = await request(app).get(ONE(classId)).set(auth(TEACHER_AUTH));
      expect(detail.body.students.map((s: { username: string }) => s.username)).toEqual(["siswa.baru"]);
    });

    it("rejects a duplicate username, a weak password and a bad username", async () => {
      const { app } = await buildTestApp();
      const dup = await request(app).post(STUDENTS(CLASS.id)).set(auth(TEACHER_AUTH)).send({ ...NEW, username: "siswa.satu" });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("username_taken");
      expect((await request(app).post(STUDENTS(CLASS.id)).set(auth(TEACHER_AUTH)).send({ ...NEW, password: "abc" })).status).toBe(400);
      expect((await request(app).post(STUDENTS(CLASS.id)).set(auth(TEACHER_AUTH)).send({ ...NEW, username: "a b" })).status).toBe(400);
    });

    it("cannot add a student to an archived or someone else's class", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).post(STUDENTS(CLASS.otherId)).set(auth(TEACHER_AUTH)).send(NEW)).status).toBe(404);
      expect((await request(app).post(STUDENTS(CLASS.archivedId)).set(auth(TEACHER_AUTH)).send(NEW)).status).toBe(409);
    });

    it("edits a student's name and password; the new password works", async () => {
      const { app } = await buildTestApp();
      const path = `${STUDENTS(CLASS.id)}/${STUDENT_ID.satu}`;
      const res = await request(app).patch(path).set(auth(TEACHER_AUTH)).send({ name: "Satu Baru", password: "Baru-12345" });
      expect(res.body.student.name).toBe("Satu Baru");
      const login = await request(app).post("/api/v1/auth/student/login").send({ username: "siswa.satu", password: "Baru-12345" });
      expect(login.status).toBe(200);
    });

    it("moves a student to another class of the same teacher, never to another teacher's", async () => {
      const { app } = await buildTestApp();
      const target = (await request(app).post(LIST).set(auth(TEACHER_AUTH)).send({ name: "Tujuan" })).body.class.id as string;
      const path = `${STUDENTS(CLASS.id)}/${STUDENT_ID.satu}`;

      expect((await request(app).patch(path).set(auth(TEACHER_AUTH)).send({ class_id: CLASS.otherId })).status).toBe(404);
      const moved = await request(app).patch(path).set(auth(TEACHER_AUTH)).send({ class_id: target });
      expect(moved.body.student.class.id).toBe(target);

      // the old class no longer has them, and the old path stops matching
      const old = await request(app).get(ONE(CLASS.id)).set(auth(TEACHER_AUTH));
      expect(old.body.students.map((s: { id: string }) => s.id)).not.toContain(STUDENT_ID.satu);
      expect((await request(app).patch(path).set(auth(TEACHER_AUTH)).send({ name: "x" })).status).toBe(404);

      // ... and a moved student can no longer enter the old class's room
      const { code } = await createSession(app);
      expect((await joinSession(app, code, "satu")).body.error.code).toBe("not_in_class");
    });

    it("cannot move or remove a student who is in a live session", async () => {
      const { app } = await buildTestApp();
      const { code } = await createSession(app);
      await joinSession(app, code, "satu");
      const path = `${STUDENTS(CLASS.id)}/${STUDENT_ID.satu}`;
      const target = (await request(app).post(LIST).set(auth(TEACHER_AUTH)).send({ name: "Tujuan" })).body.class.id as string;

      expect((await request(app).patch(path).set(auth(TEACHER_AUTH)).send({ class_id: target })).body.error.code).toBe("student_in_live_session");
      expect((await request(app).delete(path).set(auth(TEACHER_AUTH))).body.error.code).toBe("student_in_live_session");
    });

    it("removes a student", async () => {
      const { app } = await buildTestApp();
      const path = `${STUDENTS(CLASS.id)}/${STUDENT_ID.tiga}`;
      expect((await request(app).delete(path).set(auth(TEACHER_AUTH))).status).toBe(204);
      const detail = await request(app).get(ONE(CLASS.id)).set(auth(TEACHER_AUTH));
      expect(detail.body.students.map((s: { username: string }) => s.username)).toEqual(["siswa.dua", "siswa.satu"]);
      expect((await request(app).delete(path).set(auth(TEACHER_AUTH))).status).toBe(404);
    });

    it("another teacher cannot touch the students of this class", async () => {
      const { app } = await buildTestApp();
      const path = `${STUDENTS(CLASS.id)}/${STUDENT_ID.satu}`;
      expect((await request(app).patch(path).set(auth(OTHER_TEACHER_AUTH)).send({ name: "x" })).status).toBe(404);
      expect((await request(app).delete(path).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
    });

    it("a student of another class is 404 through this class's path", async () => {
      const { app } = await buildTestApp();
      const path = `${STUDENTS(CLASS.id)}/${STUDENT_ID.luar}`;
      expect((await request(app).delete(path).set(auth(TEACHER_AUTH))).status).toBe(404);
    });
  });
});
