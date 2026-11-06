/**
 * Rich, realistic demo data seeded alongside `seedDemoProblems` whenever a real PrismaClient is present.
 * Populates:
 * - Extracted `Material` source documents and `ChatMaterial` links for the two demo materials (`DEMO_MATERIALS`)
 * - Rich `ChatMessage` conversations containing:
 *   1. Summary & code examples
 *   2. Saved interactive AI visualizations (`flow` and `trace` with `saved: true`) ready to paste onto the whiteboard
 *   3. Hierarchical interactive `mindmap`
 *   4. Approved `assessment` (Pre-Test & Post-Test) ready to launch as live quizzes
 * - Additional realistic Indonesian student roster in `KELAS7A` (plus `siswa.satu` and `siswa.dua`)
 * - Completed historical `ClassSession` records with attendance (`SessionParticipant`), saved `SessionBoard`,
 *   completed `SessionQuiz` + `QuizAttempt` + `QuizResponse`, and `SessionProblem` + `ProblemAttempt` so the
 *   Admin/Teacher Dashboard, Classes, Materials, Soal Blok, and Riwayat Sesi pages look complete for a live demo.
 * - Cleans up leftover test/empty sessions and orphan materials/chats that are not part of the demo seed.
 */
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { DEMO_MATERIALS, DEMO_PROBLEMS } from "./seed-problems.js";

const [LOOPS_CHAT_ID, BRANCHES_CHAT_ID] = DEMO_MATERIALS.map((m) => m.id);

const DEMO_SOURCE_MATERIALS = [
  {
    id: "d0000000-0000-4000-8000-00000000f001",
    chatId: LOOPS_CHAT_ID,
    title: "Modul_04_Perulangan_For_dan_While.pdf",
    filePath: "demo/Modul_04_Perulangan_For_dan_While.pdf",
    fileType: "pdf",
    extractedText: [
      "BAB 4: STRUKTUR PERULANGAN (FOR DAN WHILE)",
      "",
      "1. Tujuan Pembelajaran",
      "Siswa mampu memahami kapan menggunakan perulangan terhitung (for) dan perulangan bersyarat (while),",
      "menelusuri nilai variabel penghitung (counter) dan akumulator pada setiap iterasi, serta menghindari kesalahan",
      "infinite loop (perulangan tanpa henti).",
      "",
      "2. Perulangan for (Counted Loop)",
      "Digunakan ketika banyaknya pengulangan sudah diketahui sejak awal.",
      "Tiga komponen utama perulangan for:",
      "- Nilai awal (inisialisasi), misalnya let i = 0",
      "- Kondisi berjalan, misalnya i < 5",
      "- Perubahan nilai (increment/decrement), misalnya i++",
      "",
      "3. Perulangan while (Conditional Loop)",
      "Digunakan ketika perulangan bergantung pada kondisi logika yang diperiksa sebelum setiap putaran.",
      "Jika kondisi bernilai benar (true), blok kode di dalam while dijalankan. Jangan lupa memperbarui variabel",
      "penentu kondisi di dalam badan while agar tidak terjadi infinite loop.",
    ].join("\n"),
  },
  {
    id: "d0000000-0000-4000-8000-00000000f002",
    chatId: BRANCHES_CHAT_ID,
    title: "Modul_03_Percabangan_Logika_If_Else.pdf",
    filePath: "demo/Modul_03_Percabangan_Logika_If_Else.pdf",
    fileType: "pdf",
    extractedText: [
      "BAB 3: PERCABANGAN DAN KEPUTUSAN LOGIKA (IF, ELSE IF, ELSE)",
      "",
      "1. Tujuan Pembelajaran",
      "Siswa mampu menyusun alur pengambilan keputusan menggunakan pernyataan if, else if, dan else,",
      "membedakan operator perbandingan (==, ===, >=, <=, !=) dengan operator penugasan (=), serta menyusun",
      "urutan kondisi dari yang paling khusus (ketat) ke yang paling umum.",
      "",
      "2. Pernyataan if dan else",
      "Komputer mengevaluasi ekspresi boolean di dalam tanda kurung if (kondisi). Jika bernilai true, blok pertama",
      "dijalankan; jika false, program melompat ke cabang else.",
      "",
      "3. Urutan Evaluasi if - else if - else",
      "Kondisi diperiksa dari atas ke bawah. Begitu satu kondisi bernilai true, cabang di bawahnya dilewati.",
      "Karena itu, syarat yang paling ketat (misalnya nilai >= 90 untuk predikat A) harus diletakkan paling atas",
      "sebelum syarat yang lebih longgar (misalnya nilai >= 75 untuk predikat B).",
    ].join("\n"),
  },
] as const;

const LOOPS_FLOW_VISUAL = {
  type: "flow",
  saved: true,
  title: "Alur Kerja Perulangan Menabung (while)",
  analogy: "Seperti mengisi celengan setiap hari lalu mengecek apakah uangnya sudah mencapai harga buku Rp50.000.",
  nodes: [
    { id: "n1", kind: "start", label: "Mulai: tabungan = 0, hari = 0", hint: "Siapkan celengan kosong sebelum mulai menabung." },
    { id: "n2", kind: "decision", label: "Apakah tabungan < 50.000?", hint: "Cek apakah uang di celengan masih kurang dari harga buku." },
    { id: "n3", kind: "step", label: "Tambah 5.000 ke tabungan", hint: "Masukkan uang jajan hari ini ke dalam celengan." },
    { id: "n4", kind: "step", label: "Tambah 1 ke hari", hint: "Catat bahwa satu hari menabung telah berlalu." },
    { id: "n5", kind: "end", label: "Selesai: Tampilkan jumlah hari (10 hari)", hint: "Tabungan sudah mencapai Rp50.000, berhenti menabung." },
  ],
  edges: [
    { from: "n1", to: "n2", label: null },
    { from: "n2", to: "n3", label: "Ya" },
    { from: "n3", to: "n4", label: null },
    { from: "n4", to: "n2", label: null },
    { from: "n2", to: "n5", label: "Tidak" },
  ],
};

