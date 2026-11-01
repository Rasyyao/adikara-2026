"use client";

import type { LiveCursor } from "./live-sync";
import type { View } from "./types";

/** Colours for students' cursors, one per student (always the same for the same student). */
const STUDENT_COLORS = ["#0ca678", "#e8590c", "#d6336c", "#1971c2", "#7048e8", "#2f9e44", "#c2255c", "#1098ad"];
const TEACHER_COLOR = "#4338ca";

function colorOf(cursor: LiveCursor): string {
  if (cursor.role === "teacher") return TEACHER_COLOR;
  let hash = 0;
  for (const c of cursor.id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return STUDENT_COLORS[Math.abs(hash) % STUDENT_COLORS.length];
}

/**
 * The pointers of the others on the board, each with a name tag: the teacher's says "Guru" and is a little larger, so
 * a class follows what the teacher points at. They glide between updates, which come a few times a second.
 */
export function LiveCursors({ cursors, view }: { cursors: LiveCursor[]; view: View }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {cursors.map((cursor) => {
        const color = colorOf(cursor);
        const teacher = cursor.role === "teacher";
        return (
          <div
            key={cursor.id}
            className="absolute left-0 top-0 transition-transform duration-150 ease-linear motion-reduce:transition-none"
            style={{ transform: `translate(${view.x + cursor.x * view.zoom}px, ${view.y + cursor.y * view.zoom}px)` }}
          >
            <svg width={teacher ? 26 : 20} height={teacher ? 26 : 20} viewBox="0 0 24 24" className="drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]">
              <path d="M3 2l7.5 19 2.6-7.7L21 10.6z" fill={color} stroke="#ffffff" strokeWidth={1.6} strokeLinejoin="round" />
            </svg>
            <span
              className={`absolute left-4 top-5 flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-semibold text-white shadow-sm ${teacher ? "text-small" : "text-[11px]"}`}
              style={{ backgroundColor: color }}
            >
              {cursor.name}
              {teacher && <span className="rounded-full bg-white/25 px-1.5 text-[10px] uppercase tracking-wide">Guru</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
