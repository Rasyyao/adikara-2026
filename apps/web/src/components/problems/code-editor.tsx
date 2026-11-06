"use client";

import { useRef, type KeyboardEvent } from "react";

const INDENT = "  ";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Visible rows; the editor grows with its content up to `maxRows`. */
  minRows?: number;
  maxRows?: number;
  readOnly?: boolean;
  /** Ctrl/Cmd + Enter. */
  onRun?: () => void;
}

/**
 * A small code editor: monospace, line numbers, Tab indents (Shift+Tab outdents), Enter keeps the indent, and
 * Ctrl+Enter runs. Esc leaves the editor, so Tab never traps keyboard users.
 */
export function CodeEditor({ id, label, value, onChange, minRows = 8, maxRows = 22, readOnly, onRun }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split("\n").length;
  const rows = Math.min(Math.max(lines, minRows), maxRows);

  const replace = (start: number, end: number, text: string, caretStart: number, caretEnd = caretStart) => {
    const el = ref.current!;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => el.setSelectionRange(caretStart, caretEnd));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onRun?.();
      return;
    }
    if (e.key === "Escape") {
      el.blur();
      return;
    }
    if (readOnly) return;
    if (e.key === "Tab") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      if (start === end && !e.shiftKey) return replace(start, end, INDENT, start + INDENT.length);
      // indent or outdent every selected line
      const block = value.slice(lineStart, end);
      const changed = block
        .split("\n")
        .map((line) => (e.shiftKey ? line.replace(/^ {1,2}/, "") : INDENT + line))
        .join("\n");
      const shift = changed.length - block.length;
      const firstShift = e.shiftKey ? -Math.min(INDENT.length, (/^ */.exec(value.slice(lineStart))?.[0].length ?? 0)) : INDENT.length;
      replace(lineStart, end, changed, Math.max(lineStart, start + firstShift), end + shift);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && start === end) {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const indent = /^ */.exec(value.slice(lineStart))![0];
      const opens = /[{([]\s*$/.test(value.slice(lineStart, start));
      const closes = /^\s*[})\]]/.test(value.slice(start));
      if (opens && closes) {
        // between a pair of brackets: open an indented line and push the closing one down
        const inside = `\n${indent}${INDENT}`;
        return replace(start, end, `${inside}\n${indent}`, start + inside.length);
      }
      const next = `\n${indent}${opens ? INDENT : ""}`;
      return replace(start, end, next, start + next.length);
    }
  };

  return (
    <div className="pcode flex overflow-hidden rounded-lg border border-[#2b2f3a] bg-[#1e2129] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
      <div ref={gutter} aria-hidden="true" className="select-none overflow-hidden border-r border-[#2b2f3a] bg-[#181a20] px-2 py-3 text-right font-mono text-[13px] leading-[1.6] text-[#6b7280]" style={{ height: `${rows * 1.6 + 1.5}em` }}>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        value={value}
        readOnly={readOnly}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        aria-describedby={`${id}-keys`}
        className="min-w-0 flex-1 resize-none bg-transparent px-3 py-3 font-mono text-[13px] leading-[1.6] text-[#e6e8ee] caret-[#ffd23f] outline-none selection:bg-[#3b4256]"
        style={{ tabSize: 2, height: `${rows * 1.6 + 1.5}em` }}
      />
      <span id={`${id}-keys`} className="sr-only">
        Tab menjorokkan baris, Shift+Tab mengurangi, Escape keluar dari editor{onRun ? ", Ctrl+Enter menjalankan kode" : ""}.
      </span>
    </div>
  );
}
