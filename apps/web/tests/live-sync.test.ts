import { describe, expect, it } from "vitest";
import { applyOps, createLiveChannel, liveEventOf, type LiveEvent } from "@/components/session/board/live-sync";
import type { BoardElement } from "@/components/session/board/types";

const rect = (id: string, x = 0): BoardElement => ({ id, type: "rectangle", x, y: 0, width: 10, height: 10, strokeColor: "#000", backgroundColor: "transparent", strokeWidth: 2, version: 1 });
const ids = (els: BoardElement[]) => els.map((e) => `${e.id}@${e.x}`);

describe("applyOps", () => {
  it("replaces changed elements in place, adds new ones on top, and removes deleted ones", () => {
    expect(ids(applyOps([rect("a"), rect("b"), rect("c")], [rect("b", 50), rect("d")], ["a"]))).toEqual(["b@50", "c@0", "d@0"]);
  });
  it("returns the same array when nothing changed, so React does not re-render", () => {
    const board = [rect("a")];
    expect(applyOps(board, [], [])).toBe(board);
  });
  it("an element added and deleted in the same message is not added", () => {
    expect(ids(applyOps([], [rect("x")], ["x"]))).toEqual([]);
  });
});

describe("liveEventOf", () => {
  it("reads the board from the snapshot, dropping what it cannot draw", () => {
    const event = liveEventOf("snapshot", { live: { board: { elements: [rect("a"), { junk: true }] }, draw_allowed: false, me: { id: "t1", name: "Bu Guru", role: "teacher" } } });
    expect(event).toMatchObject({ type: "snapshot", drawAllowed: false, me: { id: "t1", name: "Bu Guru", role: "teacher" } });
    expect((event as Extract<LiveEvent, { type: "snapshot" }>).elements).toHaveLength(1);
  });
  it("a snapshot without a board (an ended session) is not a board event", () => {
    expect(liveEventOf("snapshot", { session: {} })).toBeNull();
  });
  it("reads changes of others", () => {
    expect(liveEventOf("board_ops", { by: "s1", upserts: [rect("a")], deletes: ["b", 3] })).toMatchObject({ type: "ops", by: "s1", deletes: ["b"] });
  });
  it("reads a cursor, and a hidden one as no point", () => {
    expect(liveEventOf("cursor", { id: "t1", name: "Bu Guru", role: "teacher", x: 3, y: 4 })).toEqual({ type: "cursor", actor: { id: "t1", name: "Bu Guru", role: "teacher" }, point: [3, 4] });
    expect(liveEventOf("cursor", { id: "s1", name: "", role: "student", hidden: true })).toEqual({ type: "cursor", actor: { id: "s1", name: "Tanpa nama", role: "student" }, point: null });
  });
  it("reads quiz events by the quiz they are about", () => {
    expect(liveEventOf("quiz_opened", { quiz: { id: "q1" } })).toEqual({ type: "quiz", quizId: "q1", change: "opened" });
    expect(liveEventOf("quiz_progress", { quiz_id: "q1", answered: 2 })).toEqual({ type: "quiz", quizId: "q1", change: "progress" });
  });
  it("ignores events that are not about the board", () => {
    expect(liveEventOf("participant_joined", { student_id: "x" })).toBeNull();
  });
});

describe("createLiveChannel", () => {
  it("hands every event to every listener until it unsubscribes", () => {
    const channel = createLiveChannel();
    const seen: string[] = [];
    const stop = channel.subscribe((e) => seen.push(e.type));
    channel.emit({ type: "mode", drawAllowed: true });
    stop();
    channel.emit({ type: "mode", drawAllowed: false });
    expect(seen).toEqual(["mode"]);
  });
});
