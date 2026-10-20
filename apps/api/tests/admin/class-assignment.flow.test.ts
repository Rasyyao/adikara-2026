import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { ADMIN_PATHS, asAdmin, createTeacher } from "../helpers/admin.js";
import { CLASS, STUDENTS } from "../helpers/fake-database.js";
import { loginStudent, loginTeacher } from "../helpers/requests.js";
import { SESSION_PATHS, TEACHER_AUTH, auth, createSession, joinSession } from "../helpers/sessions.js";

/**
 * The story the admin role exists for: the admin decides who teaches which class and which class each
 * student is in, so a student can only ever join sessions of their own class.
 */
describe("admin assigns teachers and students to classes", () => {
  async function newSchool() {
    const ctx = await buildTestApp();
    const { app } = ctx;
    const budi = await createTeacher(app); // pak.budi@example.com
    const klass = await request(app)
      .post(ADMIN_PATHS.classes)
      .set(asAdmin)
      .send({ name: "Kelas 7B", class_code: "KELAS7B", teacher_id: budi.id });
    const student = await request(app)
      .post(ADMIN_PATHS.students)
      .set(asAdmin)
      .send({ username: "siswa.baru", name: "Siswa Baru", password: "Siswa-pass-123", class_id: klass.body.class.id });
    const budiLogin = await loginTeacher(app, "pak.budi@example.com", "Guru-pass-123");
    const budiAuth = { userId: budi.id, role: "TEACHER", kind: "teacher" } as const;
    return { ...ctx, budi, budiAuth, budiToken: budiLogin.body.access_token as string, classId: klass.body.class.id as string, studentId: student.body.student.id as string };
  }

  it("a new teacher sees exactly the class the admin gave them, with its student", async () => {
    const { app, budiToken, classId } = await newSchool();
    const list = await request(app).get("/api/v1/classes").set({ Authorization: `Bearer ${budiToken}` });
    expect(list.body.items.map((c: { class_code: string }) => c.class_code)).toEqual(["KELAS7B"]);

    const detail = await request(app).get(`/api/v1/classes/${classId}`).set({ Authorization: `Bearer ${budiToken}` });
    expect(detail.body.students.map((s: { username: string }) => s.username)).toEqual(["siswa.baru"]);
  });

  it("only students of the class can join its session; a student of another class is turned away", async () => {
    const { app, budiAuth } = await newSchool();
    const session = await createSession(app, budiAuth, "KELAS7B");

    const own = await loginStudent(app, "siswa.baru", "Siswa-pass-123");
    const joined = await request(app)
      .post(SESSION_PATHS.join)
      .set({ Authorization: `Bearer ${own.body.access_token}` })
      .send({ code: session.code });
    expect(joined.status).toBe(200);

    const stranger = await joinSession(app, session.code, "satu"); // siswa.satu belongs to KELAS7A
    expect(stranger.status).toBe(403);
    expect(stranger.body.error.code).toBe("not_in_class");
  });

  it("after the admin moves a student, they follow the new class and lose the old one", async () => {
    const { app } = await buildTestApp();
    const oldSession = await createSession(app); // KELAS7A, teacher Bu Guru
    await request(app).post(SESSION_PATHS.end(oldSession.id)).set(auth(TEACHER_AUTH));

    await request(app).patch(ADMIN_PATHS.student(STUDENTS.satu.id)).set(asAdmin).send({ class_id: CLASS.otherId });

    const oldClassAgain = await createSession(app);
    expect((await joinSession(app, oldClassAgain.code, "satu")).body.error.code).toBe("not_in_class");

    const newClass = await createSession(app, { userId: CLASS.otherTeacherId, role: "TEACHER", kind: "teacher" }, "KELAS8B");
    expect((await joinSession(app, newClass.code, "satu")).status).toBe(200);
  });

  it("handing a class to another teacher moves the sessions with it, once the running session ended", async () => {
    const { app, classId, budiAuth } = await newSchool();
    const running = await createSession(app, budiAuth, "KELAS7B");

    const refused = await request(app).patch(ADMIN_PATHS.class(classId)).set(asAdmin).send({ teacher_id: CLASS.otherTeacherId });
    expect(refused.body.error.code).toBe("class_has_live_session");

    await request(app).post(SESSION_PATHS.end(running.id)).set(auth(budiAuth));
    expect((await request(app).patch(ADMIN_PATHS.class(classId)).set(asAdmin).send({ teacher_id: CLASS.otherTeacherId })).status).toBe(200);

    const newTeacher = { userId: CLASS.otherTeacherId, role: "TEACHER", kind: "teacher" } as const;
    expect((await createSession(app, newTeacher, "KELAS7B")).code).toMatch(/^\d{6}$/);
    const oldTeacher = await request(app).post(SESSION_PATHS.create).set(auth(budiAuth)).send({ class_code: "KELAS7B" });
    expect(oldTeacher.status).toBe(404);
  });

  it("a deleted student cannot log in or join any more", async () => {
    const { app, studentId } = await newSchool();
    await request(app).delete(ADMIN_PATHS.student(studentId)).set(asAdmin);
    expect((await loginStudent(app, "siswa.baru", "Siswa-pass-123")).status).toBe(401);
  });
});
