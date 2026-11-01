// What is sent to the AI about a visualization: the format it draws in, and the questions a teacher asks about one of
// its parts. The worker only knows what the message tells it, so each message carries its own context.

import type { PartInfo } from "./diagram";
import { linesForStep, type PseudoLine } from "./pseudocode";

/** The ```visual block the board and the chat draw, spelled out for the AI. */
export const VISUAL_FORMAT = `Jawab dengan satu kalimat pengantar, lalu SATU blok kode berlabel visual berisi JSON valid (tanpa komentar) dengan salah satu bentuk ini:
{"type":"trace","title":"...","analogy":"...","thing":"...","icon":"...","code":["baris 1","baris 2"],"steps":[{"line":1,"say":"...","vars":{"nama":"nilai"},"output":"..."}]}
{"type":"flow","title":"...","analogy":"...","nodes":[{"id":"a","kind":"start|step|decision|end","label":"...","hint":"..."}],"edges":[{"from":"a","to":"b","label":"Ya"}]}
{"type":"timeline","title":"...","analogy":"...","items":[{"label":"...","detail":"..."}]}
{"type":"comparison","title":"...","analogy":"...","columns":[{"title":"...","points":["..."]}]}
Pilih bentuknya:
- trace (simulasi kode) untuk konsep yang paling jelas bila kodenya dijalankan baris demi baris: variabel, mengisi dan menimpa nilai, operasi hitung, perulangan, list. "code" berisi program pendek (paling banyak 8 baris). "steps" berisi setiap baris yang dijalankan sesuai urutan (baris perulangan diulang), "line" nomor barisnya mulai dari 1, "vars" hanya variabel yang diberi atau diganti nilainya di baris itu, "output" hanya bila baris itu menampilkan sesuatu ke layar, "say" satu kalimat sederhana tentang apa yang terjadi memakai benda perumpamaannya, "thing" benda dalam perumpamaan yang mewakili variabel (satu atau dua kata), "icon" satu emoji benda itu
- flow untuk alur keputusan dan langkah (if/else, algoritma)
- timeline untuk urutan peristiwa, comparison untuk membandingkan
Aturan agar mudah dipahami siswa pemula:
- "analogy" WAJIB: satu kalimat perumpamaan dari kehidupan sehari-hari siswa yang paling cocok dengan konsep ini sendiri; pikirkan sendiri, jangan memakai perumpamaan yang umum dipakai bila ada yang lebih pas
- label singkat (paling banyak 6 kata) dengan bahasa sehari-hari; tulis kode hanya bila perlu, misalnya nilai >= 75
- "hint" satu kalimat sederhana yang menjelaskan apa yang terjadi di langkah itu
- flow punya tepat satu node start dan minimal satu node end; setiap decision berupa pertanyaan dengan dua edge berlabel "Ya" dan "Tidak"
- paling banyak 10 node, 10 langkah simulasi, 6 item linimasa, atau 4 kolom perbandingan dengan 4 poin per kolom
Contoh pembuka blok: \`\`\`visual`;

/** Asks for a code simulation of `concept`: its program run line by line, variables as boxes, with an analogy. */
export const tracePrompt = (concept: string) =>
  `Tolong buatkan simulasi kode (type "trace") ${concept ? `untuk menjelaskan: ${concept}` : "dari penjelasan terakhir"}, lengkap dengan perumpamaan sehari-hari agar siswa paham cara kerjanya.\n\n${VISUAL_FORMAT}`;

/** Asks for a visualization of `concept`, or of the last explanation when there is none. */
export const visualPrompt = (concept: string) =>
  `Tolong buatkan visualisasi (simulasi kode, diagram alur, linimasa, atau perbandingan, pilih yang paling cocok) dengan perumpamaan sehari-hari ${concept ? `dari konsep berikut: ${concept}` : "dari penjelasan terakhir."}\n\n${VISUAL_FORMAT}`;

const PLAIN_ANSWER = "Jawab dengan teks biasa saja, tanpa diagram, tanpa JSON, dan tanpa blok kode.";

/** Asks the AI to explain one part of a diagram to a teacher who is new to programming. */
export function partExplainPrompt(diagram: string, info: PartInfo, lines: PseudoLine[]): string {
  const flow = [
    info.prev.length ? `datang dari ${info.prev.map((p) => `"${p.title}"`).join(" atau ")}` : "ini awal alur",
    info.next.length ? info.next.map((n) => (n.branch ? `jika ${n.branch} lanjut ke "${n.title}"` : `lalu lanjut ke "${n.title}"`)).join(", ") : "ini akhir alur",
  ].join("; ");
  const code = info.node
    ? linesForStep(lines, info.node, null)
        .main.map((i) => lines[i]?.text)
        .filter(Boolean)
        .join(" / ")
    : "";
  return [
    `Jelaskan bagian "${info.title}" (${info.kindLabel}, urutan ke-${info.number}) pada diagram "${diagram}" untuk guru yang masih awam pemrograman.`,
    `Alurnya: ${flow}.`,
    code ? `Di pseudocode bagian ini ditulis: ${code}.` : "",
    "Jelaskan apa yang terjadi di bagian ini dan mengapa perlu ada, beri satu analogi sehari-hari dan satu contoh singkat yang bisa diceritakan di kelas. Paling banyak 5 kalimat.",
    PLAIN_ANSWER,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Asks for the same part again, simpler. */
export const simplerPrompt = (title: string) =>
  `Penjelasan tentang "${title}" tadi masih sulit. Tolong jelaskan ulang dengan bahasa yang lebih sederhana, seperti menjelaskan ke orang yang belum pernah belajar pemrograman, dengan satu perumpamaan. Paling banyak 3 kalimat. ${PLAIN_ANSWER}`;

/** Asks the AI to walk a teacher through a whole diagram, step by step. */
export function diagramExplainPrompt(diagram: string, kindLabel: string, steps: string[], lines: PseudoLine[]): string {
  return [
    `Jelaskan ${kindLabel.toLowerCase()} "${diagram}" langkah demi langkah untuk guru yang masih awam pemrograman.`,
    `Urutannya: ${steps.map((s, i) => `${i + 1}. ${s}`).join("; ")}.`,
    lines.length ? `Pseudocode-nya:\n${lines.map((l) => `${"  ".repeat(l.indent)}${l.text}`).join("\n")}` : "",
    "Ceritakan alurnya seperti cerita sehari-hari, sebutkan apa tujuan diagram ini, lalu satu tips cara menjelaskannya di kelas. Paling banyak 8 kalimat.",
    PLAIN_ANSWER,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * A message as the teacher should read it in the chat: the instructions the buttons add for the AI (the visual format,
 * "answer in plain text …") are left out, so only the question itself shows.
 */
export function displayPrompt(text: string): string {
  const cut = text.search(/\n\s*(Jawab dengan|Pilih bentuknya|Aturan agar mudah dipahami|Contoh pembuka blok|Pseudocode-nya:)/);
  const visible = (cut >= 0 ? text.slice(0, cut) : text)
    .split("\n")
    .filter((line) => !/^(Jelaskan apa yang terjadi di bagian ini|Ceritakan alurnya seperti cerita)/.test(line.trim()))
    .join("\n")
    .trim();
  return visible || text;
}
