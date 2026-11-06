/**
 * Problem-solving challenges. A problem is a short story and ONE challenge the student solves in either of two ways:
 *
 * - blocks: the teacher gives a set of blocks and arranges some of them into the answer; the blocks left out are
 *   distractors. A student gets every block, shuffled, and must build the same arrangement.
 * - code: the student writes a JavaScript function that must pass the teacher's test cases (arguments → expected
 *   return value). The teacher's own solution (`reference`) is kept to check the tests, and never shown to students.
 *
 * A problem offers blocks when it has blocks, and code when `code` is set; at least one of them.
 *
 * Two blocks with the same kind and text are interchangeable, so a teacher can give "maju 1 langkah" three times and
 * the student may use the copies in any order. Grading aligns the student's stack with the answer level by level
 * (longest common subsequence when the order matters, a multiset match when it does not) and says per block whether
 * it is in the right place, belongs somewhere else, or is not needed at all.
 */

/** event: hat block that starts a script · action: one step · loop/if: C-blocks that hold other blocks · part: a sub-problem · info: a fact from the story. */
export const BLOCK_KINDS = ["event", "action", "loop", "if", "part", "info"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const CONTAINER_KINDS: ReadonlySet<BlockKind> = new Set(["loop", "if"]);

export const LIMITS = {
  blocks: 40,
  text: 120,
  prompt: 500,
  depth: 4,
  story: 4000,
  title: 120,
  code: 8000,
  tests: 20,
  /** Characters of one test's arguments or expected value, as JSON. */
  testJson: 2000,
  params: 6,
} as const;

export interface PuzzleBlock {
  id: string;
  text: string;
  kind: BlockKind;
}

export interface PuzzleNode {
  block: string;
  /** Only loop and if blocks hold children. */
  children?: PuzzleNode[];
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface CodeTest {
  /** The arguments the function is called with. */
  args: Json[];
  expected: Json;
}

export interface CodeTask {
  /** Name of the function the student writes, e.g. "hitungLangkah". */
  fn: string;
  params: string[];
  /** What the student's editor starts with. */
  starter: string;
  /** The teacher's solution; it must pass the tests. Never sent to students. */
  reference: string;
  tests: CodeTest[];
}

export interface Challenge {
  /** What the student is asked to do. */
  prompt: string;
  /** Shown on request. */
  hint: string;
  /** Whether the order of the blocks matters. */
  ordered: boolean;
  blocks: PuzzleBlock[];
  solution: PuzzleNode[];
  /** Null: the problem is solved with blocks only. */
  code: CodeTask | null;
}

export type IssueCode = "story_missing" | "prompt_missing" | "no_mode" | "solution_missing" | "container_empty" | "code_tests_missing";
export interface Issue {
  code: IssueCode;
}

export type Placement = "right" | "misplaced" | "extra";
export interface GradeResult {
  correct: boolean;
  /** Per block the student placed. */
  blocks: Record<string, Placement>;
  /** Answer blocks the student has not placed yet. */
  missing: number;
  expected: number;
  placed: number;
}

export const DEFAULT_PROMPT = "Susun langkah-langkah penyelesaian masalah ini dari awal sampai akhir.";

export function blankChallenge(): Challenge {
  return { prompt: DEFAULT_PROMPT, hint: "", ordered: true, blocks: [], solution: [], code: null };
}

export const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,39}$/;

/** A function with the task's name and parameters and an empty body, for a fresh JavaScript task. */
export function starterFor(fn: string, params: string[]): string {
  return `function ${fn}(${params.join(", ")}) {\n  // tulis kodemu di sini\n  \n}\n`;
}

const signature = (block: PuzzleBlock) => `${block.kind}:${block.text.trim().replace(/\s+/g, " ").toLowerCase()}`;

/** Which ways of solving a problem offers. */
export function modesOf(challenge: Challenge): { blocks: boolean; code: boolean } {
  return { blocks: challenge.blocks.length > 0, code: challenge.code !== null };
}

/** What still keeps a draft from being given to students. */
export function problemIssues(problem: { story: string; challenge: Challenge }): Issue[] {
  const { challenge } = problem;
  const issues: Issue[] = [];
  const modes = modesOf(challenge);
  if (!problem.story.trim()) issues.push({ code: "story_missing" });
  if (!challenge.prompt.trim()) issues.push({ code: "prompt_missing" });
  if (!modes.blocks && !modes.code) issues.push({ code: "no_mode" });
  if (modes.blocks) {
    if (challenge.solution.length === 0) issues.push({ code: "solution_missing" });
    const kinds = new Map(challenge.blocks.map((b) => [b.id, b.kind]));
    const hasEmpty = (nodes: PuzzleNode[]): boolean =>
      nodes.some((n) => (CONTAINER_KINDS.has(kinds.get(n.block)!) && !n.children?.length) || hasEmpty(n.children ?? []));
    if (hasEmpty(challenge.solution)) issues.push({ code: "container_empty" });
  }
  if (challenge.code && challenge.code.tests.length === 0) issues.push({ code: "code_tests_missing" });
  return issues;
}

/**
 * Reads an arrangement against the blocks of a challenge. Returns the nodes, or the reason it is not a valid one: an
 * unknown or repeated block, children under a block that cannot hold them, or nesting deeper than LIMITS.depth.
 */
export function readArrangement(raw: unknown, blocks: PuzzleBlock[]): { nodes: PuzzleNode[] } | { error: string } {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const seen = new Set<string>();
  let error: string | null = null;
  const walk = (value: unknown, depth: number): PuzzleNode[] => {
    if (!Array.isArray(value)) {
      error ??= "must be a list of { block, children? }";
      return [];
    }
    if (depth > LIMITS.depth) {
      error ??= `nests deeper than ${LIMITS.depth} levels`;
      return [];
    }
    return value.flatMap((item): PuzzleNode[] => {
      const node = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
      const block = typeof node.block === "string" ? byId.get(node.block) : undefined;
      if (!block) {
        error ??= "uses a block that is not in this problem";
        return [];
      }
      if (seen.has(block.id)) {
        error ??= `uses block ${block.id} more than once`;
        return [];
      }
      seen.add(block.id);
      if (node.children === undefined || node.children === null) return [{ block: block.id }];
      if (!CONTAINER_KINDS.has(block.kind)) {
        error ??= `block ${block.id} cannot hold other blocks`;
        return [];
      }
      return [{ block: block.id, children: walk(node.children, depth + 1) }];
    });
  };
  const nodes = walk(raw, 1);
  return error ? { error } : { nodes };
}

/** Pairs of indexes (student, expected) with equal signatures, keeping order: a longest common subsequence. */
function pairInOrder(a: string[], b: string[]): [number, number][] {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** Pairs with equal signatures, ignoring order. */
function pairAnyOrder(a: string[], b: string[]): [number, number][] {
  const used = new Set<number>();
  return a.flatMap((s, i): [number, number][] => {
    const j = b.findIndex((t, k) => t === s && !used.has(k));
    if (j < 0) return [];
    used.add(j);
    return [[i, j]];
  });
}

export function gradeArrangement(challenge: Pick<Challenge, "blocks" | "solution" | "ordered">, answer: PuzzleNode[]): GradeResult {
  const byId = new Map(challenge.blocks.map((b) => [b.id, b]));
  const sig = (n: PuzzleNode) => signature(byId.get(n.block)!);
  const pair = challenge.ordered ? pairInOrder : pairAnyOrder;
  const blocks: Record<string, Placement> = {};
  const strays: PuzzleNode[] = [];
  const leftover = new Map<string, number>();
  const leave = (n: PuzzleNode) => {
    leftover.set(sig(n), (leftover.get(sig(n)) ?? 0) + 1);
    (n.children ?? []).forEach(leave);
  };
  const stray = (n: PuzzleNode) => {
    strays.push(n);
    (n.children ?? []).forEach(stray);
  };

  const align = (given: PuzzleNode[], expected: PuzzleNode[]) => {
    const pairs = pair(given.map(sig), expected.map(sig));
    const matchedGiven = new Set(pairs.map(([i]) => i));
    const matchedExpected = new Set(pairs.map(([, j]) => j));
    for (const [i, j] of pairs) {
      blocks[given[i].block] = "right";
      align(given[i].children ?? [], expected[j].children ?? []);
    }
    given.forEach((n, i) => !matchedGiven.has(i) && stray(n));
    expected.forEach((n, j) => !matchedExpected.has(j) && leave(n));
  };
  align(answer, challenge.solution);

  // a stray block that the answer needs somewhere is misplaced; one it never needs is extra
  for (const n of strays) {
    const left = leftover.get(sig(n)) ?? 0;
    blocks[n.block] = left > 0 ? "misplaced" : "extra";
    if (left > 0) leftover.set(sig(n), left - 1);
  }
  const missing = [...leftover.values()].reduce((a, b) => a + b, 0);
  const count = (nodes: PuzzleNode[]): number => nodes.reduce((sum, n) => sum + 1 + count(n.children ?? []), 0);
  const placed = count(answer);
  const correct = missing === 0 && Object.values(blocks).every((p) => p === "right") && challenge.solution.length > 0;
  return { correct, blocks, missing, expected: count(challenge.solution), placed };
}

const isJson = (value: unknown, depth = 0): value is Json => {
  if (depth > 8) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((v) => isJson(v, depth + 1));
  if (typeof value === "object") return Object.values(value as object).every((v) => isJson(v, depth + 1));
  return false;
};

/** A code task as stored or sent; null when it is not a valid one. */
export function readCodeTask(raw: unknown): CodeTask | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.fn !== "string" || !IDENTIFIER.test(c.fn)) return null;
  const params = (Array.isArray(c.params) ? c.params : []).filter((p): p is string => typeof p === "string" && IDENTIFIER.test(p)).slice(0, LIMITS.params);
  const tests = (Array.isArray(c.tests) ? c.tests : []).flatMap((t): CodeTest[] => {
    const r = typeof t === "object" && t !== null ? (t as Record<string, unknown>) : {};
    return Array.isArray(r.args) && isJson(r.args) && "expected" in r && isJson(r.expected) ? [{ args: r.args as Json[], expected: r.expected as Json }] : [];
  });
  return {
    fn: c.fn,
    params,
    starter: typeof c.starter === "string" ? c.starter : starterFor(c.fn, params),
    reference: typeof c.reference === "string" ? c.reference : "",
    tests: tests.slice(0, LIMITS.tests),
  };
}

