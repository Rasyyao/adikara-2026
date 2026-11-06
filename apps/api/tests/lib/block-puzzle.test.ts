import { describe, expect, it } from "vitest";
import { blankChallenge, gradeArrangement, problemIssues, readArrangement, readChallenge, type Challenge } from "../../src/lib/block-puzzle.js";

/** "ketika mulai", then three steps in a loop; "lompat" is a distractor. b3 and b5 are interchangeable copies. */
const ALGORITHM: Challenge = {
  prompt: "Susun langkahnya.",
  hint: "",
  ordered: true,
  blocks: [
    { id: "b1", kind: "event", text: "ketika mulai" },
    { id: "b2", kind: "loop", text: "ulangi 3 kali" },
    { id: "b3", kind: "action", text: "maju 1 langkah" },
    { id: "b4", kind: "action", text: "belok kanan" },
    { id: "b5", kind: "action", text: "Maju  1 langkah" },
    { id: "b6", kind: "action", text: "lompat" },
  ],
  solution: [{ block: "b1" }, { block: "b2", children: [{ block: "b3" }, { block: "b5" }, { block: "b4" }] }],
  code: null,
};

describe("gradeArrangement", () => {
  it("accepts the answer, and copies of a block in either order", () => {
    expect(gradeArrangement(ALGORITHM, ALGORITHM.solution).correct).toBe(true);
    const swapped = gradeArrangement(ALGORITHM, [{ block: "b1" }, { block: "b2", children: [{ block: "b5" }, { block: "b3" }, { block: "b4" }] }]);
    expect(swapped).toMatchObject({ correct: true, missing: 0, expected: 5, placed: 5 });
  });

  it("marks blocks out of order as misplaced, distractors as extra, and counts what is missing", () => {
    const result = gradeArrangement(ALGORITHM, [{ block: "b1" }, { block: "b6" }, { block: "b2", children: [{ block: "b4" }, { block: "b3" }] }]);
    expect(result.correct).toBe(false);
    expect(result.blocks).toEqual({ b1: "right", b2: "right", b3: "right", b4: "misplaced", b6: "extra" });
    expect(result.missing).toBe(1);
  });

  it("finds a block outside its loop to be misplaced", () => {
    const result = gradeArrangement(ALGORITHM, [{ block: "b1" }, { block: "b3" }, { block: "b2", children: [{ block: "b5" }, { block: "b4" }] }]);
    expect(result.blocks.b3).toBe("misplaced");
    expect(result.correct).toBe(false);
  });

  it("ignores order when the challenge says it does not matter", () => {
    const stage: Challenge = {
      ...blankChallenge(),
      ordered: false,
      blocks: [
        { id: "p1", kind: "part", text: "Cari jalan" },
        { id: "p2", kind: "part", text: "Hindari batu" },
        { id: "p3", kind: "part", text: "Warna robot" },
      ],
      solution: [{ block: "p1" }, { block: "p2" }],
    };
    expect(gradeArrangement(stage, [{ block: "p2" }, { block: "p1" }]).correct).toBe(true);
    expect(gradeArrangement(stage, [{ block: "p2" }, { block: "p3" }])).toMatchObject({ correct: false, missing: 1, blocks: { p2: "right", p3: "extra" } });
  });

  it("never passes an empty answer key", () => {
    expect(gradeArrangement(blankChallenge(), []).correct).toBe(false);
  });
});

describe("readArrangement", () => {
  it("refuses unknown and repeated blocks, children under a step, and deep nesting", () => {
    expect(readArrangement([{ block: "zz" }], ALGORITHM.blocks)).toHaveProperty("error");
    expect(readArrangement([{ block: "b1" }, { block: "b1" }], ALGORITHM.blocks)).toHaveProperty("error");
    expect(readArrangement([{ block: "b3", children: [{ block: "b4" }] }], ALGORITHM.blocks)).toHaveProperty("error");
    const loops = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, kind: "loop" as const, text: "ulangi" }));
    const deep = loops.reduceRight<unknown[]>((inner, b) => [{ block: b.id, children: inner }], []);
    expect(readArrangement(deep, loops)).toHaveProperty("error");
    expect(readArrangement(ALGORITHM.solution, ALGORITHM.blocks)).toEqual({ nodes: ALGORITHM.solution });
  });
});

describe("problemIssues and readChallenge", () => {
  it("lists what is unfinished", () => {
    const issues = problemIssues({ story: " ", challenge: { ...ALGORITHM, solution: [{ block: "b2", children: [] }] } });
    expect(issues).toContainEqual({ code: "story_missing" });
    expect(issues).toContainEqual({ code: "container_empty" });
    expect(problemIssues({ story: "x", challenge: blankChallenge() })).toEqual([{ code: "no_mode" }]);
    expect(problemIssues({ story: "x", challenge: { ...ALGORITHM, solution: [] } })).toEqual([{ code: "solution_missing" }]);
  });

  it("offers JavaScript alone, but only with tests", () => {
    const code = { fn: "luas", params: ["p", "l"], starter: "", reference: "function luas(p, l) { return p * l; }", tests: [] };
    expect(problemIssues({ story: "x", challenge: { ...blankChallenge(), code } })).toEqual([{ code: "code_tests_missing" }]);
    expect(problemIssues({ story: "x", challenge: { ...blankChallenge(), code: { ...code, tests: [{ args: [2, 3], expected: 6 }] } } })).toEqual([]);
  });

  it("drops malformed stored JSON instead of trusting it", () => {
    const challenge = readChallenge({ prompt: 5, blocks: [{ id: "x", text: "a", kind: "nope" }, { id: "y", text: "b", kind: "action" }], solution: [{ block: "x" }], code: { fn: "1bad" } });
    expect(challenge.blocks).toEqual([{ id: "y", text: "b", kind: "action" }]);
    expect(challenge.solution).toEqual([]);
    expect(challenge.prompt).toBe(blankChallenge().prompt);
    expect(challenge.code).toBeNull();
  });

  it("reads a draft from before the single challenge: its algoritma stage becomes the challenge", () => {
    const old = [{}, {}, {}, { pillar: "algoritma", prompt: "Susun.", hint: "h", ordered: true, blocks: ALGORITHM.blocks, solution: ALGORITHM.solution }];
    expect(readChallenge(old)).toEqual({ ...ALGORITHM, prompt: "Susun.", hint: "h" });
  });
});
