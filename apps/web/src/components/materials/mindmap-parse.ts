// Reading a mindmap out of an AI reply (and writing an edited one back). Pure functions, so the whiteboard and the
// server can use them without the Konva canvas.
import type { MindmapNodeItem, MindmapPayload } from "./mindmap-layout";

/**
 * Parses either a JSON mindmap payload (`{ title, nodes }`) OR an ASCII/markdown tree
 * into a normalized `MindmapPayload`. Returns `null` if the content is not a mindmap.
 */
export function extractMindmapFromContent(content: string): {
  mindmap: MindmapPayload;
  introText: string;
  outroText: string;
} | null {
  const codeBlockRegex = /```(?:mindmap|json)\s*([\s\S]*?)```/i;
  const match = codeBlockRegex.exec(content);
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        const before = content.slice(0, match.index).trim();
        const after = content.slice(match.index + match[0].length).trim();
        return {
          mindmap: normalizeMindmapObject(parsed),
          introText: before,
          outroText: after,
        };
      }
    } catch {
      // fall through
    }
  }

  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        return {
          mindmap: normalizeMindmapObject(parsed),
          introText: "",
          outroText: "",
        };
      }
    } catch {
      // fall through
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
  const nodes: MindmapNodeItem[] = [];

  rawNodes.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    const obj = item as Record<string, unknown>;
    const dataObj = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {};
    const id = String(obj.id ?? `n${idx + 1}`).trim();
    const rawParent = obj.parent_id ?? obj.parentId ?? null;
    const parent_id = rawParent ? String(rawParent).trim() : null;
    const label = String(obj.label ?? dataObj.label ?? `Konsep ${idx + 1}`).trim();
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
    if (!cleanLabel) return;

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