const LOOPS_TRACE_VISUAL = {
  type: "trace",
  saved: true,
  title: "Simulasi Kode: Menjumlahkan Langkah Robot",
  analogy: "Variabel langkah seperti papan skor yang angkanya bertambah setiap kali robot selesai menyusuri satu sisi taman.",
  thing: "kotak",
  icon: "📦",
  code: [
    "let langkah = 0;",
    "for (let sisi = 1; sisi <= 3; sisi++) {",
    "  langkah += 3;",
    "}",
    "console.log(langkah);",
  ],
  steps: [
    { line: 1, say: "Buat kotak langkah dan isi awalnya dengan 0.", vars: [{ name: "langkah", value: "0" }], output: null },
    { line: 2, say: "Putaran ke-1 dimulai: sisi diisi 1 (masih <= 3).", vars: [{ name: "sisi", value: "1" }], output: null },
    { line: 3, say: "Tambahkan 3 kotak ke langkah (0 + 3 = 3).", vars: [{ name: "langkah", value: "3" }], output: null },
    { line: 2, say: "Putaran ke-2: sisi naik menjadi 2.", vars: [{ name: "sisi", value: "2" }], output: null },
    { line: 3, say: "Tambahkan 3 lagi ke langkah (3 + 3 = 6).", vars: [{ name: "langkah", value: "6" }], output: null },
    { line: 2, say: "Putaran ke-3: sisi naik menjadi 3.", vars: [{ name: "sisi", value: "3" }], output: null },
    { line: 3, say: "Tambahkan 3 lagi ke langkah (6 + 3 = 9).", vars: [{ name: "langkah", value: "9" }], output: null },
    { line: 5, say: "Perulangan selesai, tampilkan isi akhir langkah ke layar.", vars: [], output: "9" },
  ],
};

const LOOPS_MINDMAP = {
  title: "Perulangan (for & while)",
  nodes: [
    {
      id: "root",
      parent_id: null,
      label: "Perulangan (Loop)",
      text: 'Tolong jelaskan secara mendalam mengenai "Perulangan (Loop)" berdasarkan materi ini.',
      source: "Bab 4 · Konsep Inti",
    },
    {
      id: "for",
      parent_id: "root",
      label: "Perulangan for (Terhitung)",
      text: 'Tolong jelaskan secara mendalam mengenai "Perulangan for (Terhitung)" berdasarkan materi ini.',
      source: "Bab 4 · Bagian 2",
    },
    {
      id: "for-init",
      parent_id: "for",
      label: "Nilai Awal, Kondisi & Increment",
      text: 'Tolong jelaskan secara mendalam mengenai "Nilai Awal, Kondisi & Increment" berdasarkan materi ini.',
      source: "Bab 4 · Bagian 2",
    },
    {
      id: "while",
      parent_id: "root",
      label: "Perulangan while (Bersyarat)",
      text: 'Tolong jelaskan secara mendalam mengenai "Perulangan while (Bersyarat)" berdasarkan materi ini.',
      source: "Bab 4 · Bagian 3",
    },
    {
      id: "while-cond",
      parent_id: "while",
      label: "Evaluasi Kondisi Sebelum Putaran",
      text: 'Tolong jelaskan secara mendalam mengenai "Evaluasi Kondisi Sebelum Putaran" berdasarkan materi ini.',
      source: "Bab 4 · Bagian 3",
    },
    {
      id: "bug",
      parent_id: "root",
      label: "Kesalahan Umum Siswa",
      text: 'Tolong jelaskan secara mendalam mengenai "Kesalahan Umum Siswa" berdasarkan materi ini.',
      source: "Bab 4 · Evaluasi",
    },
    {
      id: "bug-inf",
      parent_id: "bug",
      label: "Infinite Loop (Lupa Update Variabel)",
      text: 'Tolong jelaskan secara mendalam mengenai "Infinite Loop (Lupa Update Variabel)" berdasarkan materi ini.',
      source: "Bab 4 · Evaluasi",
    },
  ],
};

