import { describe, expect, it } from "vitest";
import { EXAMPLE, countNodes, insertNode, locate, moveNode, removeNode, shuffled, traceFlow, flowView, treeAsComments, usedIds } from "../src/components/problems/blocks";
import type { PuzzleNode } from "../src/lib/api/types";

const tree: PuzzleNode[] = [{ block: "a" }, { block: "loop", children: [{ block: "b" }, { block: "c" }] }, { block: "d" }];

describe("block tree helpers", () => {
  it("finds, inserts and removes blocks at any depth", () => {
    expect(locate(tree, "c")).toEqual({ parent: "loop", index: 1 });
    expect(locate(tree, "d")).toEqual({ parent: null, index: 2 });
    expect(insertNode(tree, "loop", 0, { block: "x" })[1].children!.map((n) => n.block)).toEqual(["x", "b", "c"]);
    expect(removeNode(tree, "loop").map((n) => n.block)).toEqual(["a", "d"]);
    expect([...usedIds(tree)].sort()).toEqual(["a", "b", "c", "d", "loop"]);
    expect(countNodes(tree)).toBe(5);
  });

  it("moves within a stack counting positions before the move, and in or out of a loop", () => {
    expect(moveNode(tree, "a", null, 3).map((n) => n.block)).toEqual(["loop", "d", "a"]);
    expect(moveNode(tree, "d", null, 0).map((n) => n.block)).toEqual(["d", "a", "loop"]);
    const inside = moveNode(tree, "d", "loop", 2);
    expect(inside.map((n) => n.block)).toEqual(["a", "loop"]);
    expect(inside[1].children!.map((n) => n.block)).toEqual(["b", "c", "d"]);
    expect(moveNode(tree, "b", null, 0).map((n) => n.block)).toEqual(["b", "a", "loop", "d"]);
  });

  it("never moves a loop into itself", () => {
    expect(moveNode(tree, "loop", "loop", 0)).toBe(tree);
  });

  it("shuffles the same way every time for a seed", () => {
    const ids = ["1", "2", "3", "4", "5", "6"];
    expect(shuffled(ids, "s")).toEqual(shuffled(ids, "s"));
    expect([...shuffled(ids, "s")].sort()).toEqual(ids);
  });

  it("ships an example whose answer only uses its own blocks, and whose key code passes its tests", () => {
    const { challenge } = EXAMPLE;
    const ids = new Set(challenge.blocks.map((b) => b.id));
    expect([...usedIds(challenge.solution)].every((id) => ids.has(id))).toBe(true);
    expect(challenge.blocks.length).toBeGreaterThan(countNodes(challenge.solution)); // has distractors
    const code = challenge.code!;
    const fn = new Function(`${code.reference}\nreturn ${code.fn};`)() as (...args: unknown[]) => unknown;
    for (const test of code.tests) expect(fn(...test.args)).toEqual(test.expected);
  });

  it("writes an arrangement as indented comments, to plan the code from", () => {
    const byId = new Map([
      { id: "s", kind: "event" as const, text: "ketika mulai" },
      { id: "l", kind: "loop" as const, text: "ulangi 2 kali" },
      { id: "m", kind: "action" as const, text: "maju" },
    ].map((b) => [b.id, b]));
    expect(treeAsComments([{ block: "s" }, { block: "l", children: [{ block: "m" }] }], byId)).toBe("  // ketika mulai\n  // ulangi 2 kali\n    // maju");
  });
});

describe("traceFlow", () => {
  const blocks = new Map(
    [
      { id: "s", kind: "event", text: "ketika mulai" },
      { id: "l", kind: "loop", text: "ulangi 2 kali" },
      { id: "m", kind: "action", text: "maju" },
      { id: "w", kind: "loop", text: "ulangi 10 kali" },
      { id: "i", kind: "if", text: "jika ada batu" },
      { id: "j", kind: "action", text: "lompat" },
    ].map((b) => [b.id, b as never]),
  );

  it("plays loops round by round and checks an if before its body", () => {
    const steps = traceFlow([{ block: "s" }, { block: "l", children: [{ block: "m" }] }, { block: "i", children: [{ block: "j" }] }], blocks);
    expect(steps.map((s) => s.block)).toEqual(["s", "l", "m", "l", "m", "i", "j"]);
    expect(steps[2].note).toBe("putaran 1 dari 2 · jalankan");
    expect(steps[5].note).toBe("periksa syarat: ada batu");
  });

  it("shows only the first rounds of a long loop", () => {
    const steps = traceFlow([{ block: "w", children: [{ block: "m" }] }], blocks);
    expect(steps.filter((s) => s.block === "m")).toHaveLength(3);
    expect(steps.at(-1)!.note).toBe("… diulang sampai putaran 10");
  });
});

describe("flowView", () => {
  const blocks = new Map(
    [
      { id: "s", kind: "event", text: "ketika mulai" },
      { id: "l", kind: "loop", text: "ulangi 2 kali" },
      { id: "m", kind: "action", text: "maju" },
      { id: "e", kind: "action", text: "selesai" },
    ].map((b) => [b.id, b as never]),
  );
  const steps = traceFlow([{ block: "s" }, { block: "l", children: [{ block: "m" }] }, { block: "e" }], blocks);

  it("leaves a trail, cleared inside a loop when it jumps back for the next round", () => {
    // s, l(start), m(r1), l(back), m(r2), e
    expect(steps.map((s) => s.kind)).toEqual(["start", "loop", "run", "loop-back", "run", "run"]);
    expect([...flowView(steps, 2, false).trail]).toEqual(["s", "l", "m"]);
    expect([...flowView(steps, 3, false).trail]).toEqual(["s", "l"]);
    expect(flowView(steps, 3, false).rounds).toEqual({ l: "2/2" });
    expect(flowView(steps, 4, false).rounds).toEqual({ l: "2/2" });
    const done = flowView(steps, 5, true);
    expect(done).toMatchObject({ active: "", finished: true, rounds: {} });
    expect([...done.trail].sort()).toEqual(["e", "l", "m", "s"]);
  });
});
