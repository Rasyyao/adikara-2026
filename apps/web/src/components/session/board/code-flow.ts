// Turns brace-scoped code (C, Java, JavaScript, PHP, Go …) into a flowchart of its if / else branches.

import { newId } from "./geometry";
import { DEFAULT_STYLE, type BoardElement, type BoxElement, type FlowNodeKind, type Point, type PointsElement } from "./types";
import { branchPill, FLOW_STYLE, pillWidth } from "./visual";

type Step = { kind: "stmt"; text: string } | { kind: "if"; cond: string; then: Step[]; otherwise: Step[] };

/** Whether the code has an `if` worth drawing. */
export const hasIfElse = (code: string) => /\bif\s*\(/.test(code) || /\bif\s+[^\n{]+\{/.test(code);

/** Splits code into tokens: braces, and the text between them cut at `;`. */
function tokenize(code: string): string[] {
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  const tokens: string[] = [];
  let buf = "";
  let depth = 0; // parentheses, so the `;` of a for-header does not split
  for (const ch of clean) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === "{" || ch === "}" || (ch === ";" && depth === 0))) {
      if (buf.trim()) tokens.push(buf.trim());
      tokens.push(ch === ";" ? ";" : ch);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) tokens.push(buf.trim());
  return tokens.map((t) => t.replace(/\s+/g, " "));
}

/** A function header before its `{`: the scope is flattened into the flow, the header itself is not a step. */
const isHeader = (t: string) => !/^(if|else|for|while|do|switch|catch|try|foreach)\b/.test(t) && (/^(async\s+)?function\b/.test(t) || /^[\w<>\[\]*&:.,\s]+\([^()]*\)\s*(const|throws [\w, ]+)?$/.test(t));

export function parseIfElse(code: string): Step[] {
  const tokens = tokenize(code);
  let i = 0;

  /** Reads one scope (up to the matching `}`) or a single statement when there are no braces. */
  function block(): Step[] {
    if (tokens[i] === "{") {
      i++;
      const steps = sequence();
      if (tokens[i] === "}") i++;
      return steps;
    }
    const one = statement();
    return one ? [one] : [];
  }

  function sequence(): Step[] {
    const steps: Step[] = [];
    let flat = 0; // bare scopes (a function body) are flattened into the flow
    while (i < tokens.length) {
      if (tokens[i] === "{") {
        flat++;
        i++;
      } else if (tokens[i] === "}") {
        if (flat === 0) break;
        flat--;
        i++;
      } else {
        const s = statement();
        if (s) steps.push(s);
      }
    }
    return steps;
  }

  function statement(): Step | null {
    const t = tokens[i];
    if (t === undefined) return null;
    if (t === ";" || t === "{" || t === "}") {
      i++;
      return null;
    }
    if (tokens[i + 1] === "{" && isHeader(t)) {
      i++;
      return null;
    }
    const m = /^if\s*\((.*)\)\s*(.*)$/.exec(t);
    if (m) {
      i++;
      const cond = m[1].trim();
      // `if (x) return y;` has its statement in the same token
      const inline: Step[] = m[2] ? [{ kind: "stmt", text: m[2].trim() }] : [];
      const then = inline.length ? (tokens[i] === ";" && i++, inline) : block();
      let otherwise: Step[] = [];
      if (/^else\b/.test(tokens[i] ?? "")) {
        const e = tokens[i];
        const rest = e.replace(/^else\s*/, "");
        if (rest.startsWith("if")) {
          tokens[i] = rest; // `else if (…)` reads as an if in the else scope
          const nested = statement();
          otherwise = nested ? [nested] : [];
        } else if (rest) {
          tokens[i] = rest;
          otherwise = block();
        } else {
          i++;
          otherwise = block();
        }
      }
      return { kind: "if", cond, then, otherwise };
    }
    if (/^else\b/.test(t)) {
      // a stray else (its if was outside the snippet)
      i++;
      return null;
    }
    i++;
    if (tokens[i] === ";") i++;
    return { kind: "stmt", text: t };
  }

  const steps: Step[] = [];
  while (i < tokens.length) {
    steps.push(...sequence());
    i++; // a stray `}`
  }
  return steps;
}

// ---- layout -----------------------------------------------------------------------------------------------------------

const BOX_W = 200;
const BOX_H = 60;
const DIA_W = 240;
const DIA_H = 110;
const GAP_Y = 56;
const GAP_X = 40;

const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function widthOf(seq: Step[]): number {
  let w = BOX_W;
  for (const s of seq) {
    if (s.kind === "if") {
      const side = Math.max(widthOf(s.then), widthOf(s.otherwise), BOX_W);
      w = Math.max(w, DIA_W, side * 2 + GAP_X);
    }
  }
  return w;
}

interface Exit {
  /** Absolute path so far, ending where the next arrow continues. */
  path: Point[];
  /** The node the path leaves from. */
  from: string;
  /** The branch an empty `if` or `else` scope still has to name on the next arrow. */
  label?: string;
}

const ARROW_COLOR = "#495057";

/** A flowchart for the code, centred on (0, 0) at the top; null when there is no `if` to draw. Its shapes play like a flow. */
export function flowchartOf(code: string): BoardElement[] | null {
  const steps = parseIfElse(code);
  if (!steps.some((s) => s.kind === "if")) return null;

  const diagram = newId();
  const out: BoardElement[] = [];
  const pills: BoardElement[] = [];
  let order = 0;
  const box = (type: BoxElement["type"], cx: number, y: number, w: number, h: number, label: string, kind: FlowNodeKind, hint: string): string => {
    const look = FLOW_STYLE[kind];
    const node = `n${++order}`;
    out.push({
      ...DEFAULT_STYLE,
      id: newId(),
      type,
      x: cx - w / 2,
      y,
      width: w,
      height: h,
      label,
      backgroundColor: look.fill,
      strokeColor: look.stroke,
      strokeWidth: 2.5,
      version: 1,
      diagram: { id: diagram, kind: "flow", node, nodeKind: kind, step: order, hint },
    });
    return node;
  };
  const arrow = (path: Point[], from: string, to: string, label?: string) => {
    if (path.length < 2) return;
    const [x, y] = path[0];
    const tag = { id: diagram, kind: "flow" as const, from, to, step: order, ...(label ? { label } : {}) };
    const el: PointsElement = { ...DEFAULT_STYLE, id: newId(), type: "arrow", x, y, points: path.map((p): Point => [p[0] - x, p[1] - y]), strokeColor: ARROW_COLOR, strokeWidth: 2.5, version: 1, diagram: tag };
    out.push(el);
    if (label) {
      const [lx, ly] = path[Math.min(1, path.length - 1)];
      pills.push(branchPill(label === "Ya" ? lx - pillWidth(label) - 6 : lx + 6, ly - 32, label, tag));
    }
  };
  /** An elbow from the end of `path` down to the node `to` whose top is at `target`. */
  const connect = (from: Exit, target: Point, to: string, label?: string) => {
    const [lx, ly] = from.path[from.path.length - 1];
    const [tx, ty] = target;
    const path = [...from.path];
    if (Math.abs(lx - tx) > 0.5) {
      const my = Math.max(ly, ty - GAP_Y / 2);
      path.push([lx, my], [tx, my]);
    }
    path.push([tx, ty]);
    arrow(path, from.from, to, label);
  };

  /** Lays a sequence under `entry`; returns where it ends (the loose ends and the y below). */
  function place(seq: Step[], cx: number, y: number, incoming: Exit[], incomingLabel?: string): { exits: Exit[]; y: number } {
    let exits = incoming;
    let label = incomingLabel;
    let cursor = y;
    for (const s of seq) {
      if (s.kind === "stmt") {
        const node = box("rectangle", cx, cursor, BOX_W, BOX_H, short(s.text, 60), "step", "Komputer menjalankan baris ini.");
        for (const e of exits) connect(e, [cx, cursor], node, e.label ?? label);
        label = undefined;
        exits = [{ path: [[cx, cursor + BOX_H]], from: node }];
        cursor += BOX_H + GAP_Y;
      } else {
        const node = box("diamond", cx, cursor, DIA_W, DIA_H, `${short(s.cond, 34)}?`, "decision", `Komputer memeriksa apakah ${short(s.cond, 60)} benar. Jika benar ikuti "Ya", jika tidak ikuti "Tidak".`);
        for (const e of exits) connect(e, [cx, cursor], node, e.label ?? label);
        label = undefined;
        const side = Math.max(widthOf(s.then), widthOf(s.otherwise), BOX_W);
        const leftX = cx - (side + GAP_X) / 2;
        const rightX = cx + (side + GAP_X) / 2;
        const midY = cursor + DIA_H / 2;
        const top = cursor + DIA_H + GAP_Y;
        const yes = place(s.then, leftX, top, [{ path: [[cx - DIA_W / 2, midY], [leftX, midY]], from: node }], "Ya");
        const no = place(s.otherwise, rightX, top, [{ path: [[cx + DIA_W / 2, midY], [rightX, midY]], from: node }], "Tidak");
        // an empty branch still carries its label to the next node
        exits = [...yes.exits.map((e) => ({ ...e, label: s.then.length ? e.label : "Ya" })), ...no.exits.map((e) => ({ ...e, label: s.otherwise.length ? e.label : "Tidak" }))];
        cursor = Math.max(yes.y, no.y, top);
      }
    }
    return { exits, y: cursor };
  }

  const start = box("ellipse", 0, 0, 150, 52, "Mulai", "start", "Program mulai berjalan dari sini.");
  const body = place(steps, 0, 52 + GAP_Y, [{ path: [[0, 52]], from: start }]);
  const end = box("ellipse", 0, body.y, 150, 52, "Selesai", "end", "Program selesai di sini.");
  for (const e of body.exits) connect(e, [0, body.y], end, e.label);
  return [...out, ...pills];
}
