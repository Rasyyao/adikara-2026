import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { UNKNOWN_ID } from "../helpers/admin.js";
import { CLASS } from "../helpers/fake-database.js";
import { ADMIN_AUTH, OTHER_TEACHER_AUTH, TEACHER_AUTH, auth, studentAuth } from "../helpers/sessions.js";

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

    it("a teacher has no way to change classes or students (the routes do not exist)", async () => {
      const { app } = await buildTestApp();
      expect((await request(app).post(LIST).set(auth(TEACHER_AUTH)).send({ name: "x" })).status).toBe(404);
      expect((await request(app).patch(ONE(CLASS.id)).set(auth(TEACHER_AUTH)).send({ name: "x" })).status).toBe(404);
      expect((await request(app).delete(ONE(CLASS.id)).set(auth(TEACHER_AUTH))).status).toBe(404);
    });
  });
});
