import { vi } from "vitest";
import type { EventSink, SessionEvent } from "../../src/lib/event-hub.js";
import { STUDENTS } from "./fake-database.js";
import { TEACHER_AUTH, studentAuth } from "./sessions.js";
import { buildServices } from "./services.js";

/** A sink that records what it receives. */
export function sinkOf() {
  const events: SessionEvent[] = [];
  let closed = false;
  const sink: EventSink = { send: (e) => events.push(e), close: () => (closed = true) };
  return { events, isClosed: () => closed, sink };
}

export const GRACE_MS = 5_000;

/** Services with a clock the test moves by hand and fake timers, plus a helper to create a session. */
export async function buildClockServices() {
  vi.useFakeTimers();
  const clock = { now: new Date("2026-01-01T10:00:00.000Z") };
  const built = await buildServices({ now: () => clock.now, presenceGraceMs: GRACE_MS, ttlMs: 60_000 });
  const newSession = async () => {
    const created = await built.services.teacher.sessions.createSession(TEACHER_AUTH, "KELAS7A");
    return { id: created.session.id, code: created.session.join_code as string };
  };
  return { ...built, clock, newSession, STUDENTS, studentAuth };
}
