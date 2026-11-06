import type { BlockKind, Challenge, Json, PuzzleBlock, PuzzleNode, StudentChallenge } from "@/lib/api/types";

/**
 * Block kinds, Scratch-style: each has its own colour so a student recognises a step, a loop or a fact at a glance.
 * The fills are dark enough for white text (≥ 4.5:1) except "Mulai", which carries dark text on yellow, as Scratch does.
 */
export const KINDS: Record<BlockKind, { label: string; fill: string; edge: string; ink: string; container: boolean; hint: string }> = {
  event: { label: "Mulai", fill: "#F2B705", edge: "#C99700", ink: "#2B2000", container: false, hint: "Blok pembuka, seperti 'ketika mulai'." },
  action: { label: "Langkah", fill: "#2F6FD6", edge: "#2257AD", ink: "#FFFFFF", container: false, hint: "Satu langkah atau perintah." },
  loop: { label: "Ulangi", fill: "#B85C00", edge: "#8F4700", ink: "#FFFFFF", container: true, hint: "Mengulang blok di dalamnya." },
  if: { label: "Jika", fill: "#A34E00", edge: "#7A3A00", ink: "#FFFFFF", container: true, hint: "Menjalankan blok di dalamnya bila syaratnya benar." },
  part: { label: "Bagian masalah", fill: "#7445CC", edge: "#5A33A3", ink: "#FFFFFF", container: false, hint: "Satu bagian kecil dari masalah besar." },
  info: { label: "Informasi", fill: "#2B7A3D", edge: "#1F5C2D", ink: "#FFFFFF", container: false, hint: "Satu fakta dari cerita." },
};

export const KIND_ORDER: BlockKind[] = ["event", "action", "loop", "if", "part", "info"];

export const ISSUE_TEXT = {
  story_missing: "Cerita masalah belum diisi.",
  prompt_missing: "Instruksi untuk siswa belum diisi.",
  no_mode: "Pilih cara menjawab: tambahkan blok, atau aktifkan JavaScript.",
  solution_missing: "Kunci jawaban blok belum disusun.",
  container_empty: "Ada blok ulangi/jika yang masih kosong di kunci jawaban.",
  code_tests_missing: "Tugas JavaScript belum punya kasus uji.",
} as const;

/** Where the editor jumps to fix an issue. */
export const ISSUE_TARGET: Record<keyof typeof ISSUE_TEXT, "story" | "prompt" | "blocks" | "code"> = {
  story_missing: "story",
  prompt_missing: "prompt",
  no_mode: "blocks",
  solution_missing: "blocks",
  container_empty: "blocks",
  code_tests_missing: "code",
};

export const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,39}$/;

/** A function with the task's name and parameters and an empty body. */
export const starterFor = (fn: string, params: string[]) => `function ${fn}(${params.join(", ")}) {\n  // tulis kodemu di sini\n  \n}\n`;

/** The blocks of an arrangement as comment lines, indented like the stack: a bridge from blocks to code. */
export function treeAsComments(tree: PuzzleNode[], byId: Map<string, PuzzleBlock>, depth = 1): string {
  return tree
    .map((n) => {
      const text = byId.get(n.block)?.text ?? "";
      const line = `${"  ".repeat(depth)}// ${text}`;
      return n.children?.length ? `${line}\n${treeAsComments(n.children, byId, depth + 1)}` : line;
    })
    .join("\n");
}

// ---- Tree helpers: every function returns a new tree --------------------------------------------------------------

/** Where a block sits: the parent (null for the top stack) and its index there. */
export function locate(tree: PuzzleNode[], id: string, parent: string | null = null): { parent: string | null; index: number } | null {
  for (const [index, node] of tree.entries()) {
    if (node.block === id) return { parent, index };
    const inner = node.children && locate(node.children, id, node.block);
    if (inner) return inner;
  }
  return null;
}

export function findNode(tree: PuzzleNode[], id: string): PuzzleNode | null {
  for (const node of tree) {
    if (node.block === id) return node;
    const inner = node.children && findNode(node.children, id);
    if (inner) return inner;
  }
  return null;
}

export function removeNode(tree: PuzzleNode[], id: string): PuzzleNode[] {
  return tree.filter((n) => n.block !== id).map((n) => (n.children ? { ...n, children: removeNode(n.children, id) } : n));
}

export function insertNode(tree: PuzzleNode[], parent: string | null, index: number, node: PuzzleNode): PuzzleNode[] {
  if (parent === null) return [...tree.slice(0, index), node, ...tree.slice(index)];
  return tree.map((n) =>
    n.block === parent
      ? { ...n, children: [...(n.children ?? []).slice(0, index), node, ...(n.children ?? []).slice(index)] }
      : n.children
        ? { ...n, children: insertNode(n.children, parent, index, node) }
        : n,
  );
}