function readBlocks(raw: unknown): PuzzleBlock[] {
  const ids = new Set<string>();
  return (Array.isArray(raw) ? raw : []).flatMap((b): PuzzleBlock[] => {
    const r = typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
    if (typeof r.id !== "string" || ids.has(r.id) || typeof r.text !== "string" || !BLOCK_KINDS.includes(r.kind as BlockKind)) return [];
    ids.add(r.id);
    return [{ id: r.id, text: r.text, kind: r.kind as BlockKind }];
  });
}

/**
 * The challenge as stored. Anything malformed in the JSON is dropped rather than trusted, so a bad row cannot break a
 * page. Problems drafted before the single challenge held four pillar stages: their last one (algoritma, the whole
 * program) becomes the challenge.
 */
export function readChallenge(raw: unknown): Challenge {
  const blank = blankChallenge();
  let source: unknown = raw;
  if (Array.isArray(raw)) source = raw[3] ?? raw[raw.length - 1];
  if (typeof source !== "object" || source === null || Array.isArray(source)) return blank;
  const s = source as Record<string, unknown>;
  const blocks = readBlocks(s.blocks);
  const solution = readArrangement(s.solution ?? [], blocks);
  return {
    prompt: typeof s.prompt === "string" ? s.prompt : blank.prompt,
    hint: typeof s.hint === "string" ? s.hint : "",
    ordered: typeof s.ordered === "boolean" ? s.ordered : blank.ordered,
    blocks,
    solution: "nodes" in solution ? solution.nodes : [],
    code: readCodeTask(s.code),
  };
}
