"use client";

import QRCode from "qrcode";
import { useMemo, useSyncExternalStore } from "react";
import { FONT_FAMILY, wrapToWidth } from "./geometry";
import { QUIZ_CARD, type QuizElement } from "./types";

const INDIGO = "#4338ca";
const KIND_LABEL: Record<string, string> = { pretest: "Pre-Test", posttest: "Post-Test", quiz: "Kuis" };

/** The page a student opens to take the quiz; the QR code holds it. */
export const quizPath = (sessionId: string, quizId: string) => `/student/sessions/${sessionId}/quiz/${quizId}`;

const noSubscribe = () => () => {};

/** The QR code of `text` as one SVG path of its dark modules, `size` units square. */
function qrPath(text: string, size: number): string {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const cell = size / modules.size;
  let d = "";
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) d += `M${(col * cell).toFixed(2)} ${(row * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
    }
  }
  return d;
}

/**
 * A quiz on the board: what it is, how many questions, and a QR code big enough to scan from the back of a classroom.
 * Drawn at QUIZ_CARD size and scaled to the element, so it reads the same at any size.
 */
export function QuizCard({ el }: { el: QuizElement }) {
  // the address is only known in the browser; the server draws the card without its code
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const url = origin ? `${origin}${quizPath(el.sessionId, el.quizId)}?from=qr` : "";
  const qr = useMemo(() => (url ? qrPath(url, 232) : ""), [url]);
  const { w, h } = QUIZ_CARD;
  const title = wrapToWidth(el.title, 24, w - 48).slice(0, 2);
  const closed = el.closed === true;
  return (
    <g transform={`translate(${el.x} ${el.y}) scale(${el.width / w} ${el.height / h})`} style={{ userSelect: "none" }}>
      <rect x={4} y={6} width={w} height={h} rx={22} fill="rgb(15 23 42 / 0.12)" />
      <rect width={w} height={h} rx={22} fill="#ffffff" stroke={closed ? "#868e96" : INDIGO} strokeWidth={3} />
      <path d={`M0 22a22 22 0 0 1 22-22h${w - 44}a22 22 0 0 1 22 22v34h-${w}z`} fill={closed ? "#868e96" : INDIGO} />
      <text x={24} y={36} fill="#ffffff" fontFamily={FONT_FAMILY} fontSize={17} fontWeight={700} letterSpacing={1.5}>
        {`📝 ${(KIND_LABEL[el.kind] ?? "Kuis").toUpperCase()}`}
      </text>
      <text x={w - 24} y={36} fill="#ffffff" fontFamily={FONT_FAMILY} fontSize={15} fontWeight={600} textAnchor="end">
        {closed ? "Ditutup" : `${el.questionCount} soal`}
      </text>
      {title.map((line, i) => (
        <text key={i} x={w / 2} y={92 + i * 30} fill="#212529" fontFamily={FONT_FAMILY} fontSize={24} fontWeight={700} textAnchor="middle">
          {line}
        </text>
      ))}
      <g transform={`translate(${(w - 232) / 2} ${title.length > 1 ? 140 : 118})`} opacity={closed ? 0.25 : 1}>
        <rect x={-10} y={-10} width={252} height={252} rx={12} fill="#ffffff" stroke="#dee2e6" strokeWidth={2} />
        {qr ? <path d={qr} fill="#111827" /> : <rect width={232} height={232} fill="#f1f3f5" />}
      </g>
      <text x={w / 2} y={h - 46} fill={closed ? "#868e96" : INDIGO} fontFamily={FONT_FAMILY} fontSize={18} fontWeight={700} textAnchor="middle">
        {closed ? "Kuis sudah ditutup" : "Scan QR atau klik kartu ini"}
      </text>
      <text x={w / 2} y={h - 22} fill="#495057" fontFamily={FONT_FAMILY} fontSize={14} textAnchor="middle">
        {closed ? "Klik untuk melihat hasil" : "untuk mulai mengerjakan"}
      </text>
    </g>
  );
}