const LOOPS_ASSESSMENTS = [
  {
    kind: "pretest",
    status: "approved",
    title: "Pre-Test · Perulangan for & while",
    questions: [
      {
        id: 1,
        question: "Kapan sebaiknya kita menggunakan perulangan `for` dibandingkan `while`?",
        options: [
          { key: "A", text: "Ketika jumlah pengulangan sudah diketahui dengan pasti sejak awal" },
          { key: "B", text: "Ketika program hanya boleh dijalankan satu kali saja" },
          { key: "C", text: "Ketika kita tidak tahu kapan perulangan akan berhenti" },
          { key: "D", text: "Ketika tidak ada variabel penghitung di dalam program" },
        ],
        answer: "A",
        explanation: "Perulangan `for` dirancang untuk counted loop yang jumlah iterasinya sudah jelas dari awal.",
        source: "Konsep Dasar Perulangan",
      },
      {
        id: 2,
        question: "Apa yang terjadi jika variabel penentu kondisi di dalam perulangan `while` tidak pernah diperbarui?",
        options: [
          { key: "A", text: "Program otomatis berhenti setelah 10 putaran" },
          { key: "B", text: "Terjadi infinite loop (perulangan berjalan terus tanpa henti)" },
          { key: "C", text: "Nilai variabel otomatis bertambah 1 setiap putaran" },
          { key: "D", text: "Kode di dalam while dilewati seluruhnya" },
        ],
        answer: "B",
        explanation: "Tanpa perubahan nilai variabel kondisi, syarat `while` akan selalu bernilai true sehingga perulangan tidak pernah berhenti.",
        source: "Kondisi Berhenti & Infinite Loop",
      },
      {
        id: 3,
        question: "Perhatikan kode berikut: `let total = 0; for (let i = 1; i <= 4; i++) { total += 2; }` Berapakah nilai `total` setelah perulangan selesai?",
        options: [
          { key: "A", text: "4" },
          { key: "B", text: "6" },
          { key: "C", text: "8" },
          { key: "D", text: "10" },
        ],
        answer: "C",
        explanation: "Perulangan berjalan 4 kali (i = 1, 2, 3, 4) dan setiap putaran menambah 2 ke total, sehingga 4 × 2 = 8.",
        source: "Pelacakan Nilai Akumulator",
      },
      {
        id: 4,
        question: "Pada perulangan `for (let i = 0; i < 5; i++)`, berapakah nilai `i` pada putaran terakhir yang dijalankan?",
        options: [
          { key: "A", text: "3" },
          { key: "B", text: "4" },
          { key: "C", text: "5" },
          { key: "D", text: "6" },
        ],
        answer: "B",
        explanation: "Saat `i` bernilai 4, kondisi `i < 5` masih benar. Setelah naik menjadi 5, kondisi `5 < 5` salah sehingga perulangan berhenti.",
        source: "Batas Indeks Perulangan",
      },
    ],
  },
  {
    kind: "posttest",
    status: "approved",
    title: "Post-Test · Evaluasi Perulangan for & while",
    questions: [
      {
        id: 1,
        question: "Sinta menabung Rp5.000 per hari dari Rp0 dengan `while (tabungan < 20000)`. Berapa kali badan perulangan dijalankan?",
        options: [
          { key: "A", text: "3 kali" },
          { key: "B", text: "4 kali" },
          { key: "C", text: "5 kali" },
          { key: "D", text: "20 kali" },
        ],
        answer: "B",
        explanation: "Tabungan bertambah menjadi 5.000, 10.000, 15.000, lalu 20.000 pada hari ke-4; setelah itu `20000 < 20000` bernilai false.",
        source: "Kondisi Berhenti & Infinite Loop",
      },
      {
        id: 2,
        question: "Di dalam perulangan bersarang, luar `ulangi 4 kali` dan dalam `ulangi 3 kali`, berapa kali perintah di bagian terdalam dijalankan?",
        options: [
          { key: "A", text: "7 kali" },
          { key: "B", text: "12 kali" },
          { key: "C", text: "4 kali" },
          { key: "D", text: "3 kali" },
        ],
        answer: "B",
        explanation: "Untuk setiap 1 putaran luar, perulangan dalam berjalan 3 kali, sehingga totalnya 4 × 3 = 12 kali.",
        source: "Perulangan Bersarang",
      },
      {
        id: 3,
        question: "Manakah perbaikan yang tepat agar `let n = 5; while (n > 0) { console.log(n); }` tidak mengalami infinite loop?",
        options: [
          { key: "A", text: "Menambahkan `n = n + 1;` di dalam kurung kurawal while" },
          { key: "B", text: "Menambahkan `n = n - 1;` di dalam kurung kurawal while" },
          { key: "C", text: "Mengubah nilai awal menjadi `let n = 10;`" },
          { key: "D", text: "Menghapus `console.log(n);`" },
        ],
        answer: "B",
        explanation: "Karena syarat berjalan adalah `n > 0` mulai dari 5, nilai `n` harus dikurangi (`n--` atau `n = n - 1`) agar mencapai 0.",
        source: "Kondisi Berhenti & Infinite Loop",
      },
      {
        id: 4,
        question: "Apa nilai akhir `hasil` dari kode `let hasil = 10; for (let k = 0; k < 3; k++) { hasil -= 2; }`?",
        options: [
          { key: "A", text: "4" },
          { key: "B", text: "6" },
          { key: "C", text: "8" },
          { key: "D", text: "2" },
        ],
        answer: "A",
        explanation: "Perulangan berjalan 3 kali (k = 0, 1, 2) dan setiap kali mengurangi 2 dari 10, sehingga 10 - 6 = 4.",
        source: "Pelacakan Nilai Akumulator",
      },
    ],
  },
];

const BRANCHES_FLOW_VISUAL = {
  type: "flow",
  saved: true,
  title: "Alur Penentuan Kelulusan Nilai Rapor (if-else)",
  analogy: "Seperti petugas gerbang yang memeriksa nilai siswa: jika 75 ke atas masuk jalur Tuntas, jika kurang masuk jalur Remedial.",
  nodes: [
    { id: "b1", kind: "start", label: "Mulai: Baca nilai siswa", hint: "Ambil angka nilai ulangan siswa dari daftar." },
    { id: "b2", kind: "decision", label: "Apakah nilai >= 75?", hint: "Bandingkan nilai siswa dengan batas KKM 75." },
    { id: "b3", kind: "step", label: "Catat status: TUNTAS", hint: "Jika nilai 75 atau lebih, siswa dinyatakan lulus." },
    { id: "b4", kind: "step", label: "Catat status: REMEDIAL", hint: "Jika nilai di bawah 75, siswa mengikuti ujian perbaikan." },
    { id: "b5", kind: "end", label: "Selesai: Cetak hasil rapor", hint: "Tampilkan status akhir ke buku rapor." },
  ],
  edges: [
    { from: "b1", to: "b2", label: null },
    { from: "b2", to: "b3", label: "Ya" },
    { from: "b2", to: "b4", label: "Tidak" },
    { from: "b3", to: "b5", label: null },
    { from: "b4", to: "b5", label: null },
  ],
};

