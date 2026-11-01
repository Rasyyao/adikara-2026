// An AI answer as a note card for the board: the text in a box, with headings, paragraphs, bullets and numbered steps
// set apart and large enough to read from the back of a class. Long answers continue in a second and third card.

import { lineHeightOf, wrapToWidth } from "./geometry";
import { isTextDiagram, plain } from "./markdown";
import type { BoardElement } from "./types";
import { box, text } from "./visual";

type Block = { kind: "heading" | "para" | "code"; text: string } | { kind: "bullet" | "number"; text: string; marker: string };

const W = 640;
const PAD = 28;
const GAP = 14;
const CARD_GAP = 40;
const MAX_CARD_HEIGHT = 820;
const MAX_CARDS = 3;
const SIZE = { heading: 26, body: 20, code: 17 };
const INDENT = { bullet: 26, number: 36 };
const COLORS = { heading: "#d9480f", body: "#1e1e1e", code: "#343a40", marker: "#d9480f" };

/** The answer as blocks. Diagrams drawn in text, rules and the list of web links are left out. */
export function blocksOf(raw: string): Block[] {
  const blocks: Block[] = [];
  const lines = raw.split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    const joined = plain(paragraph.join(" "));
    if (joined) blocks.push({ kind: "para", text: joined });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      const body = code.join("\n").replace(/\s+$/, "");
      if (body && !isTextDiagram(body)) blocks.push({ kind: "code", text: body });
      continue;
    }
    if (/^\s*[#*_\s🌐]*sumber referensi/i.test(line)) break; // the links of the web search are for the teacher, not the class
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•+]\s+(.*)$/.exec(line);
    const number = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: plain(heading[1]) });
    } else if (bullet && !/^\s*[-*_]{3,}\s*$/.test(line)) {
      flush();
      blocks.push({ kind: "bullet", marker: "•", text: plain(bullet[1]) });
    } else if (number) {
      flush();
      blocks.push({ kind: "number", marker: `${number[1]}.`, text: plain(number[2]) });
    } else if (!line.trim() || /^\s*[-*_=]{3,}\s*$/.test(line) || /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line)) {
      flush(); // blank lines, rules and the separator row of a table
    } else if (/^\s*\|/.test(line)) {
      flush();
      const row = plain(line.split("|").map((cell) => cell.replace(/<br\s*\/?>/gi, "; ").trim()).filter(Boolean).join("  ·  "));
      if (row) blocks.push({ kind: "para", text: row });
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks.filter((b) => b.text);
}

interface Laid {
  height: number;
  /** Shapes of the block with their top at `y`, left edge at `x`. */
  draw: (x: number, y: number) => BoardElement[];
}

function layOut(block: Block): Laid {
  const inner = W - PAD * 2;
  if (block.kind === "code") {
    const lines = wrapToWidth(block.text, SIZE.code, inner - 24);
    const height = lines.length * lineHeightOf(SIZE.code) + 24;
    return {
      height,
      draw: (x, y) => [box("rectangle", x, y, inner, height, "", "#f1f3f5"), text(x + 12, y + 12, lines.join("\n"), SIZE.code, COLORS.code)],
    };
  }
  const fontSize = block.kind === "heading" ? SIZE.heading : SIZE.body;
  const indent = block.kind === "bullet" || block.kind === "number" ? INDENT[block.kind] : 0;
  const lines = wrapToWidth(block.text, fontSize, inner - indent);
  const color = block.kind === "heading" ? COLORS.heading : COLORS.body;
  return {
    height: lines.length * lineHeightOf(fontSize),
    draw: (x, y) => [
      ...("marker" in block ? [text(x, y, block.marker, fontSize, COLORS.marker)] : []),
      text(x + indent, y, lines.join("\n"), fontSize, color),
    ],
  };
}

/** The note as shapes, centred on x = 0 with the top at y = 0; empty when the answer has nothing to show. */
export function noteElements(raw: string): BoardElement[] {
  const laid = blocksOf(raw).map((block) => ({ block, ...layOut(block) }));
  if (laid.length === 0) return [];

  // fill a card up to MAX_CARD_HEIGHT, then continue in the next; a heading does not end up alone at the bottom
  const cards: (typeof laid)[] = [[]];
  let used = 0;
  for (const item of laid) {
    const full = used > 0 && (used + item.height > MAX_CARD_HEIGHT || (item.block.kind === "heading" && used > MAX_CARD_HEIGHT * 0.7));
    if (full && cards.length < MAX_CARDS) {
      cards.push([]);
      used = 0;
    }
    if (cards.length === MAX_CARDS && used + item.height > MAX_CARD_HEIGHT) break; // the rest stays in the chat
    cards[cards.length - 1].push(item);
    used += item.height + GAP;
  }

  const total = cards.length * W + (cards.length - 1) * CARD_GAP;
  const out: BoardElement[] = [];
  cards.forEach((items, index) => {
    const x = -total / 2 + index * (W + CARD_GAP);
    const height = items.reduce((sum, item) => sum + item.height, 0) + GAP * (items.length - 1) + PAD * 2;
    out.push({ ...box("rectangle", x, 0, W, height, "", "#fff9db"), strokeColor: "#f08c00" });
    let y = PAD;
    for (const item of items) {
      out.push(...item.draw(x + PAD, y));
      y += item.height + GAP;
    }
  });
  return out;
}
