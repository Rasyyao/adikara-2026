import { describe, expect, it } from "vitest";
import { createEventHub, type EventSink, type SessionEvent } from "../../src/lib/event-hub.js";

function sink() {
  const received: SessionEvent[] = [];
  let closed = 0;
  const value: EventSink = { send: (e) => received.push(e), close: () => (closed += 1) };
  return { value, received, closes: () => closed };
}
const event = (type: SessionEvent["type"]): SessionEvent => ({ type, data: {} });

describe("event hub", () => {
  describe("audiences", () => {
    it("'all' reaches staff and students", () => {
      const hub = createEventHub();
      const teacher = sink();
      const student = sink();
      hub.subscribe("s1", { kind: "staff" }, teacher.value);
      hub.subscribe("s1", { kind: "student", studentId: "a" }, student.value);
      hub.publish("s1", event("session_started"), "all");
      expect(teacher.received).toHaveLength(1);
      expect(student.received).toHaveLength(1);
    });

    it("'staff' does not reach students", () => {
      const hub = createEventHub();
      const teacher = sink();
      const student = sink();
      hub.subscribe("s1", { kind: "staff" }, teacher.value);
      hub.subscribe("s1", { kind: "student", studentId: "a" }, student.value);
      hub.publish("s1", event("participant_joined"), "staff");
      expect(teacher.received).toHaveLength(1);
      expect(student.received).toHaveLength(0);
    });

    it("a student audience reaches only that student", () => {
      const hub = createEventHub();
      const a = sink();
      const b = sink();
      const teacher = sink();
      hub.subscribe("s1", { kind: "student", studentId: "a" }, a.value);
      hub.subscribe("s1", { kind: "student", studentId: "b" }, b.value);
      hub.subscribe("s1", { kind: "staff" }, teacher.value);
      hub.publish("s1", event("kicked"), { studentId: "a" });
      expect(a.received).toHaveLength(1);
      expect(b.received).toHaveLength(0);
      expect(teacher.received).toHaveLength(0);
    });
  });

  describe("isolation", () => {
    it("events of one session never reach another session", () => {
      const hub = createEventHub();
      const other = sink();
      hub.subscribe("s2", { kind: "staff" }, other.value);
      hub.publish("s1", event("session_started"), "all");
      expect(other.received).toHaveLength(0);
    });

    it("a sink that throws does not stop the others", () => {
      const hub = createEventHub();
      const good = sink();
      hub.subscribe("s1", { kind: "staff" }, { send: () => { throw new Error("broken pipe"); }, close() {} });
      hub.subscribe("s1", { kind: "staff" }, good.value);
      expect(() => hub.publish("s1", event("session_started"), "all")).not.toThrow();
      expect(good.received).toHaveLength(1);
    });
  });

  describe("unsubscribe and close", () => {
    it("stops delivering after unsubscribe", () => {
      const hub = createEventHub();
      const teacher = sink();
      const off = hub.subscribe("s1", { kind: "staff" }, teacher.value);
      off();
      hub.publish("s1", event("session_started"), "all");
      expect(teacher.received).toHaveLength(0);
    });

    it("close(session) closes every sink once and forgets them", () => {
      const hub = createEventHub();
      const teacher = sink();
      const student = sink();
      hub.subscribe("s1", { kind: "staff" }, teacher.value);
      hub.subscribe("s1", { kind: "student", studentId: "a" }, student.value);
      hub.close("s1");
      hub.close("s1");
      expect(teacher.closes()).toBe(1);
      expect(student.closes()).toBe(1);
      expect(hub.countStudent("s1", "a")).toBe(0);
    });

    it("close(session, student) closes only that student", () => {
      const hub = createEventHub();
      const a = sink();
      const b = sink();
      hub.subscribe("s1", { kind: "student", studentId: "a" }, a.value);
      hub.subscribe("s1", { kind: "student", studentId: "b" }, b.value);
      hub.close("s1", "a");
      expect(a.closes()).toBe(1);
      expect(b.closes()).toBe(0);
    });
  });

  it("countStudent counts the open streams of one student (two tabs = 2)", () => {
    const hub = createEventHub();
    const off = hub.subscribe("s1", { kind: "student", studentId: "a" }, sink().value);
    hub.subscribe("s1", { kind: "student", studentId: "a" }, sink().value);
    hub.subscribe("s1", { kind: "student", studentId: "b" }, sink().value);
    expect(hub.countStudent("s1", "a")).toBe(2);
    off();
    expect(hub.countStudent("s1", "a")).toBe(1);
  });
});