const BRANCHES_MINDMAP = {
  title: "Percabangan Logika (if-else)",
  nodes: [
    {
      id: "root",
      parent_id: null,
      label: "Percabangan (if-else)",
      text: 'Tolong jelaskan secara mendalam mengenai "Percabangan (if-else)" berdasarkan materi ini.',
      source: "Bab 3 · Konsep Inti",
    },
    {
      id: "cond",
      parent_id: "root",
      label: "Kondisi & Operator Perbandingan",
      text: 'Tolong jelaskan secara mendalam mengenai "Kondisi & Operator Perbandingan" berdasarkan materi ini.',
      source: "Bab 3 · Bagian 1",
    },
    {
      id: "cond-op",
      parent_id: "cond",
      label: "Perbedaan === (Bandingkan) vs = (Isi Nilai)",
      text: 'Tolong jelaskan secara mendalam mengenai "Perbedaan === (Bandingkan) vs = (Isi Nilai)" berdasarkan materi ini.',
      source: "Bab 3 · Bagian 1",
    },
    {
      id: "branch",
      parent_id: "root",
      label: "Jalur Keputusan",
      text: 'Tolong jelaskan secara mendalam mengenai "Jalur Keputusan" berdasarkan materi ini.',
      source: "Bab 3 · Bagian 2",
    },
    {
      id: "branch-order",
      parent_id: "branch",
      label: "Urutan if - else if dari Ketat ke Umum",
      text: 'Tolong jelaskan secara mendalam mengenai "Urutan if - else if dari Ketat ke Umum" berdasarkan materi ini.',
      source: "Bab 3 · Bagian 3",
    },
  ],
};

const BRANCHES_ASSESSMENTS = [
  {
    kind: "pretest",
    status: "approved",
    title: "Pre-Test · Percabangan Logika (if-else)",
    questions: [
      {
        id: 1,
        question: "Pada pernyataan `if (nilai >= 75)`, kapan blok kode di dalam `if` dijalankan?",
        options: [
          { key: "A", text: "Hanya ketika nilai kurang dari 75" },
          { key: "B", text: "Ketika nilai lebih besar atau sama dengan 75" },
          { key: "C", text: "Hanya ketika nilai tepat 74" },
          { key: "D", text: "Selalu dijalankan berapa pun nilainya" },
        ],
        answer: "B",
        explanation: "Operator `>=` berarti lebih besar atau sama dengan, sehingga nilai 75, 76, dst. bernilai true.",
        source: "Operator Perbandingan (>= vs >)",
      },
      {
        id: 2,
        question: "Mengapa penulisan `if (nilai = 100)` di JavaScript sering menjadi sumber bug bagi siswa pemula?",
        options: [
          { key: "A", text: "Karena `=` adalah operator mengisi nilai (assignment), bukan membandingkan (`===`)" },
          { key: "B", text: "Karena angka 100 terlalu besar untuk dibandingkan" },
          { key: "C", text: "Karena `if` tidak boleh memeriksa variabel bernama `nilai`" },
          { key: "D", text: "Karena harus selalu menggunakan tanda `<`" },
        ],
        answer: "A",
        explanation: "Satu tanda `=` mengubah isi variabel `nilai` menjadi 100; untuk membandingkan kesamaan gunakan `===` atau `==`.",
        source: "Operator Perbandingan (=== vs =)",
      },
      {
        id: 3,
        question: "Perhatikan kode: `if (nilai >= 60) { return 'C'; } else if (nilai >= 85) { return 'A'; }` Apa yang dikembalikan jika `nilai = 90`?",
        options: [
          { key: "A", text: "'A'" },
          { key: "B", text: "'C'" },
          { key: "C", text: "'A' dan 'C'" },
          { key: "D", text: "Error" },
        ],
        answer: "B",
        explanation: "Karena `90 >= 60` sudah bernilai true pada cabang pertama, program langsung mengembalikan `'C'` tanpa memeriksa `else if` di bawahnya.",
        source: "Urutan Evaluasi if-else if",
      },
    ],
  },
];

