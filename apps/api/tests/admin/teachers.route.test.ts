import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { ADMIN_PATHS, NEW_TEACHER, UNKNOWN_ID, asAdmin, createTeacher } from "../helpers/admin.js";
import { CLASS, IDS, PASSWORDS } from "../helpers/fake-database.js";
import { loginTeacher } from "../helpers/requests.js";
import { TEACHER_AUTH, auth, studentAuth } from "../helpers/sessions.js";

describe("admin · teachers (/api/v1/admin/teachers)", () => {
  describe("create", () => {
    it("creates a teacher (201) who can then log in", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.teachers).set(asAdmin).send(NEW_TEACHER);

      expect(res.status).toBe(201);
      expect(res.body.teacher).toMatchObject({ email: "pak.budi@example.com", name: "Pak Budi", role: "TEACHER", class_count: 0 });
      expect((await loginTeacher(app, NEW_TEACHER.email, NEW_TEACHER.password)).status).toBe(200);
    });

    it("never returns the password or its hash", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.teachers).set(asAdmin).send(NEW_TEACHER);
      expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);
    });

    it("normalizes the email (trim, lower case)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.teachers).set(asAdmin).send({ ...NEW_TEACHER, email: "  Pak.Budi@Example.COM " });
      expect(res.body.teacher.email).toBe("pak.budi@example.com");
    });

    it("rejects an email that is already used, by a teacher or an admin (409)", async () => {
      const { app } = await buildTestApp();
      for (const email of ["teacher@example.com", "admin@example.com"]) {
        const res = await request(app).post(ADMIN_PATHS.teachers).set(asAdmin).send({ ...NEW_TEACHER, email });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("email_taken");
      }
    });

    it.each([
      [{ ...NEW_TEACHER, email: "nope" }, "email"],
      [{ ...NEW_TEACHER, name: "" }, "name"],
      [{ ...NEW_TEACHER, password: "short1" }, "password"],
      [{ ...NEW_TEACHER, password: "onlyletters" }, "password"],
      [{ ...NEW_TEACHER, password: "12345678" }, "password"],
      [{ email: NEW_TEACHER.email }, "name"],
    ])("rejects %j (400, field %s)", async (body, field) => {
      const { app } = await buildTestApp();
      const res = await request(app).post(ADMIN_PATHS.teachers).set(asAdmin).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields).toHaveProperty(field);
    });
  });

  describe("read", () => {
    it("lists teachers only (never admin accounts), with how many classes each has", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(ADMIN_PATHS.teachers).set(asAdmin);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items.map((t: { email: string }) => t.email).sort()).toEqual(["teacher2@example.com", "teacher@example.com"]);
      expect(res.body.items.find((t: { id: string }) => t.id === IDS.teacher).class_count).toBe(2);
    });

    it("pages with limit and offset and reports the total", async () => {
      const { app } = await buildTestApp();
      const first = await request(app).get(`${ADMIN_PATHS.teachers}?limit=1`).set(asAdmin);
      const second = await request(app).get(`${ADMIN_PATHS.teachers}?limit=1&offset=1`).set(asAdmin);

      expect(first.body).toMatchObject({ total: 2, limit: 1, offset: 0 });
      expect(first.body.items).toHaveLength(1);
      expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    });

    it("searches by name or email", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(`${ADMIN_PATHS.teachers}?q=dua`).set(asAdmin);
      expect(res.body.items.map((t: { email: string }) => t.email)).toEqual(["teacher2@example.com"]);
    });

    it.each(["limit=0", "limit=101", "limit=abc", "offset=-1", `q=${"x".repeat(101)}`])("rejects ?%s (400)", async (query) => {
      const { app } = await buildTestApp();
      expect((await request(app).get(`${ADMIN_PATHS.teachers}?${query}`).set(asAdmin)).status).toBe(400);
    });

    it("reads one teacher", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get(ADMIN_PATHS.teacher(IDS.teacher)).set(asAdmin);
      expect(res.body.teacher).toMatchObject({ id: IDS.teacher, name: "Bu Guru", class_count: 2 });
    });

    it("an unknown id is 404, an admin account's id is 404 too, a malformed id is 400", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).get(ADMIN_PATHS.teacher(UNKNOWN_ID)).set(asAdmin)).status).toBe(404);
      const admin = await request(app).get(ADMIN_PATHS.teacher(IDS.admin)).set(asAdmin);
      expect(admin.status).toBe(404);
      expect(admin.body.error.code).toBe("teacher_not_found");
      expect((await request(app).get(ADMIN_PATHS.teacher("nope")).set(asAdmin)).status).toBe(400);
    });
  });

  describe("update", () => {
    it("changes the name and keeps the rest", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).patch(ADMIN_PATHS.teacher(IDS.teacher)).set(asAdmin).send({ name: "Bu Guru Baru" });
      expect(res.status).toBe(200);
      expect(res.body.teacher).toMatchObject({ name: "Bu Guru Baru", email: "teacher@example.com" });
    });

    it("resets the password: the old one stops working, the new one works", async () => {
      const { app } = await buildTestApp();
      await request(app).patch(ADMIN_PATHS.teacher(IDS.teacher)).set(asAdmin).send({ password: "Brand-new-pass-9" });

      expect((await loginTeacher(app, "teacher@example.com", PASSWORDS.teacher)).status).toBe(401);
      expect((await loginTeacher(app, "teacher@example.com", "Brand-new-pass-9")).status).toBe(200);
    });

    it("changes the email, but not to one that is taken (409)", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.teacher(IDS.teacher)).set(asAdmin).send({ email: "baru@example.com" })).status).toBe(200);
      const taken = await request(app).patch(ADMIN_PATHS.teacher(IDS.teacher)).set(asAdmin).send({ email: "teacher2@example.com" });
      expect(taken.status).toBe(409);
    });

    it("keeping the same email is not a conflict", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.teacher(IDS.teacher)).set(asAdmin).send({ email: "teacher@example.com" })).status).toBe(200);
    });

    it("cannot touch an admin account (404)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).patch(ADMIN_PATHS.teacher(IDS.admin)).set(asAdmin).send({ name: "Hacked" });
      expect(res.status).toBe(404);
      expect((await request(app).get(ADMIN_PATHS.teachers).set(asAdmin)).body.items.some((t: { name: string }) => t.name === "Hacked")).toBe(false);
    });

    it.each([{}, { name: "" }, { password: "weak" }, { email: "x" }, { role: "ADMIN" }])("rejects %j (400)", async (body) => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.teacher(IDS.teacher)).set(asAdmin).send(body)).status).toBe(400);
    });

    it("an unknown teacher is 404", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).patch(ADMIN_PATHS.teacher(UNKNOWN_ID)).set(asAdmin).send({ name: "X" })).status).toBe(404);
    });
  });

  describe("delete", () => {
    it("deletes a teacher with no classes (204), who can no longer log in", async () => {
      const { app } = await buildTestApp();
      const teacher = await createTeacher(app);
      expect((await request(app).delete(ADMIN_PATHS.teacher(teacher.id)).set(asAdmin)).status).toBe(204);
      expect((await request(app).get(ADMIN_PATHS.teacher(teacher.id)).set(asAdmin)).status).toBe(404);
      expect((await loginTeacher(app, NEW_TEACHER.email, NEW_TEACHER.password)).status).toBe(401);
    });

    it("refuses while the teacher still has classes, and says how many (409)", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).delete(ADMIN_PATHS.teacher(IDS.teacher)).set(asAdmin);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: "teacher_in_use", details: { class_count: 2 } });
    });

    it("works after the classes were given to another teacher", async () => {
      const { app } = await buildTestApp();
      for (const id of [CLASS.id, CLASS.archivedId]) {
        await request(app).patch(ADMIN_PATHS.class(id)).set(asAdmin).send({ teacher_id: CLASS.otherTeacherId });
      }
      expect((await request(app).delete(ADMIN_PATHS.teacher(IDS.teacher)).set(asAdmin)).status).toBe(204);
    });

    it("cannot delete an admin account (404)", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).delete(ADMIN_PATHS.teacher(IDS.admin)).set(asAdmin)).status).toBe(404);
    });

    it("an unknown teacher is 404", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).delete(ADMIN_PATHS.teacher(UNKNOWN_ID)).set(asAdmin)).status).toBe(404);
    });
  });

  describe("who may call it", () => {
    it.each([
      ["a teacher", auth(TEACHER_AUTH)],
      ["a student", auth(studentAuth("satu"))],
    ])("%s gets 403 on every teacher endpoint", async (_who, headers) => {
      const { app } = await buildTestApp();
      const id = IDS.teacher;
      const calls = [
        request(app).get(ADMIN_PATHS.teachers).set(headers),
        request(app).post(ADMIN_PATHS.teachers).set(headers).send(NEW_TEACHER),
        request(app).get(ADMIN_PATHS.teacher(id)).set(headers),
        request(app).patch(ADMIN_PATHS.teacher(id)).set(headers).send({ name: "x" }),
        request(app).delete(ADMIN_PATHS.teacher(id)).set(headers),
      ];
      for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
    });

    it("a request without a token gets 401", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).get(ADMIN_PATHS.teachers)).status).toBe(401);
    });
  });
});
