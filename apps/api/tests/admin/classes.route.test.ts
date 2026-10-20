import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { ADMIN_PATHS, UNKNOWN_ID, asAdmin } from "../helpers/admin.js";
import { CLASS, IDS, STUDENTS } from "../helpers/fake-database.js";
import { TEACHER_AUTH, auth, createSession, studentAuth } from "../helpers/sessions.js";

const NEW_CLASS = { name: "Kelas 7B", class_code: "KELAS7B", teacher_id: IDS.teacher };

describe("admin · classes (/api/v1/admin/classes)", () => {
  describe("create", () => {
    it("creates a class for a teacher (201); the class code is stored in upper case", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.classes).set(asAdmin).send({ ...NEW_CLASS, class_code: "kelas7b" });

      expect(res.status).toBe(201);
      expect(res.body.class).toMatchObject({
        name: "Kelas 7B",
        class_code: "KELAS7B",
        teacher: { id: IDS.teacher, name: "Bu Guru" },
        archived: false,
        student_count: 0,
      });
    });

    it("the assigned teacher can then start a session for it", async () => {
      const { app } = await buildTestApp();
      await request(app).post(ADMIN_PATHS.classes).set(asAdmin).send(NEW_CLASS);
      expect((await createSession(app, TEACHER_AUTH, "KELAS7B")).code).toMatch(/^\d{6}$/);
    });

    it("rejects a class code that is already used (409)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.classes).set(asAdmin).send({ ...NEW_CLASS, class_code: CLASS.code });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("class_code_taken");
    });

    it("cannot be given to a teacher that does not exist (404 teacher_not_found)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.classes).set(asAdmin).send({ ...NEW_CLASS, teacher_id: UNKNOWN_ID });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("teacher_not_found");
    });

    it("cannot be given to an admin account (404 teacher_not_found)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.classes).set(asAdmin).send({ ...NEW_CLASS, teacher_id: IDS.admin });
      expect(res.status).toBe(404);
    });

    it.each([
      [{ ...NEW_CLASS, name: "" }, "name"],
      [{ ...NEW_CLASS, class_code: "a" }, "class_code"],
      [{ ...NEW_CLASS, class_code: "has space" }, "class_code"],
      [{ ...NEW_CLASS, teacher_id: "nope" }, "teacher_id"],
      [{ name: "x", class_code: "ABC" }, "teacher_id"],
    ])("rejects %j (400, field %s)", async (body, field) => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.classes).set(asAdmin).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields).toHaveProperty(field);
    });
  });

  describe("read", () => {
    it("lists active classes with their teacher and student count; archived ones are hidden by default", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(ADMIN_PATHS.classes).set(asAdmin);

      expect(res.body.total).toBe(2);
      const seven = res.body.items.find((c: { class_code: string }) => c.class_code === "KELAS7A");
      expect(seven).toMatchObject({ student_count: 3, teacher: { id: IDS.teacher } });
    });

    it("include_archived=true adds the archived class", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(`${ADMIN_PATHS.classes}?include_archived=true`).set(asAdmin);
      expect(res.body.items.map((c: { class_code: string }) => c.class_code)).toContain("LAMA2020");
    });

    it("filters by teacher and searches by name or code", async () => {
      const { app } = await buildTestApp();
      const byTeacher = await request(app).get(`${ADMIN_PATHS.classes}?teacher_id=${CLASS.otherTeacherId}`).set(asAdmin);
      expect(byTeacher.body.items.map((c: { class_code: string }) => c.class_code)).toEqual(["KELAS8B"]);
      const search = await request(app).get(`${ADMIN_PATHS.classes}?q=7a`).set(asAdmin);
      expect(search.body.items.map((c: { class_code: string }) => c.class_code)).toEqual(["KELAS7A"]);
    });

    it.each(["teacher_id=nope", "include_archived=maybe", "limit=0"])("rejects ?%s (400)", async (query) => {
      const { app } = await buildTestApp();
      expect((await request(app).get(`${ADMIN_PATHS.classes}?${query}`).set(asAdmin)).status).toBe(400);
    });

    it("reads one class with its students", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(ADMIN_PATHS.class(CLASS.id)).set(asAdmin);
      expect(res.body.class.class_code).toBe("KELAS7A");
      expect(res.body.students.map((s: { username: string }) => s.username)).toEqual(["siswa.dua", "siswa.satu", "siswa.tiga"]);
    });

    it("an unknown class is 404 and a malformed id is 400", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).get(ADMIN_PATHS.class(UNKNOWN_ID)).set(asAdmin)).status).toBe(404);
      expect((await request(app).get(ADMIN_PATHS.class("nope")).set(asAdmin)).status).toBe(400);
    });
  });

  describe("update: rename, hand over to another teacher, archive", () => {
    it("renames a class", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).patch(ADMIN_PATHS.class(CLASS.id)).set(asAdmin).send({ name: "Kelas 7 Alpha" });
      expect(res.body.class).toMatchObject({ name: "Kelas 7 Alpha", class_code: "KELAS7A" });
    });

    it("assigns the class to another teacher: the new teacher can run sessions, the old one cannot", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).patch(ADMIN_PATHS.class(CLASS.id)).set(asAdmin).send({ teacher_id: CLASS.otherTeacherId });
      expect(res.body.class.teacher.id).toBe(CLASS.otherTeacherId);

      const old = await request(app).post("/api/v1/sessions").set(auth(TEACHER_AUTH)).send({ class_code: "KELAS7A" });
      expect(old.status).toBe(404);
    });

    it("assigning to a teacher that does not exist is 404 and changes nothing", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).patch(ADMIN_PATHS.class(CLASS.id)).set(asAdmin).send({ teacher_id: UNKNOWN_ID });
      expect(res.status).toBe(404);
      expect((await request(app).get(ADMIN_PATHS.class(CLASS.id)).set(asAdmin)).body.class.teacher.id).toBe(IDS.teacher);
    });

    it("archives and restores a class", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.class(CLASS.otherId)).set(asAdmin).send({ archived: true })).body.class.archived).toBe(true);
      expect((await request(app).patch(ADMIN_PATHS.class(CLASS.otherId)).set(asAdmin).send({ archived: false })).body.class.archived).toBe(false);
    });

    it("is refused while the class has a live session (409 class_has_live_session), for handover and archive alike", async () => {
      const { app } = await buildTestApp();
      await createSession(app);
      for (const body of [{ teacher_id: CLASS.otherTeacherId }, { archived: true }]) {
        const res = await request(app).patch(ADMIN_PATHS.class(CLASS.id)).set(asAdmin).send(body);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("class_has_live_session");
      }
    });

    it("renaming is still fine during a live session", async () => {
      const { app } = await buildTestApp();
      await createSession(app);
      expect((await request(app).patch(ADMIN_PATHS.class(CLASS.id)).set(asAdmin).send({ name: "Baru" })).status).toBe(200);
    });

    it("the class code cannot be changed (400)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).patch(ADMIN_PATHS.class(CLASS.id)).set(asAdmin).send({ class_code: "OTHER" });
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields).toHaveProperty("class_code");
    });

    it.each([{}, { name: "" }, { archived: "yes" }, { teacher_id: "nope" }])("rejects %j (400)", async (body) => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.class(CLASS.id)).set(asAdmin).send(body)).status).toBe(400);
    });

    it("an unknown class is 404", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.class(UNKNOWN_ID)).set(asAdmin).send({ name: "x" })).status).toBe(404);
    });
  });

  describe("delete", () => {
    it("deletes an empty class (204)", async () => {
      const { app } = await buildTestApp();
      const created = await request(app).post(ADMIN_PATHS.classes).set(asAdmin).send(NEW_CLASS);
      expect((await request(app).delete(ADMIN_PATHS.class(created.body.class.id)).set(asAdmin)).status).toBe(204);
      expect((await request(app).get(ADMIN_PATHS.class(created.body.class.id)).set(asAdmin)).status).toBe(404);
    });

    it("refuses a class with students (409 class_in_use) and reports how many", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).delete(ADMIN_PATHS.class(CLASS.id)).set(asAdmin);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: "class_in_use", details: { student_count: 3 } });
    });

    it("refuses an empty class that has session history", async () => {
      const { app, db } = await buildTestApp();
      const { id } = await createSession(app);
      await request(app).post(`/api/v1/sessions/${id}/end`).set(auth(TEACHER_AUTH));
      for (const s of [STUDENTS.satu, STUDENTS.dua, STUDENTS.tiga]) db.studentsById.delete(s.id);
      expect((await request(app).delete(ADMIN_PATHS.class(CLASS.id)).set(asAdmin)).status).toBe(409);
    });

    it("an unknown class is 404", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).delete(ADMIN_PATHS.class(UNKNOWN_ID)).set(asAdmin)).status).toBe(404);
    });
  });

  describe("who may call it", () => {
    it("teachers and students get 403, no token gets 401", async () => {
      const { app } = await buildTestApp();
      for (const headers of [auth(TEACHER_AUTH), auth(studentAuth("satu"))]) {
        expect((await request(app).get(ADMIN_PATHS.classes).set(headers)).status).toBe(403);
        expect((await request(app).post(ADMIN_PATHS.classes).set(headers).send(NEW_CLASS)).status).toBe(403);
        expect((await request(app).patch(ADMIN_PATHS.class(CLASS.id)).set(headers).send({ name: "x" })).status).toBe(403);
        expect((await request(app).delete(ADMIN_PATHS.class(CLASS.id)).set(headers)).status).toBe(403);
      }
      expect((await request(app).get(ADMIN_PATHS.classes)).status).toBe(401);
    });
  });
});