/** Moves a block (with what it holds) to a new place. `index` counts positions before the move. */
export function moveNode(tree: PuzzleNode[], id: string, parent: string | null, index: number): PuzzleNode[] {
  const node = findNode(tree, id);
  if (!node) return tree;
  if (parent !== null && (parent === id || findNode(node.children ?? [], parent))) return tree; // not into itself
  const from = locate(tree, id)!;
  const target = from.parent === parent && from.index < index ? index - 1 : index;
  return insertNode(removeNode(tree, id), parent, target, node);
}

export function usedIds(tree: PuzzleNode[], into = new Set<string>()): Set<string> {
  for (const n of tree) {
    into.add(n.block);
    if (n.children) usedIds(n.children, into);
  }
  return into;
}

export const countNodes = (tree: PuzzleNode[]): number => tree.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0);

export const newNode = (block: PuzzleBlock): PuzzleNode => (KINDS[block.kind].container ? { block: block.id, children: [] } : { block: block.id });

export const newBlockId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The same order on server and client (no hydration mismatch), different per stage. */
export function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---- Starter example ----------------------------------------------------------------------------------------------

const b = (id: string, kind: BlockKind, text: string): PuzzleBlock => ({ id, kind, text });

/** A worked example a teacher can start from: blocks and a JavaScript task for the same story. */
export const EXAMPLE: { title: string; story: string; challenge: Challenge } = {
  title: "Robot menyiram taman",
  story:
    "Robot Adi harus menyiram tanaman di taman berbentuk persegi. Setiap sisi taman panjangnya 3 kotak, dan di setiap sudut ada satu pot tanaman. " +
    "Robot mulai di salah satu sudut dan berjalan searah jarum jam. Robot itu berwarna biru dan dibuat pada tahun 2025.",
  challenge: {
    prompt: "Susun program lengkap agar robot menyiram keempat tanaman.",
    hint: "Langkah untuk satu sisi diulang sebanyak jumlah sudut.",
    ordered: true,
    blocks: [b("g1", "event", "ketika mulai"), b("g2", "loop", "ulangi 4 kali"), b("g3", "loop", "ulangi 3 kali"), b("g4", "action", "maju 1 kotak"), b("g5", "action", "siram tanaman"), b("g6", "action", "belok kanan"), b("g7", "action", "belok kiri"), b("g8", "loop", "ulangi 2 kali")],
    solution: [{ block: "g1" }, { block: "g2", children: [{ block: "g3", children: [{ block: "g4" }] }, { block: "g5" }, { block: "g6" }] }],
    code: {
      fn: "hitungLangkah",
      params: ["sisi", "panjang"],
      starter: "function hitungLangkah(sisi, panjang) {\n  // berapa kali robot maju 1 kotak untuk mengelilingi taman?\n  \n}\n",
      reference: "function hitungLangkah(sisi, panjang) {\n  let langkah = 0;\n  for (let i = 0; i < sisi; i++) {\n    langkah += panjang;\n  }\n  return langkah;\n}\n",
      tests: [
        { args: [4, 3], expected: 12 },
        { args: [4, 5], expected: 20 },
        { args: [3, 2], expected: 6 },
      ],
    },
  },
};

// ---- Flow playback ------------------------------------------------------------------------------------------------

export type FlowKind = "start" | "run" | "loop" | "loop-back" | "loop-end" | "check";

export interface FlowStep {
  block: string;
  /** What is happening, e.g. "putaran 2 dari 4". */
  note: string;
  kind: FlowKind;
  /** The round each running loop is in at this step, by loop id: "2/4", or "2" when the count is unknown. */
  rounds: Record<string, string>;
  /** On a jump back to the top of a loop: the blocks inside it, which start a fresh round. */
  reset?: string[];
}

/** Loops played out in full up to this many rounds; longer ones show the first rounds and say how many follow. */
const SHOWN_ROUNDS = 3;

/**
 * The order the blocks run in, for highlighting them one by one: a loop plays its body round by round (the count is
 * read from its text, e.g. "ulangi 4 kali"; a loop without one, e.g. "ulangi selama …", plays two rounds), and an
 * if-block checks its condition and then runs its body as if the condition held.
 */
