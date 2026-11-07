import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { CLASS, PASSWORDS, STUDENTS } from "../helpers/fake-database.js";
import { bearer } from "../helpers/identities.js";
import { expectWithinTarget, runClassPeriod, startServer, type Person, type Server } from "../helpers/realtime-class.js";
import { TEACHER_AUTH } from "../helpers/sessions.js";

const CLASS_SIZE = 30;
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

/** Kelas 7A filled up to a full class; every new student has the same password as the seeded ones. */
async function fullClass(config = {}) {
  const built = await buildTestApp({ config });
  const template = built.db.studentsById.get(STUDENTS.satu.id)!;
  const students: Person[] = [STUDENTS.satu, STUDENTS.dua, STUDENTS.tiga].map((s) => ({ id: s.id, headers: { Authorization: bearer({ userId: s.id, role: "USER", kind: "student" }) } }));
  for (let i = students.length; i < CLASS_SIZE; i++) {
    const id = randomUUID();
    built.db.studentsById.set(id, { ...template, id, username: `siswa.${i}`, name: `Siswa ${i}` });
    students.push({ id, headers: { Authorization: bearer({ userId: id, role: "USER", kind: "student" }) } });
  }
  const server = await startServer(built.app);
  servers.push(server);
  return { ...built, server, students, teacher: { id: TEACHER_AUTH.userId, headers: { Authorization: bearer(TEACHER_AUTH) } } };
}

describe(`a class of ${CLASS_SIZE} acting at the same time (live events)`, () => {
  it("delivers every action to everyone it concerns within a second, with nothing lost", async () => {
    const { server, teacher, students } = await fullClass();
    const report = await runClassPeriod(server, { teacher, students, classCode: CLASS.code });
    expectWithinTarget(report);
  }, 30_000);

  it("lets the whole class log in at once from one school network, with the production login limit", async () => {
    // the real default: 10 attempts per 15 minutes; a class shares one IP (and in production every login reaches the
    // API from the web server), so the limit must count per account, not per IP alone
    const { server, students } = await fullClass({ loginRateLimitMax: 10 });
    const logins = await Promise.all(
      students.map((_, i) => server.call("POST", "/api/v1/auth/student/login", {}, { username: i < 3 ? ["siswa.satu", "siswa.dua", "siswa.tiga"][i] : `siswa.${i}`, password: PASSWORDS.student })),
    );
    expect(logins.map((l) => l.status)).toEqual(students.map(() => 200));
  }, 30_000);

  it("still stops guessing the password of one account", async () => {
    const { server } = await fullClass({ loginRateLimitMax: 10 });
    const tries = [];
    for (let i = 0; i < 12; i++) tries.push((await server.call("POST", "/api/v1/auth/student/login", {}, { username: "siswa.satu", password: `salah-${i}` })).status);
    expect(tries.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(tries.slice(10)).toEqual([429, 429]);
  });
});