const DEMO_CHAT_MESSAGES = [
  // ---- Material 1: Perulangan (for & while) ----
  {
    id: "d0000000-0000-4000-8000-00000000c101",
    chatId: LOOPS_CHAT_ID,
    role: "USER" as const,
    content: "Tolong ringkas materi Modul_04_Perulangan_For_dan_While.pdf ini menjadi panduan mengajar yang rapi beserta contoh kode dan visualisasi untuk kelas.",
    sources: null,
    createdAt: new Date("2026-11-04T01:10:00.000Z"),
  },
  {
    id: "d0000000-0000-4000-8000-00000000c102",
    chatId: LOOPS_CHAT_ID,
    role: "ASSISTANT" as const,
    content: [
      "Berikut ringkasan bahan ajar dari **Modul_04_Perulangan_For_dan_While.pdf** yang siap Anda gunakan di kelas:",
      "",
      "### 1. Perbedaan Utama `for` dan `while`",
      "- **Perulangan `for` (Counted Loop)**: Dipakai saat jumlah putaran sudah jelas sejak awal, misalnya mengelilingi 4 sisi taman.",
      "- **Perulangan `while` (Conditional Loop)**: Dipakai saat kita terus mengulang selama suatu syarat masih terpenuhi, misalnya menabung sampai uang mencapai Rp50.000.",
      "- **Titik Rawan Miskonsepsi**: Siswa sering lupa mengubah nilai variabel di dalam `while`, sehingga kondisi tidak pernah menjadi `false` (*infinite loop*).",
      "",
      "```javascript",
      "// Contoh 1: Perulangan for (jumlah putaran pasti)",
      "for (let sisi = 1; sisi <= 4; sisi++) {",
      "  console.log('Menyiram sisi ke-' + sisi);",
      "}",
      "",
      "// Contoh 2: Perulangan while (bergantung syarat)",
      "let tabungan = 0;",
      "let hari = 0;",
      "while (tabungan < 50000) {",
      "  tabungan += 5000;",
      "  hari += 1;",
      "}",
      "```",
    ].join("\n"),
    sources: ["Modul_04_Perulangan_For_dan_While.pdf · Bab 4"],
    createdAt: new Date("2026-11-04T01:10:20.000Z"),
  },
  {
    id: "d0000000-0000-4000-8000-00000000c103",
    chatId: LOOPS_CHAT_ID,
    role: "USER" as const,
    content: "Buatkan diagram alur visual dan simulasi kode untuk ditempel ke papan tulis saat menjelaskan perulangan.",
    sources: null,
    createdAt: new Date("2026-11-04T01:12:00.000Z"),
  },
  {
    id: "d0000000-0000-4000-8000-00000000c104",
    chatId: LOOPS_CHAT_ID,
    role: "ASSISTANT" as const,
    content:
      "Berikut diagram alur perulangan `while` yang sudah ditandai **Simpan untuk kelas** agar langsung muncul di panel Papan Tulis:\n\n```visual\n" +
      JSON.stringify(LOOPS_FLOW_VISUAL, null, 2) +
      "\n```",
    sources: ["Modul_04_Perulangan_For_dan_While.pdf · Bagian 3"],
    createdAt: new Date("2026-11-04T01:12:25.000Z"),
  },
  {
    id: "d0000000-0000-4000-8000-00000000c105",
    chatId: LOOPS_CHAT_ID,
    role: "ASSISTANT" as const,
    content:
      "Dan berikut simulasi langkah demi langkah (*code trace*) perubahan isi variabel `langkah` pada perulangan `for`:\n\n```visual\n" +
      JSON.stringify(LOOPS_TRACE_VISUAL, null, 2) +
      "\n```",
    sources: ["Modul_04_Perulangan_For_dan_While.pdf · Bagian 2"],
    createdAt: new Date("2026-11-04T01:13:00.000Z"),
  },
  {
    id: "d0000000-0000-4000-8000-00000000c106",
    chatId: LOOPS_CHAT_ID,
    role: "ASSISTANT" as const,
    content:
      "Saya juga telah menyusun peta konsep (*Mindmap*) interaktif untuk materi perulangan ini:\n\n```mindmap\n" +
      JSON.stringify(LOOPS_MINDMAP, null, 2) +
      "\n```",
    sources: ["Modul_04_Perulangan_For_dan_While.pdf"],
    createdAt: new Date("2026-11-04T01:14:00.000Z"),
  },
  {
    id: "d0000000-0000-4000-8000-00000000c107",
    chatId: LOOPS_CHAT_ID,
    role: "ASSISTANT" as const,
    content:
      "Berikut paket soal **Pre-Test** dan **Post-Test** yang sudah disetujui dan siap ditempel sebagai kuis interaktif di papan tulis:\n\n```assessment\n" +
      JSON.stringify(LOOPS_ASSESSMENTS, null, 2) +
      "\n```",
    sources: ["Modul_04_Perulangan_For_dan_While.pdf"],
    createdAt: new Date("2026-11-04T01:15:00.000Z"),
  },

  // ---- Material 2: Percabangan (if) ----
  {
    id: "d0000000-0000-4000-8000-00000000c201",
    chatId: BRANCHES_CHAT_ID,
    role: "USER" as const,
    content: "Tolong siapkan ringkasan materi, diagram alur keputusan, mindmap, dan soal Pre-Test dari Modul_03_Percabangan_Logika_If_Else.pdf.",
    sources: null,
    createdAt: new Date("2026-11-04T02:00:00.000Z"),
  },
  {
    id: "d0000000-0000-4000-8000-00000000c202",
    chatId: BRANCHES_CHAT_ID,
    role: "ASSISTANT" as const,
    content:
      "Berikut diagram alur pengambilan keputusan kelulusan rapor (`if-else`) yang siap ditempel ke papan tulis kelas:\n\n```visual\n" +
      JSON.stringify(BRANCHES_FLOW_VISUAL, null, 2) +
      "\n```",
    sources: ["Modul_03_Percabangan_Logika_If_Else.pdf · Bab 3"],
    createdAt: new Date("2026-11-04T02:01:00.000Z"),
  },
  {
    id: "d0000000-0000-4000-8000-00000000c203",
    chatId: BRANCHES_CHAT_ID,
    role: "ASSISTANT" as const,
    content:
      "Berikut peta konsep (*Mindmap*) materi Percabangan Logika:\n\n```mindmap\n" +
      JSON.stringify(BRANCHES_MINDMAP, null, 2) +
      "\n```",
    sources: ["Modul_03_Percabangan_Logika_If_Else.pdf"],
    createdAt: new Date("2026-11-04T02:02:00.000Z"),
  },
  {
    id: "d0000000-0000-4000-8000-00000000c204",
    chatId: BRANCHES_CHAT_ID,
    role: "ASSISTANT" as const,
    content:
      "Berikut soal **Pre-Test** diagnostik untuk mengecek pemahaman operator perbandingan dan urutan evaluasi `if-else if`:\n\n```assessment\n" +
      JSON.stringify(BRANCHES_ASSESSMENTS, null, 2) +
      "\n```",
    sources: ["Modul_03_Percabangan_Logika_If_Else.pdf"],
    createdAt: new Date("2026-11-04T02:03:00.000Z"),
  },
] as const;

const EXTRA_DEMO_STUDENTS = [
  { username: "rani.putri", alias: "Rani Putri" },
  { username: "dimas.pratama", alias: "Dimas Pratama" },
  { username: "fajar.nugroho", alias: "Fajar Nugroho" },
  { username: "nadia.lestari", alias: "Nadia Lestari" },
] as const;

const DEMO_SESSIONS = {
  s1: "d0000000-0000-4000-8000-00000000e001",
  s2: "d0000000-0000-4000-8000-00000000e002",
  s3: "d0000000-0000-4000-8000-00000000e003",
} as const;

