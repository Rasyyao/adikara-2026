// Reading a mindmap out of an AI reply (and writing an edited one back). Pure functions, so the whiteboard and the
// server can use them without the Konva canvas.
import type { MindmapNodeItem, MindmapPayload } from "./mindmap-layout";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A flow diagram has `nodes` too, but with a visual diagram `type` (`flow`, `timeline`, etc.) and flow node `kind`s.
 * Note: the Python worker's `mindmap` JSON also includes React Flow `edges` alongside `parent_id` / `data` nodes,
 * so the presence of `edges` alone does NOT make a mindmap a visual payload.
 */
function isVisualPayload(p: Record<string, unknown>, fenceLang?: string): boolean {
  if (fenceLang?.toLowerCase() === "mindmap") return false;
  if (typeof p.type === "string") {
    if (/^mindmap$/i.test(p.type)) return false;
    if (/^(flow|flowchart|diagram|timeline|comparison|compare|trace|simulation|simulasi|code)$/i.test(p.type)) {
      return true;
    }
  }
  const nodes = Array.isArray(p.nodes) ? p.nodes : [];
  const hasMindmapNodeShape = nodes.some(
    (n) =>
      isRecord(n) &&
      ("parent_id" in n ||
        "parentId" in n ||
        "data" in n ||
        (typeof n.type === "string" && /^(root|materi|submateri|cakupan|contoh|topic|subtopic|branch|leaf)$/i.test(n.type))),
  );
  if (hasMindmapNodeShape) return false;
  return Array.isArray(p.edges);
}

/**
 * Parses strict or slightly malformed/truncated JSON (e.g. smart quotes, trailing commas, or output cut off mid-array).
 */
function parseLooseMindmapJson(rawText: string): Record<string, unknown> | null {
  const cleaned = rawText.trim();
  if (!cleaned) return null;

  const tryParse = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const normalized = cleaned.replace(/[\u201c\u201d]/g, '"').replace(/,(\s*[}\]])/g, "$1");
  const afterNorm = tryParse(normalized);
  if (afterNorm) return afterNorm;

  // Attempt auto-closing open strings/brackets
  const autoClose = (input: string): string => {
    let fixed = input;
    const closers: string[] = [];
    let inString = false;
    for (let i = 0; i < fixed.length; i++) {
      const c = fixed[i];
      if (inString) {
        if (c === "\\") i++;
        else if (c === '"') inString = false;
      } else if (c === '"') {
        inString = true;
      } else if (c === "{") {
        closers.push("}");
      } else if (c === "[") {
        closers.push("]");
      } else if (c === "}" || c === "]") {
        closers.pop();
      }
    }
    if (inString) fixed += '"';
    fixed = fixed.replace(/[,:\s]+$/, "") + closers.reverse().join("");
    return fixed.replace(/,(\s*[}\]])/g, "$1");
  };

  const closed = tryParse(autoClose(normalized));
  if (closed && Array.isArray(closed.nodes) && closed.nodes.length > 0) return closed;

  // If truncated in the middle of a node object inside `"nodes": [ ... ]`, trim back to the last complete `}`
  let cursor = normalized.length;
  for (let attempt = 0; attempt < 8; attempt++) {
    const lastBrace = normalized.lastIndexOf("}", cursor - 1);
    if (lastBrace <= 0) break;
    const candidate = tryParse(autoClose(normalized.slice(0, lastBrace + 1)));
    if (candidate && Array.isArray(candidate.nodes) && candidate.nodes.length > 0) {
      return candidate;
    }
    cursor = lastBrace;
  }

  return null;
}

/**
 * Parses either a JSON mindmap payload (`{ title, nodes }`) OR an ASCII/markdown tree
 * into a normalized `MindmapPayload`. Returns `null` if the content is not a mindmap.
 */
export function extractMindmapFromContent(content: string): {
  mindmap: MindmapPayload;
  introText: string;
  outroText: string;
} | null {
  const fenceRegex = /```(mindmap|json)?[^\n]*\n([\s\S]*?)(?:```|$)/gi;
  for (const match of content.matchAll(fenceRegex)) {
    const fenceLang = (match[1] ?? "").trim().toLowerCase();
    const body = (match[2] ?? "").trim();
    if (!body.startsWith("{")) continue;
    const parsed = parseLooseMindmapJson(body);
    if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0 && !isVisualPayload(parsed, fenceLang)) {
      const normalized = normalizeMindmapObject(parsed);
      if (normalized.nodes.length > 0) {
        const start = match.index ?? 0;
        const before = content.slice(0, start).trim();
        const after = content.slice(start + match[0].length).trim();
        return {
          mindmap: normalized,
          introText: before,
          outroText: after,
        };
      }
    }
  }

  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    const parsed = parseLooseMindmapJson(trimmed);
    if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0 && !isVisualPayload(parsed)) {
      const normalized = normalizeMindmapObject(parsed);
      if (normalized.nodes.length > 0) {
        return {
          mindmap: normalized,
          introText: "",
          outroText: "",
        };
      }
    }
  }

  if (/[├└]──/.test(content)) {
    const parsedAscii = parseAsciiTreeMindmap(content);
    if (parsedAscii) return parsedAscii;
  }

  return null;
}

