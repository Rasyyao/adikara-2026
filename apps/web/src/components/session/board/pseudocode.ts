// A flow written out as pseudocode in plain Indonesian (MULAI, JIKA … MAKA, SELAMA … LAKUKAN, SELESAI), every line
// knowing the node it stands for, so the playback can light up the line of the step the class is looking at.

import type { FlowEdge, FlowNode } from "./visual";

export type PseudoKind = "start" | "step" | "if" | "else" | "endif" | "while" | "endwhile" | "goto" | "end";

export interface PseudoLine {
  text: string;
  indent: number;
  kind: PseudoKind;
  /** The flow node the line stands for; an ELSE or END line points at its decision. */
  node: string | null;
  /** The branch this line opens (the "Ya" of a JIKA, the "Tidak" of a SELAIN ITU), as the arrow it stands for. */
  branch?: { from: string; to: string; label: string | null };
}

const YES = /^(ya|yes|benar|true)$/i;
const NO = /^(tidak|no|salah|false)$/i;
const MAX_LINES = 80;

/** The condition of a decision without its question mark: "nilai >= 75?" reads "nilai >= 75". */
const condition = (label: string) => label.replace(/[?？]\s*$/, "").trim() || label;

export function pseudocodeOf(flow: { nodes: FlowNode[]; edges: FlowEdge[] }): PseudoLine[] {
  if (flow.nodes.length === 0) return [];
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const outOf = new Map<string, FlowEdge[]>(flow.nodes.map((n) => [n.id, []]));
  for (const e of flow.edges) outOf.get(e.from)?.push(e);
  const rank = (e: FlowEdge) => (e.label && YES.test(e.label) ? 0 : e.label && NO.test(e.label) ? 2 : 1);
  for (const list of outOf.values()) list.sort((a, b) => rank(a) - rank(b));

  /** Steps from `from` to every node it reaches, without passing through `stop`. */
  const distances = (from: string, stop: Set<string>) => {
    const dist = new Map<string, number>([[from, 0]]);
    const queue = [from];
    while (queue.length) {
      const at = queue.shift()!;
      if (stop.has(at) && at !== from) continue;
      for (const e of outOf.get(at) ?? []) {
        if (!dist.has(e.to)) {
          dist.set(e.to, dist.get(at)! + 1);
          queue.push(e.to);
        }
      }
    }
    return dist;
  };
  /** Where two branches meet again: the nearest node both reach. */
  const joinOf = (a: string, b: string, stop: Set<string>): string | null => {
    const da = distances(a, stop);
    const db = distances(b, stop);
    let best: string | null = null;
    let score = Infinity;
    for (const [id, d] of da) {
      const other = db.get(id);
      if (other !== undefined && d + other < score) {
        score = d + other;
        best = id;
      }
    }
    return best;
  };

  const lines: PseudoLine[] = [];
  const lineOf = new Map<string, number>();
  const push = (line: PseudoLine) => {
    if (lines.length < MAX_LINES) lines.push(line);
  };

  function emit(start: string | null, indent: number, stop: Set<string>) {
    let id = start;
    while (id && !stop.has(id) && lines.length < MAX_LINES) {
      const node = byId.get(id);
      if (!node) return;
      if (lineOf.has(id)) {
        // a jump back to a node written earlier
        push({ text: `KEMBALI KE baris ${lineOf.get(id)! + 1} (${node.kind === "decision" ? condition(node.label) : node.label})`, indent, kind: "goto", node: id });
        return;
      }
      lineOf.set(id, lines.length);
      const outs = outOf.get(id) ?? [];
      if (node.kind === "start") {
        push({ text: "MULAI", indent, kind: "start", node: id });
        id = outs[0]?.to ?? null;
        continue;
      }
      if (node.kind === "end") {
        push({ text: "SELESAI", indent, kind: "end", node: id });
        return;
      }
      if (node.kind === "step" || outs.length < 2) {
        push({ text: node.label, indent, kind: "step", node: id });
        id = outs[0]?.to ?? null;
        continue;
      }

      const [yes, no] = outs;
      const cond = condition(node.label);
      const reaches = (from: string) => distances(from, stop).has(id!);
      // a branch that comes back to its own question is a loop: SELAMA … LAKUKAN
      const loop = reaches(yes.to) ? { body: yes, exit: no, text: `SELAMA ${cond} LAKUKAN` } : reaches(no.to) ? { body: no, exit: yes, text: `SELAMA TIDAK (${cond}) LAKUKAN` } : null;
      if (loop) {
        push({ text: loop.text, indent, kind: "while", node: id, branch: loop.body });
        emit(loop.body.to, indent + 1, new Set([...stop, id]));
        push({ text: "AKHIR SELAMA", indent, kind: "endwhile", node: id });
        id = loop.exit.to;
        continue;
      }

      const join = joinOf(yes.to, no.to, stop);
      const inner = new Set([...stop, ...(join ? [join] : [])]);
      // an empty "Ya" reads better as a negated question with the "Tidak" steps inside
      const [first, second, text] = yes.to === join && no.to !== join ? [no, null, `JIKA TIDAK (${cond}) MAKA`] : [yes, no.to === join ? null : no, `JIKA ${cond} MAKA`];
      push({ text, indent, kind: "if", node: id, branch: first });
      emit(first.to, indent + 1, inner);
      if (second) {
        push({ text: "SELAIN ITU", indent, kind: "else", node: id, branch: second });
        emit(second.to, indent + 1, inner);
      }
      push({ text: "AKHIR JIKA", indent, kind: "endif", node: id });
      id = join;
    }
  }

  const start = flow.nodes.find((n) => n.kind === "start") ?? flow.nodes[0];
  emit(start.id, 0, new Set());
  return lines;
}

/**
 * The lines lit up for a step: the line of its node, and the JIKA / SELAIN ITU / SELAMA line of the branch taken to get
 * there, so the class sees which side of the question the program went down.
 */
export function linesForStep(lines: PseudoLine[], node: string | null, via: { from: string; to: string; label: string | null } | null): { main: number[]; branch: number[] } {
  const main = lines.flatMap((l, i) => (l.node === node && l.kind !== "else" && l.kind !== "endif" && l.kind !== "endwhile" && l.kind !== "goto" ? [i] : []));
  const branch = via ? lines.flatMap((l, i) => (l.branch && l.branch.from === via.from && l.branch.to === via.to ? [i] : [])) : [];
  return { main, branch };
}
