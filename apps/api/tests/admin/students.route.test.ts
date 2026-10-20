import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { ADMIN_PATHS, UNKNOWN_ID, asAdmin } from "../helpers/admin.js";
import { CLASS, IDS, PASSWORDS, STUDENTS } from "../helpers/fake-database.js";
import { loginStudent } from "../helpers/requests.js";
import { TEACHER_AUTH, auth, createSession, joinSession, studentAuth } from "../helpers/sessions.js";

const NEW_STUDENT = { username: "siswa.baru", name: "Siswa Baru", password: "Siswa-pass-123", class_id: CLASS.id };

describe("admin · students (/api/v1/admin/students)", () => {
  describe("create", () => {
    it("creates a student in a class (201) who can then log in", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.students).set(asAdmin).send(NEW_STUDENT);

      expect(res.status).toBe(201);
      expect(res.body.student).toMatchObject({
        username: "siswa.baru",
        name: "Siswa Baru",
        class: { id: CLASS.id, name: "Kelas 7A", class_code: "KELAS7A" },
      });
      expect((await loginStudent(app, "siswa.baru", "Siswa-pass-123")).status).toBe(200);
    });

    it("never returns the password or its hash", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.students).set(asAdmin).send(NEW_STUDENT);
      expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);
    });

    it("the new student can join their class's session, and no other class's", async () => {
      const { app } = await buildTestApp();
      const own = await createSession(app);
      await request(app).post(ADMIN_PATHS.students).set(asAdmin).send(NEW_STUDENT);
      const login = await loginStudent(app, "siswa.baru", "Siswa-pass-123");
      const join = await request(app)
        .post("/api/v1/sessions/join")
        .set({ Authorization: `Bearer ${login.body.access_token}` })
        .send({ code: own.code });
      expect(join.status).toBe(200);
    });

    it("lower-cases the username", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.students).set(asAdmin).send({ ...NEW_STUDENT, username: "  Siswa.BARU " });
      expect(res.body.student.username).toBe("siswa.baru");
    });

    it("rejects a username that is already used (409)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.students).set(asAdmin).send({ ...NEW_STUDENT, username: "siswa.satu" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("username_taken");
    });

    it("rejects a class that does not exist (404 class_not_found)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.students).set(asAdmin).send({ ...NEW_STUDENT, class_id: UNKNOWN_ID });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("class_not_found");
    });

    it("rejects an archived class (409 class_archived)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.students).set(asAdmin).send({ ...NEW_STUDENT, class_id: CLASS.archivedId });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("class_archived");
    });

    it.each([
      [{ ...NEW_STUDENT, username: "ab" }, "username"],
      [{ ...NEW_STUDENT, username: "has space" }, "username"],
      [{ ...NEW_STUDENT, name: "" }, "name"],
      [{ ...NEW_STUDENT, password: "short1" }, "password"],
      [{ ...NEW_STUDENT, class_id: "nope" }, "class_id"],
      [{ username: "siswa.baru", name: "x", password: "Siswa-pass-123" }, "class_id"],
    ])("rejects %j (400, field %s)", async (body, field) => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.students).set(asAdmin).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields).toHaveProperty(field);
    });
  });

  describe("read", () => {
    it("lists all students with their class", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(ADMIN_PATHS.students).set(asAdmin);
      expect(res.body.total).toBe(5);
      expect(res.body.items.find((s: { username: string }) => s.username === "siswa.luar").class.class_code).toBe("KELAS8B");
    });

    it("filters by class and searches by name or username", async () => {
      const { app } = await buildTestApp();
      const byClass = await request(app).get(`${ADMIN_PATHS.students}?class_id=${CLASS.id}`).set(asAdmin);
      expect(byClass.body.total).toBe(3);
      const search = await request(app).get(`${ADMIN_PATHS.students}?q=tiga`).set(asAdmin);
      expect(search.body.items.map((s: { username: string }) => s.username)).toEqual(["siswa.tiga"]);
    });

    it("pages", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(`${ADMIN_PATHS.students}?limit=2&offset=4`).set(asAdmin);
      expect(res.body).toMatchObject({ total: 5, limit: 2, offset: 4 });
      expect(res.body.items).toHaveLength(1);
    });

    it.each(["class_id=nope", "limit=1000"])("rejects ?%s (400)", async (query) => {
      const { app } = await buildTestApp();
      expect((await request(app).get(`${ADMIN_PATHS.students}?${query}`).set(asAdmin)).status).toBe(400);
    });

    it("reads one student; unknown is 404; malformed is 400", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).get(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin)).body.student.username).toBe("siswa.satu");
      expect((await request(app).get(ADMIN_PATHS.student(UNKNOWN_ID)).set(asAdmin)).status).toBe(404);
      expect((await request(app).get(ADMIN_PATHS.student("nope")).set(asAdmin)).status).toBe(400);
    });
  });

  describe("update", () => {
    it("changes the name", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ name: "Satu Baru" });
      expect(res.body.student).toMatchObject({ name: "Satu Baru", username: "siswa.satu" });
    });

    it("resets the password", async () => {
      const { app } = await buildTestApp();
      await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ password: "Brand-new-pass-9" });
      expect((await loginStudent(app, "siswa.satu", PASSWORDS.student)).status).toBe(401);
      expect((await loginStudent(app, "siswa.satu", "Brand-new-pass-9")).status).toBe(200);
    });

    it("renames the username, but not to one that is taken (409)", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ username: "satu.baru" })).status).toBe(200);
      expect((await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ username: "siswa.dua" })).status).toBe(409);
    });

    it("moves a student to another class", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ class_id: CLASS.otherId });
      expect(res.status).toBe(200);
      expect(res.body.student.class).toMatchObject({ id: CLASS.otherId, class_code: "KELAS8B" });
    });

    it("moving to the class they are already in is a no-op, not an error", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ class_id: CLASS.id })).status).toBe(200);
    });

    it("cannot move to a class that does not exist (404) or is archived (409); the student stays put", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ class_id: UNKNOWN_ID })).status).toBe(404);
      expect((await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ class_id: CLASS.archivedId })).status).toBe(409);
      expect((await request(app).get(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin)).body.student.class.id).toBe(CLASS.id);
    });

    it("cannot move a student who is in a live session (409), but can after it ended", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");

      const blocked = await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ class_id: CLASS.otherId });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe("student_in_live_session");

      await request(app).post(`/api/v1/sessions/${id}/end`).set(auth(TEACHER_AUTH));
      expect((await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ class_id: CLASS.otherId })).status).toBe(200);
    });

    it("a student who was removed from the live session does not block the move", async () => {
      const { app } = await buildTestApp();
      const { id, code } = await createSession(app);
      await joinSession(app, code, "satu");
      await request(app).delete(`/api/v1/sessions/${id}/participants/${STUDENTS.satu.id}`).set(auth(TEACHER_AUTH));
      expect((await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ class_id: CLASS.otherId })).status).toBe(200);
    });

    it("sending the class the student is already in is fine even during a live session", async () => {
      const { app } = await buildTestApp();
      const { code } = await createSession(app);
      await joinSession(app, code, "satu");
      expect((await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ class_id: CLASS.id })).status).toBe(200);
    });

    it("other changes are allowed during a live session", async () => {
      const { app } = await buildTestApp();
      const { code } = await createSession(app);
      await joinSession(app, code, "satu");
      expect((await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ name: "Baru" })).status).toBe(200);
    });

    it.each([{}, { username: "ab" }, { name: "" }, { password: "weak" }, { class_id: "nope" }, { role: "ADMIN" }])("rejects %j (400)", async (body) => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send(body)).status).toBe(400);
    });

    it("an unknown student is 404", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.student(UNKNOWN_ID)).set(asAdmin).send({ name: "x" })).status).toBe(404);
    });
  });

  describe("delete", () => {
    it("deletes a student (204) who can no longer log in", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).delete(ADMIN_PATHS.student(STUDENTS.tiga.id)).set(asAdmin)).status).toBe(204);
      expect((await request(app).get(ADMIN_PATHS.student(STUDENTS.tiga.id)).set(asAdmin)).status).toBe(404);
      expect((await loginStudent(app, "siswa.tiga", PASSWORDS.student)).status).toBe(401);
    });

    it("deletes the student's attendance rows with them", async () => {
      const { app, db } = await buildTestApp();
      const { code } = await createSession(app);
      await joinSession(app, code, "satu");
      await request(app).delete(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin);
      expect(db.participants.size).toBe(0);
    });

    it("refuses a student with learning records (409 student_in_use)", async () => {
      const { app, db } = await buildTestApp();
      db.studentsWithRecords.add(STUDENTS.satu.id);
      const res = await request(app).delete(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("student_in_use");
    });

    it("an unknown student is 404", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).delete(ADMIN_PATHS.student(UNKNOWN_ID)).set(asAdmin)).status).toBe(404);
    });
  });

  describe("who may call it", () => {
    it("teachers and students get 403 on every endpoint, no token gets 401", async () => {
      const { app } = await buildTestApp();
      const id = IDS.student;
      for (const headers of [auth(TEACHER_AUTH), auth(studentAuth("satu"))]) {
        expect((await request(app).get(ADMIN_PATHS.students).set(headers)).status).toBe(403);
        expect((await request(app).post(ADMIN_PATHS.students).set(headers).send(NEW_STUDENT)).status).toBe(403);
        expect((await request(app).get(ADMIN_PATHS.student(id)).set(headers)).status).toBe(403);
        expect((await request(app).patch(ADMIN_PATHS.student(id)).set(headers).send({ class_id: CLASS.otherId })).status).toBe(403);
        expect((await request(app).delete(ADMIN_PATHS.student(id)).set(headers)).status).toBe(403);
      }
      expect((await request(app).get(ADMIN_PATHS.students)).status).toBe(401);
    });

    it("a student cannot move themselves to another class", async () => {
      const { app, db } = await buildTestApp();
      await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(auth(studentAuth("satu"))).send({ class_id: CLASS.otherId });
      expect(db.studentsById.get(STUDENTS.satu.id)?.classId).toBe(CLASS.id);
    });
  });
});