/**
 * Writes an edited mindmap back into the message it came from: the mindmap becomes one ```mindmap block,
 * and the text the AI wrote before and after it is kept.
 */
export function replaceMindmapInContent(content: string, mindmap: MindmapPayload): string {
  const extracted = extractMindmapFromContent(content);
  const payload = {
    title: mindmap.title,
    nodes: mindmap.nodes.map((n) => ({ id: n.id, parent_id: n.parent_id, label: n.label, text: n.text, source: n.source ?? null })),
  };
  const block = "```mindmap\n" + JSON.stringify(payload, null, 2) + "\n```";
  return [extracted?.introText ?? "", block, extracted?.outroText ?? ""].filter(Boolean).join("\n\n");
}

export const defaultNodePrompt = (label: string) => `Tolong jelaskan secara mendalam mengenai "${label}" berdasarkan materi ini.`;

/** True while the teacher has not written their own prompt, so a renamed label can update it too. */
export function isGeneratedPrompt(text: string, label: string): boolean {
  return text === defaultNodePrompt(label) || (text.startsWith("Tolong jelaskan") && text.includes(`"${label}"`));
}

function normalizeMindmapObject(raw: Record<string, unknown>): MindmapPayload {
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Mindmap Materi";
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const parentByChildId = new Map<string, string>();
  for (const edge of rawEdges) {
    if (!isRecord(edge)) continue;
    const parent = String(edge.source ?? edge.from ?? "").trim();
    const child = String(edge.target ?? edge.to ?? "").trim();
    if (parent && child && parent !== child && !parentByChildId.has(child)) {
      parentByChildId.set(child, parent);
    }
  }

  const nodes: MindmapNodeItem[] = [];

  rawNodes.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    const obj = item as Record<string, unknown>;
    const dataObj = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {};
    const rawLabel = obj.label ?? dataObj.label;
    if (rawLabel === undefined && idx > 0) return;
    const id = String(obj.id ?? `n${idx + 1}`).trim();
    const rawParent = obj.parent_id ?? obj.parentId ?? dataObj.parent_id ?? parentByChildId.get(id) ?? null;
    const parent_id = rawParent ? String(rawParent).trim() : null;
    const label = String(rawLabel ?? `Konsep ${idx + 1}`).trim();
    if (!label) return;
    const text = String(
      obj.text ??
        obj.prompt ??
        dataObj.text ??
        dataObj.prompt ??
        `Tolong jelaskan secara mendalam mengenai "${label}" berdasarkan materi ini.`,
    ).trim();
    const source = obj.source || dataObj.source ? String(obj.source ?? dataObj.source).trim() : null;
    nodes.push({ id, parent_id, label, text, source });
  });

  return { title, nodes };
}

function parseAsciiTreeMindmap(content: string): {
  mindmap: MindmapPayload;
  introText: string;
  outroText: string;
} | null {
  const titleMatch = /^#{1,4}\s*(?:🧠\s*)?(.+)$/m.exec(content);
  const title = titleMatch
    ? titleMatch[1].replace(/\*\*+/g, "").replace(/^MINDMAP MATERI:\s*/i, "").trim()
    : "Mindmap Materi";

  const lines = content.split("\n");
  const treeLines = lines.filter((line) => /[├└]──/.test(line));
  if (treeLines.length < 2) return null;

  const nodes: MindmapNodeItem[] = [
    {
      id: "root",
      parent_id: null,
      label: title,
      text: `Tolong jelaskan gambaran umum secara menyeluruh mengenai ${title}.`,
      source: "Materi utama",
    },
  ];

  const parentStack: Array<{ indent: number; id: string; label: string }> = [{ indent: -1, id: "root", label: title }];

  treeLines.forEach((line, idx) => {
    const branchMatch = /^([\s│]*)[├└]──\s*(.+)$/.exec(line);
    if (!branchMatch) return;
    const indent = branchMatch[1].length;
    const cleanLabel = branchMatch[2].replace(/\*\*+/g, "").trim();
    // ASCII art ("──┼──", arrows) is not a concept: a label needs a letter or a digit
    if (!/[\p{L}\p{N}]/u.test(cleanLabel)) return;

    while (parentStack.length > 1 && parentStack[parentStack.length - 1].indent >= indent) {
      parentStack.pop();
    }

    const parent = parentStack[parentStack.length - 1];
    const id = `ascii-${idx + 1}`;
    nodes.push({
      id,
      parent_id: parent.id,
      label: cleanLabel,
      text: `Tolong jelaskan lebih detail mengenai "${cleanLabel}" pada bagian "${parent.label}" beserta contohnya.`,
      source: null,
    });
    parentStack.push({ indent, id, label: cleanLabel });
  });

  if (nodes.length <= 1) return null;

  return {
    mindmap: { title, nodes },
    introText: "",
    outroText: "",
  };
}