const DEMO_QUIZZES = {
  q1: "d0000000-0000-4000-8000-00000000e101",
  q2: "d0000000-0000-4000-8000-00000000e102",
  q3: "d0000000-0000-4000-8000-00000000e103",
} as const;

const DEMO_SESSION_PROBLEMS = {
  sp1: "d0000000-0000-4000-8000-00000000e201",
  sp2: "d0000000-0000-4000-8000-00000000e202",
} as const;

/**
 * Seeds rich demo materials, conversations, student roster, and completed session history when running against a real
 * PrismaClient. Unit tests that pass a minimal `fakePrisma` without `material` or `classSession` models skip this step.
 */
export async function seedRichDemoEnvironment(
  prisma: PrismaClient,
  input: { teacherId: string; classId: string; passwordHash: string; includeExtraStudents?: boolean },
): Promise<void> {
  const anyPrisma = prisma as unknown as Record<string, unknown>;
  if (!anyPrisma.material || !anyPrisma.chatMessage || !anyPrisma.classSession) return;

  const { teacherId, classId, passwordHash, includeExtraStudents = false } = input;

  // 1. Clean up old/unused test sessions (any ended session without a demo ID) and empty/test chats ("Percakapan baru", etc.)
  const demoSessionIds = Object.values(DEMO_SESSIONS);
  const demoChatIds = DEMO_MATERIALS.map((m) => m.id);
  const demoMaterialIds = DEMO_SOURCE_MATERIALS.map((m) => m.id);
  const demoProblemIds = DEMO_PROBLEMS.map((p) => p.id);

  await prisma.classSession.deleteMany({
    where: {
      id: { notIn: demoSessionIds },
      status: "ENDED",
    },
  });

  // Delete unused/empty test chats that have no active sessions
  await prisma.chat.deleteMany({
    where: {
      id: { notIn: demoChatIds },
      sessions: { none: { status: { not: "ENDED" } } },
    },
  });

  // Delete leftover non-demo block problems that are not attached to any active session
  await prisma.blockProblem.deleteMany({
    where: {
      id: { notIn: demoProblemIds },
    },
  });

  // Delete orphan materials not linked to any chat
  await prisma.material.deleteMany({
    where: {
      id: { notIn: demoMaterialIds },
      chats: { none: {} },
      packages: { none: {} },
    },
  });

  // 2. Upsert extracted Material source files and link them to DEMO_MATERIALS
  for (const src of DEMO_SOURCE_MATERIALS) {
    await prisma.material.upsert({
      where: { id: src.id },
      update: {
        teacherId,
        title: src.title,
        filePath: src.filePath,
        fileType: src.fileType,
        extractedText: src.extractedText,
        status: "EXTRACTED",
        error: null,
      },
      create: {
        id: src.id,
        teacherId,
        title: src.title,
        filePath: src.filePath,
        fileType: src.fileType,
        extractedText: src.extractedText,
        status: "EXTRACTED",
        error: null,
      },
    });

    await prisma.chatMaterial.upsert({
      where: { chatId_materialId: { chatId: src.chatId, materialId: src.id } },
      update: {},
      create: { chatId: src.chatId, materialId: src.id },
    });
  }

  // 3. Upsert rich AI conversation messages (summaries, saved visuals, mindmaps, approved assessments)
  for (const msg of DEMO_CHAT_MESSAGES) {
    await prisma.chatMessage.upsert({
      where: { id: msg.id },
      update: {
        chatId: msg.chatId,
        role: msg.role,
        content: msg.content,
        sources: msg.sources ?? undefined,
        createdAt: msg.createdAt,
      },
      create: {
        id: msg.id,
        chatId: msg.chatId,
        role: msg.role,
        content: msg.content,
        sources: msg.sources ?? undefined,
        createdAt: msg.createdAt,
      },
    });
  }

  // 4. Upsert additional realistic students in KELAS7A for rich analytics & leaderboards when requested
  if (includeExtraStudents) {
    for (const s of EXTRA_DEMO_STUDENTS) {
      await prisma.student.upsert({
        where: { username: s.username },
        update: { alias: s.alias, role: "USER", passwordHash, classId },
        create: { username: s.username, alias: s.alias, role: "USER", passwordHash, classId },
      });
    }
  }

  const allStudents = await prisma.student.findMany({
    where: { classId },
    orderBy: { username: "asc" },
  });
  if (allStudents.length === 0) return;

  // 5. Seed 3 realistic completed ClassSessions with attendance, board scenes, quizzes, and block problem attempts
  const sessionsData = [
    {
      id: DEMO_SESSIONS.s1,
      chatId: BRANCHES_CHAT_ID,
      createdAt: new Date("2026-11-02T00:30:00.000Z"),
      startedAt: new Date("2026-11-02T00:32:00.000Z"),
      endedAt: new Date("2026-11-02T02:00:00.000Z"),
      expiresAt: new Date("2026-11-02T04:30:00.000Z"),
      presentIndices: [0, 1, 2, 3, 4], // 5 of 6 present
      lateIndices: [4],
      quiz: {
        id: DEMO_QUIZZES.q1,
        kind: "pretest",
        title: "Pre-Test · Percabangan Logika (if-else)",
        sourceChatId: BRANCHES_CHAT_ID,
        sourceMessageId: "d0000000-0000-4000-8000-00000000c204",
        questions: BRANCHES_ASSESSMENTS[0].questions,
        // Student answers per question: some wrong picks on Q2 & Q3 so "Hardest Questions" & "Weakest Topics" are rich!
        picksByStudentIndex: [
          ["B", "A", "A"], // student 0: 3/3
          ["B", "B", "B"], // student 1: 1/3 (missed Q2 & Q3)
          ["B", "A", "B"], // student 2: 2/3 (missed Q3)
          ["A", "B", "B"], // student 3: 0/3 (needs attention!)
          ["B", "A", "A"], // student 4: 3/3
        ],
      },
      problem: {
        id: DEMO_SESSION_PROBLEMS.sp1,
        problem: DEMO_PROBLEMS[3], // Nilai rapor: tuntas atau remedial
      },
    },
    {
      id: DEMO_SESSIONS.s2,
      chatId: LOOPS_CHAT_ID,
      createdAt: new Date("2026-11-04T00:30:00.000Z"),
      startedAt: new Date("2026-11-04T00:31:00.000Z"),
      endedAt: new Date("2026-11-04T02:00:00.000Z"),
      expiresAt: new Date("2026-11-04T04:30:00.000Z"),
      presentIndices: [0, 1, 2, 3, 4, 5], // 6 of 6 present (100%)
      lateIndices: [],
      quiz: {
        id: DEMO_QUIZZES.q2,
        kind: "pretest",
        title: "Pre-Test · Perulangan for & while",
        sourceChatId: LOOPS_CHAT_ID,
        sourceMessageId: "d0000000-0000-4000-8000-00000000c107",
        questions: LOOPS_ASSESSMENTS[0].questions,
        picksByStudentIndex: [
          ["A", "B", "C", "B"], // 4/4
          ["A", "A", "C", "C"], // 2/4 (missed Q2 & Q4)
          ["A", "B", "B", "B"], // 3/4 (missed Q3)
          ["C", "A", "B", "C"], // 0/4 (needs attention)
          ["A", "B", "C", "C"], // 3/4 (missed Q4)
          ["A", "B", "C", "B"], // 4/4
        ],
      },
      problem: {
        id: DEMO_SESSION_PROBLEMS.sp2,
        problem: DEMO_PROBLEMS[0], // Robot menyiram taman
      },
    },
    {
      id: DEMO_SESSIONS.s3,
      chatId: LOOPS_CHAT_ID,
      createdAt: new Date("2026-11-05T01:00:00.000Z"),
      startedAt: new Date("2026-11-05T01:02:00.000Z"),
      endedAt: new Date("2026-11-05T02:30:00.000Z"),
      expiresAt: new Date("2026-11-05T05:00:00.000Z"),
      presentIndices: [0, 1, 2, 3, 4, 5], // 6 of 6 present (100%)
      lateIndices: [3],
      quiz: {
        id: DEMO_QUIZZES.q3,
        kind: "posttest",
        title: "Post-Test · Evaluasi Perulangan for & while",
        sourceChatId: LOOPS_CHAT_ID,
        sourceMessageId: "d0000000-0000-4000-8000-00000000c107",
        questions: LOOPS_ASSESSMENTS[1].questions,
        picksByStudentIndex: [
          ["B", "B", "B", "A"], // 4/4
          ["B", "B", "B", "A"], // 4/4 (improved!)
          ["B", "B", "B", "A"], // 4/4
          ["B", "A", "A", "B"], // 1/4 (still needs help on nested loops & infinite loop)
          ["B", "B", "B", "A"], // 4/4
          ["B", "B", "A", "A"], // 3/4
        ],
      },
      problem: null,
    },
  ] as const;

  for (const s of sessionsData) {
    await prisma.classSession.upsert({
      where: { id: s.id },
      update: {
        classId,
        teacherId,
        joinCode: null,
        status: "ENDED",
        locked: false,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        chatId: s.chatId,
      },
      create: {
        id: s.id,
        classId,
        teacherId,
        joinCode: null,
        status: "ENDED",
        locked: false,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        chatId: s.chatId,
      },
    });

    // Save a whiteboard scene for each session so viewing session report shows the class board
    const boardScene = {
      elements: [
        {
          id: `demo-title-${s.id.slice(-4)}`,
          type: "rectangle",
          x: -220,
          y: -80,
          width: 440,
          height: 76,
          strokeColor: "#3b5bdb",
          backgroundColor: "#dbe4ff",
          strokeWidth: 2.5,
          opacity: 1,
          label: s.quiz.title.replace(/^(Pre-Test|Post-Test) · /, "Rangkuman Kelas: "),
          fontSize: 20,
          version: 1,
        },
        {
          id: `demo-note-${s.id.slice(-4)}`,
          type: "rectangle",
          x: -220,
          y: 24,
          width: 440,
          height: 96,
          strokeColor: "#2b8a3e",
          backgroundColor: "#d3f9d8",
          strokeWidth: 2,
          opacity: 1,
          label: "Ingat: Periksa kondisi berhenti sebelum menjalankan perulangan atau percabangan!",
          fontSize: 18,
          version: 1,
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
    };

    await prisma.sessionBoard.upsert({
      where: { sessionId: s.id },
      update: { scene: boardScene },
      create: { sessionId: s.id, scene: boardScene },
    });

    // Attendance participants
    for (const idx of s.presentIndices) {
      const student = allStudents[idx];
      if (!student) continue;
      const isLate = (s.lateIndices as readonly number[]).includes(idx);
      const joinedAt = new Date(s.startedAt.getTime() + (isLate ? 8 * 60_000 : -60_000));
      await prisma.sessionParticipant.upsert({
        where: { sessionId_studentId: { sessionId: s.id, studentId: student.id } },
        update: { joinedAt, leftAt: s.endedAt, kickedAt: null },
        create: { sessionId: s.id, studentId: student.id, joinedAt, leftAt: s.endedAt },
      });
    }

    // Quiz and student attempts
    const q = s.quiz;
    await prisma.sessionQuiz.upsert({
      where: { id: q.id },
      update: {
        sessionId: s.id,
        kind: q.kind,
        title: q.title,
        questions: q.questions as unknown as object,
        status: "CLOSED",
        sourceChatId: q.sourceChatId,
        sourceMessageId: q.sourceMessageId,
        openedAt: new Date(s.startedAt.getTime() + 10 * 60_000),
        closedAt: new Date(s.startedAt.getTime() + 25 * 60_000),
        createdAt: new Date(s.startedAt.getTime() + 10 * 60_000),
      },
      create: {
        id: q.id,
        sessionId: s.id,
        kind: q.kind,
        title: q.title,
        questions: q.questions as unknown as object,
        status: "CLOSED",
        sourceChatId: q.sourceChatId,
        sourceMessageId: q.sourceMessageId,
        openedAt: new Date(s.startedAt.getTime() + 10 * 60_000),
        closedAt: new Date(s.startedAt.getTime() + 25 * 60_000),
        createdAt: new Date(s.startedAt.getTime() + 10 * 60_000),
      },
    });

    for (let i = 0; i < q.picksByStudentIndex.length; i++) {
      const student = allStudents[s.presentIndices[i]];
      if (!student) continue;
      const picks = q.picksByStudentIndex[i];
      const score = q.questions.reduce((acc, question, qIdx) => acc + (picks[qIdx] === question.answer ? 1 : 0), 0);
      const startedAt = new Date(s.startedAt.getTime() + 11 * 60_000 + i * 15_000);
      const durationMs = 140_000 + i * 22_000;
      const submittedAt = new Date(startedAt.getTime() + durationMs);

      const attempt = await prisma.quizAttempt.upsert({
        where: { quizId_studentId: { quizId: q.id, studentId: student.id } },
        update: {
          startedAt,
          submittedAt,
          score,
          total: q.questions.length,
          durationMs,
          entry: i % 2 === 0 ? "board" : "qr",
        },
        create: {
          quizId: q.id,
          studentId: student.id,
          startedAt,
          submittedAt,
          score,
          total: q.questions.length,
          durationMs,
          entry: i % 2 === 0 ? "board" : "qr",
        },
      });

      for (let qIdx = 0; qIdx < q.questions.length; qIdx++) {
        const question = q.questions[qIdx];
        const choice = picks[qIdx] ?? "A";
        const isCorrect = choice === question.answer;
        await prisma.quizResponse.upsert({
          where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
          update: {
            choice,
            firstChoice: choice,
            isCorrect,
            timeMs: 28_000 + qIdx * 6_000,
            visits: 1,
            changes: [{ choice, at_ms: 28_000 + qIdx * 6_000 }],
            answerOrder: qIdx + 1,
          },
          create: {
            attemptId: attempt.id,
            questionId: question.id,
            choice,
            firstChoice: choice,
            isCorrect,
            timeMs: 28_000 + qIdx * 6_000,
            visits: 1,
            changes: [{ choice, at_ms: 28_000 + qIdx * 6_000 }],
            answerOrder: qIdx + 1,
          },
        });
      }
    }

    // Sent BlockProblem & student ProblemAttempts
    if (s.problem) {
      const sp = s.problem;
      await prisma.sessionProblem.upsert({
        where: { id: sp.id },
        update: {
          sessionId: s.id,
          problemId: sp.problem.id,
          title: sp.problem.title,
          story: sp.problem.story,
          challenge: sp.problem.challenge as unknown as object,
          status: "CLOSED",
          openedAt: new Date(s.startedAt.getTime() + 30 * 60_000),
          closedAt: new Date(s.startedAt.getTime() + 55 * 60_000),
        },
        create: {
          id: sp.id,
          sessionId: s.id,
          problemId: sp.problem.id,
          title: sp.problem.title,
          story: sp.problem.story,
          challenge: sp.problem.challenge as unknown as object,
          status: "CLOSED",
          openedAt: new Date(s.startedAt.getTime() + 30 * 60_000),
          closedAt: new Date(s.startedAt.getTime() + 55 * 60_000),
        },
      });

      for (let i = 0; i < Math.min(4, s.presentIndices.length); i++) {
        const student = allStudents[s.presentIndices[i]];
        if (!student) continue;
        const solvedWith = i % 2 === 0 ? "blocks" : "code";
        const startedAt = new Date(s.startedAt.getTime() + 31 * 60_000 + i * 20_000);
        const solvedAt = new Date(startedAt.getTime() + 180_000 + i * 30_000);
        await prisma.problemAttempt.upsert({
          where: { problemId_studentId: { problemId: sp.id, studentId: student.id } },
          update: {
            startedAt,
            solvedAt,
            solvedWith,
            blockChecks: solvedWith === "blocks" ? 2 : 0,
            blockAnswer: solvedWith === "blocks" ? (sp.problem.challenge.solution as unknown as object) : undefined,
            codeRuns: solvedWith === "code" ? 2 : 0,
            code: solvedWith === "code" ? sp.problem.challenge.code?.reference ?? null : null,
            codePassed: solvedWith === "code" ? sp.problem.challenge.code?.tests.length ?? 3 : null,
            codeTotal: solvedWith === "code" ? sp.problem.challenge.code?.tests.length ?? 3 : null,
          },
          create: {
            problemId: sp.id,
            studentId: student.id,
            startedAt,
            solvedAt,
            solvedWith,
            blockChecks: solvedWith === "blocks" ? 2 : 0,
            blockAnswer: solvedWith === "blocks" ? (sp.problem.challenge.solution as unknown as object) : undefined,
            codeRuns: solvedWith === "code" ? 2 : 0,
            code: solvedWith === "code" ? sp.problem.challenge.code?.reference ?? null : null,
            codePassed: solvedWith === "code" ? sp.problem.challenge.code?.tests.length ?? 3 : null,
            codeTotal: solvedWith === "code" ? sp.problem.challenge.code?.tests.length ?? 3 : null,
          },
        });
      }
    }
  }
}
