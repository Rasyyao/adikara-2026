export interface CodeBlock {
  lang: string;
  code: string;
}

/** The fenced code blocks of an answer, in order. */
export function codeBlocksOf(content: string): CodeBlock[] {
  return [...content.matchAll(/```([\w+#-]*)[^\n]*\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].toLowerCase(), code: m[2].replace(/\s+$/, "") }));
}

/** Markdown marks would show as stray symbols in a plain text bubble or note; this leaves only the words. */
export function plain(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, "") // code blocks are shown apart from the text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)([\s\S]+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*([-*+])\s+/gm, "• ")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BOX_CHARS = /[│─┌┐└┘├┤┬┴┼▼▲╔╗╚╝║═]/;

/** A code block that is really a diagram drawn with line characters (│ ─ ┌ ▼ …); it is not code, and it never reaches the board. */
export const isTextDiagram = (code: string) => code.split("\n").filter((line) => BOX_CHARS.test(line)).length >= 2;
