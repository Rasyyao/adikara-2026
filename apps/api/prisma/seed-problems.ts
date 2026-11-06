/**
 * Demo problems for development (part of `pnpm seed`): two materials and a handful of finished problems (blocks, and
 * most also JavaScript), plus one unfinished draft to show the checklist. Fixed ids, so running the seed again resets them.
 * The demo materials have no files; upload one to them to try "Buat dengan AI".
 */
import type { PrismaClient } from "../src/generated/prisma/client.js";
import type { BlockKind, Challenge, PuzzleBlock, PuzzleNode } from "../src/lib/block-puzzle.js";

const b = (id: string, kind: BlockKind, text: string): PuzzleBlock => ({ id, kind, text });
const n = (block: string, ...children: PuzzleNode[]): PuzzleNode => (children.length ? { block, children } : { block });
/** A loop/if node that holds `children`. */
const c = (block: string, children: PuzzleNode[]): PuzzleNode => ({ block, children });

export const DEMO_MATERIALS = [
  { id: "d0000000-0000-4000-8000-00000000a001", title: "Demo · Perulangan (for & while)" },
  { id: "d0000000-0000-4000-8000-00000000a002", title: "Demo · Percabangan (if)" },
] as const;

export interface DemoProblem {
  id: string;
  chatId: string | null;
  title: string;
  story: string;
  ready: boolean;
  challenge: Challenge;
}

const [LOOPS, BRANCHES] = DEMO_MATERIALS.map((m) => m.id);

