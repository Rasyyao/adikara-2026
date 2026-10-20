import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GRACE_MS, buildClockServices, sinkOf } from "../helpers/clock-services.js";
import { STUDENTS } from "../helpers/fake-database.js";
import { TEACHER_AUTH, studentAuth } from "../helpers/sessions.js";

/** The event stream at service level: time is controlled, no HTTP. The HTTP side is session-events.route.test.ts. */
let ctx: Awaited<ReturnType<typeof buildClockServices>>;

beforeEach(async () => {
  ctx = await buildClockServices();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const stream = () => ctx.services.shared.sessionStream;
const teacherSessions = () => ctx.services.teacher.sessions;

describe("snapshot queue", () => {
  it("events that arrive before activate() are delivered after it, in order", async () => {
    const { id, code } = await ctx.newSession();
    await ctx.services.student.sessions.joinSession(studentAuth("satu"), code);
    const teacher = sinkOf();
    const opened = await stream().subscribe(TEACHER_AUTH, id, teacher.sink);

    await teacherSessions().setLocked(TEACHER_AUTH, id, true);
    await teacherSessions().setLocked(TEACHER_AUTH, id, false);
    expect(teacher.events).toEqual([]); // held back: the snapshot has not been written yet

    opened.activate();
    expect(teacher.events.map((e) => e.type)).toEqual(["session_locked", "session_unlocked"]);

    await teacherSessions().startSession(TEACHER_AUTH, id);
    expect(teacher.events.map((e) => e.type)).toEqual(["session_locked", "session_unlocked", "session_started"]);
  });

  it("an ended session returns a snapshot with ended=true and subscribes nothing", async () => {
    const { id } = await ctx.newSession();
    await teacherSessions().endSession(TEACHER_AUTH, id);
    const opened = await stream().subscribe(TEACHER_AUTH, id, sinkOf().sink);

    expect(opened.ended).toBe(true);
    expect(opened.snapshot.data.session).toMatchObject({ status: "ENDED" });
  });
});

describe("presence (who is still connected)", () => {
  async function connectedStudent() {
    const { id, code } = await ctx.newSession();
    await ctx.services.student.sessions.joinSession(studentAuth("satu"), code);
    const teacher = sinkOf();
    (await stream().subscribe(TEACHER_AUTH, id, teacher.sink)).activate();
    const opened = await stream().subscribe(studentAuth("satu"), id, sinkOf().sink);
    opened.activate();
    return { id, code, teacher, opened };
  }
  const participant = (id: string) => ctx.db.repositories.shared.sessions.findParticipant(id, STUDENTS.satu.id);

  it("is not marked left while the grace period runs", async () => {
    const { id, teacher, opened } = await connectedStudent();
    opened.unsubscribe();
    await vi.advanceTimersByTimeAsync(GRACE_MS - 1);

    expect((await participant(id))?.leftAt).toBeNull();
    expect(teacher.events).toEqual([]);
  });

  it("is marked left once the grace period passes, and the teacher is told", async () => {
    const { id, teacher, opened } = await connectedStudent();
    opened.unsubscribe();
    await vi.advanceTimersByTimeAsync(GRACE_MS);

    expect((await participant(id))?.leftAt).toEqual(ctx.clock.now);
    expect(teacher.events).toEqual([{ type: "participant_left", data: { student_id: STUDENTS.satu.id, reason: "disconnected" } }]);
  });

  it("reconnecting inside the grace period cancels it (a flaky connection does not flicker)", async () => {
    const { id, teacher, opened } = await connectedStudent();
    opened.unsubscribe();
    await vi.advanceTimersByTimeAsync(GRACE_MS - 1000);
    (await stream().subscribe(studentAuth("satu"), id, sinkOf().sink)).activate();
    await vi.advanceTimersByTimeAsync(GRACE_MS * 2);

    expect((await participant(id))?.leftAt).toBeNull();
    expect(teacher.events).toEqual([]);
  });

  it("two open tabs: closing one does not start the countdown", async () => {
    const { id, teacher, opened } = await connectedStudent();
    (await stream().subscribe(studentAuth("satu"), id, sinkOf().sink)).activate();

    opened.unsubscribe();
    await vi.advanceTimersByTimeAsync(GRACE_MS * 2);

    expect((await participant(id))?.leftAt).toBeNull();
    expect(teacher.events).toEqual([]);
  });

  it("a student who comes back after being marked left is 'joined' again and the teacher is told", async () => {
    const { id, teacher, opened } = await connectedStudent();
    opened.unsubscribe();
    await vi.advanceTimersByTimeAsync(GRACE_MS);
    teacher.events.length = 0;

    (await stream().subscribe(studentAuth("satu"), id, sinkOf().sink)).activate();

    expect((await participant(id))?.leftAt).toBeNull();
    expect(teacher.events.map((e) => e.type)).toEqual(["participant_joined"]);
  });

  it("joining again with the PIN after being marked left also counts as back", async () => {
    const { id, code, opened } = await connectedStudent();
    opened.unsubscribe();
    await vi.advanceTimersByTimeAsync(GRACE_MS);

    const result = await ctx.services.student.sessions.joinSession(studentAuth("satu"), code);
    expect(result.participant.state).toBe("joined");
    expect((await participant(id))?.leftAt).toBeNull();
  });

  it("nobody is marked left after the session ended", async () => {
    const { id, opened } = await connectedStudent();
    opened.unsubscribe();
    await teacherSessions().endSession(TEACHER_AUTH, id);
    await vi.advanceTimersByTimeAsync(GRACE_MS * 2);

    expect((await participant(id))?.leftAt).toBeNull();
  });

  it("a kicked student is not marked left a second time", async () => {
    const { id, opened } = await connectedStudent();
    await teacherSessions().kickParticipant(TEACHER_AUTH, id, STUDENTS.satu.id);
    const leftAt = (await participant(id))?.leftAt;
    opened.unsubscribe();
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 1000);
    await vi.advanceTimersByTimeAsync(GRACE_MS * 2);

    expect((await participant(id))?.leftAt).toEqual(leftAt);
  });

  it("a database error in the timer is logged and does not crash the process", async () => {
    const { opened } = await connectedStudent();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(ctx.db.repositories.shared.sessions, "updateParticipant").mockRejectedValue(new Error("db down"));

    opened.unsubscribe();
    await vi.advanceTimersByTimeAsync(GRACE_MS);

    expect(error).toHaveBeenCalled();
  });
});

describe("who may follow a session", () => {
  it("a student who has not joined is refused (403 not_joined)", async () => {
    const { id } = await ctx.newSession();
    await expect(stream().subscribe(studentAuth("satu"), id, sinkOf().sink)).rejects.toMatchObject({ status: 403, code: "not_joined" });
  });
});
