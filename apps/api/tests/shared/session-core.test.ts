import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildClockServices, sinkOf } from "../helpers/clock-services.js";
import { TEACHER_AUTH } from "../helpers/sessions.js";

/** Rules every side of a session shares: expiry. */
let ctx: Awaited<ReturnType<typeof buildClockServices>>;

beforeEach(async () => {
  ctx = await buildClockServices();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("expiry", () => {
  it("a session past its time limit is closed when someone touches it, and subscribers are told", async () => {
    const { id } = await ctx.newSession();
    const teacher = sinkOf();
    (await ctx.services.shared.sessionStream.subscribe(TEACHER_AUTH, id, teacher.sink)).activate();

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 61_000);
    const detail = await ctx.services.teacher.sessions.getSession(TEACHER_AUTH, id);

    expect(detail.session).toMatchObject({ status: "ENDED", join_code: null });
    expect(teacher.events.map((e) => e.type)).toEqual(["session_ended"]);
    expect(teacher.isClosed()).toBe(true);
  });

  it("a session within its time limit stays open", async () => {
    const { id } = await ctx.newSession();
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 59_000);
    expect((await ctx.services.teacher.sessions.getSession(TEACHER_AUTH, id)).session.status).toBe("LOBBY");
  });
});
