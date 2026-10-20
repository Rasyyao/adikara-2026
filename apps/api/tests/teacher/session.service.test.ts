import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildClockServices } from "../helpers/clock-services.js";
import { STUDENTS } from "../helpers/fake-database.js";
import { studentAuth } from "../helpers/sessions.js";

let ctx: Awaited<ReturnType<typeof buildClockServices>>;

beforeEach(async () => {
  ctx = await buildClockServices();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("teacher session service: fail closed", () => {
  it("a student token is refused by every method even if a route guard were missing", async () => {
    const { id } = await ctx.newSession();
    const s = ctx.services.teacher.sessions;
    const student = studentAuth("satu");
    await expect(s.createSession(student, "KELAS7A")).rejects.toMatchObject({ status: 403 });
    await expect(s.getSession(student, id)).rejects.toMatchObject({ status: 403 });
    await expect(s.startSession(student, id)).rejects.toMatchObject({ status: 403 });
    await expect(s.setLocked(student, id, true)).rejects.toMatchObject({ status: 403 });
    await expect(s.endSession(student, id)).rejects.toMatchObject({ status: 403 });
    await expect(s.kickParticipant(student, id, STUDENTS.dua.id)).rejects.toMatchObject({ status: 403 });
    await expect(s.getAttendance(student, id)).rejects.toMatchObject({ status: 403 });
  });
});