export const DEMO_PROBLEMS: DemoProblem[] = [
  {
    id: "d0000000-0000-4000-8000-00000000b001",
    chatId: LOOPS,
    title: "Robot menyiram taman",
    ready: true,
    story:
      "Robot Adi harus menyiram tanaman di taman berbentuk persegi. Setiap sisi taman panjangnya 3 kotak, dan di setiap sudut ada satu pot tanaman. " +
      "Robot mulai di salah satu sudut dan berjalan searah jarum jam. Robot itu berwarna biru dan dibuat pada tahun 2025.",
    challenge: {
      prompt: "Susun program lengkap agar robot menyiram keempat tanaman.",
      hint: "Pola satu sisi diulang sebanyak jumlah sudut.",
      ordered: true,
      blocks: [
        b("g1", "event", "ketika mulai"),
        b("g2", "loop", "ulangi 4 kali"),
        b("g3", "loop", "ulangi 3 kali"),
        b("g4", "action", "maju 1 kotak"),
        b("g5", "action", "siram tanaman"),
        b("g6", "action", "belok kanan"),
        b("g7", "action", "belok kiri"),
        b("g8", "loop", "ulangi 2 kali"),
      ],
      solution: [n("g1"), c("g2", [c("g3", [n("g4")]), n("g5"), n("g6")])],
      code: {
        fn: "hitungLangkah",
        params: ["sisi", "panjang"],
        starter: "function hitungLangkah(sisi, panjang) {\n  // berapa kali robot maju 1 kotak untuk mengelilingi taman?\n  \n}\n",
        reference:
          "function hitungLangkah(sisi, panjang) {\n  let langkah = 0;\n  for (let i = 0; i < sisi; i++) {\n    langkah += panjang;\n  }\n  return langkah;\n}\n",
        tests: [
          { args: [4, 3], expected: 12 },
          { args: [4, 5], expected: 20 },
          { args: [3, 2], expected: 6 },
        ],
      },
    },
  },
  {
    id: "d0000000-0000-4000-8000-00000000b002",
    chatId: LOOPS,
    title: "Menabung uang jajan",
    ready: true,
    story:
      "Sinta ingin membeli buku seharga Rp50.000. Setiap hari ia menabung Rp5.000 dari uang jajannya dan mencatat jumlah tabungannya. " +
      "Ia berhenti menabung begitu tabungannya cukup untuk membeli buku. Celengan Sinta berbentuk ayam dan berwarna merah muda.",
    challenge: {
      prompt: "Susun program yang menghitung tabungan Sinta sampai cukup, lalu menampilkan jumlah harinya.",
      hint: "Jangan lupa mengatur nilai awal sebelum perulangan.",
      ordered: true,
      blocks: [
        b("g1", "event", "ketika mulai"),
        b("g2", "action", "atur tabungan ke 0"),
        b("g3", "action", "atur hari ke 0"),
        b("g4", "loop", "ulangi selama tabungan < 50000"),
        b("g5", "action", "tambah 5000 ke tabungan"),
        b("g6", "action", "tambah 1 ke hari"),
        b("g7", "action", "tampilkan hari"),
        b("g8", "action", "atur tabungan ke 50000"),
        b("g9", "loop", "ulangi selama tabungan > 50000"),
      ],
      solution: [n("g1"), n("g2"), n("g3"), c("g4", [n("g5"), n("g6")]), n("g7")],
      code: {
        fn: "hariMenabung",
        params: ["target", "perHari"],
        starter: "function hariMenabung(target, perHari) {\n  // berapa hari sampai tabungan >= target?\n  \n}\n",
        reference:
          "function hariMenabung(target, perHari) {\n  let tabungan = 0;\n  let hari = 0;\n  while (tabungan < target) {\n    tabungan += perHari;\n    hari++;\n  }\n  return hari;\n}\n",
        tests: [
          { args: [50000, 5000], expected: 10 },
          { args: [12000, 5000], expected: 3 },
          { args: [0, 5000], expected: 0 },
        ],
      },
    },
  },
  {
    id: "d0000000-0000-4000-8000-00000000b003",
    chatId: LOOPS,
    title: "Lampu lalu lintas",
    ready: false,
    story:
      "Di perempatan dekat sekolah ada lampu lalu lintas. Lampu menyala hijau 30 detik, kuning 5 detik, lalu merah 30 detik, dan urutan itu terus berulang. " +
      "Petugas ingin memprogram satu putaran penuh sebanyak 10 kali sebelum lampu diperiksa. Tiang lampu itu dicat abu-abu dan tingginya 4 meter.",
    challenge: {
      prompt: "Susun program lampu lalu lintas sampai 10 putaran selesai, lalu matikan lampu.",
      hint: "Blok matikan lampu ada di luar perulangan.",
      ordered: true,
      blocks: [
        b("g1", "event", "ketika mulai"),
        b("g2", "loop", "ulangi 10 kali"),
        b("g3", "action", "nyalakan hijau 30 detik"),
        b("g4", "action", "nyalakan kuning 5 detik"),
        b("g5", "action", "nyalakan merah 30 detik"),
        b("g6", "action", "matikan semua lampu"),
        b("g7", "action", "nyalakan merah 5 detik"),
      ],
      solution: [n("g1"), c("g2", [n("g3"), n("g4"), n("g5")]), n("g6")],
      code: {
        fn: "lamaLampu",
        params: ["putaran"],
        starter: "function lamaLampu(putaran) {\n  // berapa detik lampu menyala sampai semua putaran selesai?\n  \n}\n",
        reference: "function lamaLampu(putaran) {\n  return putaran * (30 + 5 + 30);\n}\n",
        tests: [
          { args: [10], expected: 650 },
          { args: [1], expected: 65 },
        ],
      },
    },
  },
  {
    id: "d0000000-0000-4000-8000-00000000b004",
    chatId: BRANCHES,
    title: "Nilai rapor: tuntas atau remedial",
    ready: true,
    story:
      "Pak Budi memeriksa nilai ulangan 30 siswa. Siswa dengan nilai 75 atau lebih dinyatakan tuntas, sedangkan yang kurang dari 75 harus ikut remedial. " +
      "Pak Budi menulis hasilnya di buku nilai bersampul hijau, sambil minum kopi di ruang guru.",
    challenge: {
      prompt: "Susun program yang menentukan tuntas atau remedial untuk ke-30 siswa.",
      hint: "Gunakan dua blok jika: satu untuk tuntas, satu untuk remedial.",
      ordered: true,
      blocks: [
        b("g1", "event", "ketika mulai"),
        b("g2", "loop", "ulangi 30 kali"),
        b("g3", "action", "baca nilai siswa berikutnya"),
        b("g4", "if", "jika nilai >= 75"),
        b("g5", "action", "tulis tuntas"),
        b("g6", "if", "jika nilai < 75"),
        b("g7", "action", "tulis remedial"),
        b("g8", "if", "jika nilai = 100"),
        b("g9", "action", "tulis tuntas dua kali"),
      ],
      solution: [n("g1"), c("g2", [n("g3"), c("g4", [n("g5")]), c("g6", [n("g7")])])],
      code: {
        fn: "statusNilai",
        params: ["nilai"],
        starter: 'function statusNilai(nilai) {\n  // kembalikan "tuntas" atau "remedial"\n  \n}\n',
        reference: 'function statusNilai(nilai) {\n  if (nilai >= 75) return "tuntas";\n  return "remedial";\n}\n',
        tests: [
          { args: [80], expected: "tuntas" },
          { args: [75], expected: "tuntas" },
          { args: [74], expected: "remedial" },
          { args: [0], expected: "remedial" },
        ],
      },
    },
  },
  {
    id: "d0000000-0000-4000-8000-00000000b005",
    chatId: BRANCHES,
    title: "Pintu otomatis toko",
    ready: true,
    story:
      "Sebuah toko memasang pintu otomatis dengan sensor. Selama toko buka, sensor terus memeriksa: jika ada orang di depan pintu, pintu terbuka, " +
      "menunggu 3 detik, lalu tertutup lagi. Toko itu menjual roti dan buka pukul 07.00. Pintunya terbuat dari kaca.",
    challenge: {
      prompt: "Susun program pintu otomatis dari toko buka sampai tutup, lalu kunci pintunya.",
      hint: "Kunci pintu setelah perulangan selesai.",
      ordered: true,
      blocks: [
        b("g1", "event", "ketika toko dibuka"),
        b("g2", "loop", "ulangi selama toko buka"),
        b("g3", "if", "jika ada orang di depan pintu"),
        b("g4", "action", "buka pintu"),
        b("g5", "action", "tunggu 3 detik"),
        b("g6", "action", "tutup pintu"),
        b("g7", "action", "kunci pintu"),
        b("g8", "action", "tunggu 30 detik"),
      ],
      solution: [n("g1"), c("g2", [c("g3", [n("g4"), n("g5"), n("g6")])]), n("g7")],
      code: null,
    },
  },
  {
    id: "d0000000-0000-4000-8000-00000000b006",
    chatId: null,
    title: "Draf: Membuat teh manis",
    ready: false,
    story: "",
    challenge: {
      prompt: "Susun langkah-langkah membuat teh manis dari awal sampai akhir.",
      hint: "",
      ordered: true,
      blocks: [
        b("g1", "event", "ketika mulai"),
        b("g2", "action", "panaskan air"),
        b("g3", "action", "seduh teh"),
        b("g4", "action", "tambahkan gula"),
        b("g5", "action", "cuci piring"),
      ],
      solution: [],
      code: null,
    },
  },
];

/** Upserts the demo materials and problems for a teacher; running it again resets them to this content. */
export async function seedDemoProblems(prisma: PrismaClient, teacherId: string): Promise<{ materials: number; problems: number }> {
  for (const m of DEMO_MATERIALS) {
    await prisma.chat.upsert({ where: { id: m.id }, update: { title: m.title, teacherId }, create: { id: m.id, title: m.title, teacherId } });
  }
  for (const p of DEMO_PROBLEMS) {
    const data = {
      teacherId,
      chatId: p.chatId,
      title: p.title,
      story: p.story,
      challenge: p.challenge as unknown as object,
      status: p.ready ? ("DIPUBLIKASIKAN" as const) : ("DRAF" as const),
      origin: "manual",
      aiFocus: null,
      generation: null,
      generationError: null,
    };
    await prisma.blockProblem.upsert({ where: { id: p.id }, update: data, create: { id: p.id, ...data } });
  }
  return { materials: DEMO_MATERIALS.length, problems: DEMO_PROBLEMS.length };
}