export function traceFlow(tree: PuzzleNode[], byId: Map<string, PuzzleBlock>, prefix = "", rounds: Record<string, string> = {}): FlowStep[] {
  const steps: FlowStep[] = [];
  for (const node of tree) {
    const block = byId.get(node.block);
    if (!block) continue;
    const at = prefix ? `${prefix} · ` : "";
    if (block.kind === "loop") {
      const count = Number(/(\d+)\s*(?:kali|x\b)/i.exec(block.text)?.[1] ?? NaN);
      const known = Number.isFinite(count) && count > 0;
      const shown = known ? Math.min(count, SHOWN_ROUNDS) : 2;
      const label = (r: number) => (known ? `${r}/${count}` : `${r}`);
      const inside = [...usedIds(node.children ?? [])];
      steps.push({ block: block.id, kind: "loop", rounds: { ...rounds, [block.id]: label(1) }, note: `${at}${known ? `mulai mengulang ${count} kali` : "mulai mengulang selama syaratnya benar"}` });
      for (let r = 1; r <= shown; r++) {
        const round = known ? `putaran ${r} dari ${count}` : `putaran ${r}`;
        steps.push(...traceFlow(node.children ?? [], byId, `${at}${round}`, { ...rounds, [block.id]: label(r) }));
        if (r < shown || (known && count > shown) || !known) {
          steps.push({ block: block.id, kind: "loop-back", rounds: { ...rounds, [block.id]: label(known ? Math.min(r + 1, count) : r + 1) }, reset: inside, note: `${at}${round} selesai, kembali ke atas` });
        }
      }
      if (known && count > shown) steps.push({ block: block.id, kind: "loop-end", rounds: { ...rounds, [block.id]: label(count) }, note: `${at}… diulang sampai putaran ${count}` });
      else if (!known) steps.push({ block: block.id, kind: "loop-end", rounds: { ...rounds, [block.id]: "…" }, note: `${at}… sampai syaratnya tidak lagi benar` });
    } else if (block.kind === "if") {
      steps.push({ block: block.id, kind: "check", rounds, note: `${at}periksa syarat: ${block.text.replace(/^jika\s+/i, "")}` });
      steps.push(...traceFlow(node.children ?? [], byId, `${at}syarat benar`, rounds));
    } else {
      steps.push({ block: block.id, kind: block.kind === "event" ? "start" : "run", rounds, note: `${at}${block.kind === "event" ? "program dimulai" : "jalankan"}` });
    }
  }
  return steps;
}

/** What the workspace shows at one step of a run: the running block, the trail behind it, and each loop's round. */
export interface FlowView {
  active: string;
  kind: FlowKind;
  /** Blocks already run in the current pass; a jump back to the top of a loop clears what is inside it. */
  trail: Set<string>;
  rounds: Record<string, string>;
  /** The run reached its last step. */
  finished: boolean;
}

export function flowView(steps: FlowStep[], index: number, finished: boolean): FlowView {
  // at the end every block that ran lights up, and nothing is "running" any more
  if (finished) return { active: "", kind: "run", trail: new Set(steps.map((s) => s.block)), rounds: {}, finished };
  const trail = new Set<string>();
  for (const step of steps.slice(0, index + 1)) {
    step.reset?.forEach((id) => trail.delete(id));
    trail.add(step.block);
  }
  const step = steps[index];
  return { active: step.block, kind: step.kind, trail, rounds: step.rounds, finished };
}

// ---- Input/Output spec & code preview -----------------------------------------------------------------------------

/** One worked example: the value of each input and the output the program must give for them. */
export interface IoExample {
  id: string;
  inputs: string[];
  output: string;
}

/** What the program receives and gives back, shown before the student starts arranging anything. */
export interface IoSpec {
  /** Names of the inputs, e.g. ["nilai"]. Empty when the problem has no JavaScript task to read them from. */
  params: string[];
  /** Function name of the JavaScript task, if any. */
  fn: string | null;
  examples: IoExample[];
}

export function formatValue(value: Json): string {
  if (typeof value === "string") return `"${value}"`;
  if (value === null || value === undefined) return "-";
  if (Array.isArray(value)) return `[${value.map((item) => formatValue(item)).join(", ")}]`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** The input/output contract of a problem, read from its JavaScript test cases (the same problem in either mode). */
export function ioSpecOf(challenge: Pick<StudentChallenge, "code">): IoSpec {
  const code = challenge.code;
  if (!code) return { params: [], fn: null, examples: [] };
  return {
    params: code.params,
    fn: code.fn,
    examples: code.tests.slice(0, 6).map((test, index) => ({
      id: `t${index}`,
      inputs: code.params.map((_, i) => formatValue(test.args[i] ?? null)),
      output: formatValue(test.expected),
    })),
  };
}

/** Lines of a code-like outline of an arrangement: containers open a brace and close it after what they hold. */
export interface OutlineLine {
  /** The block on this line; a closing brace carries its container's id. */
  block: string;
  depth: number;
  text: string;
  kind: BlockKind | "close";
}

export function treeAsOutline(tree: PuzzleNode[], byId: Map<string, PuzzleBlock>, depth = 0): OutlineLine[] {
  const out: OutlineLine[] = [];
  for (const node of tree) {
    const block = byId.get(node.block);
    if (!block) continue;
    if (KINDS[block.kind].container) {
      out.push({ block: block.id, depth, kind: block.kind, text: `${block.text} {` });
      out.push(...treeAsOutline(node.children ?? [], byId, depth + 1));
      out.push({ block: block.id, depth, kind: "close", text: "}" });
    } else {
      out.push({ block: block.id, depth, kind: block.kind, text: block.text });
    }
  }
  return out;
}
