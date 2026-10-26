/** Dummy data for the teacher dashboard. Replace with API calls once the endpoints exist. */

export interface ClassSummary {
  id: string;
  name: string;
  subject: string;
  students: number;
  attendanceRate: number;
  lastSession: string;
}

export interface SessionRow {
  id: string;
  className: string;
  topic: string;
  date: string;
  present: number;
  total: number;
  status: "ACTIVE" | "ENDED";
}

export type MaterialStatus = "DIPUBLIKASIKAN" | "DISETUJUI" | "DRAF";
export type FileKind = "PDF" | "PPTX" | "DOCX";
export type ExtractionState = "EXTRACTED" | "UPLOADED" | "FAILED";

export interface MaterialSource {
  id: string;
  title: string;
  fileType: FileKind;
  sizeLabel: string;
  status: ExtractionState;
  error?: string;
}

export interface ChatMessageItem {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  attachment?: MaterialSource;
  sources?: string[];
}

export interface MaterialRow {
  id: string;
  title: string;
  className: string;
  subject: string;
  fileCount: number;
  updatedAt: string;
  status: MaterialStatus;
  sources: MaterialSource[];
  messages: ChatMessageItem[];
}

export const TEACHER_STATS = [
  { label: "Kelas diampu", value: "4", delta: 0, hint: "semester ini", icon: "classes" },
  { label: "Total siswa", value: "142", delta: 2.8, hint: "dibanding semester lalu", icon: "students" },
  { label: "Sesi bulan ini", value: "18", delta: 20, hint: "dibanding bulan lalu", icon: "sessions" },
  { label: "Rata-rata kehadiran", value: "91%", delta: -1.4, hint: "dibanding bulan lalu", icon: "attendance" },
] as const;

export const TEACHER_CLASSES: ClassSummary[] = [
  { id: "c1", name: "X RPL 1", subject: "Pemrograman Dasar", students: 36, attendanceRate: 94, lastSession: "21 Okt 2026" },
  { id: "c2", name: "X RPL 2", subject: "Pemrograman Dasar", students: 35, attendanceRate: 89, lastSession: "20 Okt 2026" },
  { id: "c3", name: "XI RPL 1", subject: "Basis Data", students: 34, attendanceRate: 92, lastSession: "20 Okt 2026" },
  { id: "c4", name: "XII RPL 2", subject: "Proyek Akhir", students: 37, attendanceRate: 86, lastSession: "17 Okt 2026" },
];

export const TEACHER_SESSIONS: SessionRow[] = [
  { id: "s1", className: "X RPL 1", topic: "Perulangan for dan while", date: "21 Okt 2026, 07:30", present: 34, total: 36, status: "ACTIVE" },
  { id: "s2", className: "X RPL 2", topic: "Percabangan if else", date: "20 Okt 2026, 09:15", present: 31, total: 35, status: "ENDED" },
  { id: "s3", className: "XI RPL 1", topic: "Normalisasi tabel", date: "20 Okt 2026, 07:30", present: 32, total: 34, status: "ENDED" },
  { id: "s4", className: "XII RPL 2", topic: "Bimbingan proyek akhir", date: "17 Okt 2026, 10:00", present: 32, total: 37, status: "ENDED" },
  { id: "s5", className: "X RPL 1", topic: "Variabel dan tipe data", date: "14 Okt 2026, 07:30", present: 35, total: 36, status: "ENDED" },
  { id: "s6", className: "XI RPL 1", topic: "Relasi antar tabel", date: "13 Okt 2026, 07:30", present: 30, total: 34, status: "ENDED" },
  { id: "s7", className: "X RPL 2", topic: "Operator dan ekspresi", date: "13 Okt 2026, 09:15", present: 33, total: 35, status: "ENDED" },
];

/** Attendance percentage of the last 7 finished sessions, oldest first. */
export const ATTENDANCE_TREND = [
  { date: "13 Okt", className: "X RPL 2", value: 88 },
  { date: "13 Okt", className: "XI RPL 1", value: 94 },
  { date: "14 Okt", className: "X RPL 1", value: 97 },
  { date: "17 Okt", className: "XII RPL 2", value: 86 },
  { date: "20 Okt", className: "XI RPL 1", value: 94 },
  { date: "20 Okt", className: "X RPL 2", value: 89 },
  { date: "21 Okt", className: "X RPL 1", value: 94 },
];

export const TEACHER_MATERIALS: MaterialRow[] = [
  {
    id: "m1",
    title: "Perulangan for dan while",
    className: "X RPL 1",
    subject: "Pemrograman Dasar",
    fileCount: 2,
    updatedAt: "21 Okt 2026, 08:15",
    status: "DIPUBLIKASIKAN",
    sources: [
      { id: "src-1", title: "Modul_04_Perulangan_Dasar.pdf", fileType: "PDF", sizeLabel: "2,4 MB", status: "EXTRACTED" },
      { id: "src-2", title: "Slide_Perulangan_X_RPL.pptx", fileType: "PPTX", sizeLabel: "4,1 MB", status: "EXTRACTED" },
    ],
    messages: [
      {
        id: "msg-1",
        role: "USER",
        content: "Tolong buatkan ringkasan materi dan 3 latihan bertahap tentang perulangan for dan while dari modul ini untuk kelas X RPL 1.",
        createdAt: "08:10",
        attachment: { id: "src-1", title: "Modul_04_Perulangan_Dasar.pdf", fileType: "PDF", sizeLabel: "2,4 MB", status: "EXTRACTED" },
      },
      {
        id: "msg-2",
        role: "ASSISTANT",
        content:
          "Berikut draf bahan ajar dan latihan bertahap berdasarkan **Modul_04_Perulangan_Dasar.pdf**:\n\n### 1. Ringkasan Konsep Inti\n- **Perulangan `for`**: Digunakan ketika jumlah iterasi sudah diketahui sejak awal (memiliki nilai awal, kondisi berhenti, dan perubahan nilai).\n- **Perulangan `while`**: Digunakan ketika perulangan bergantung pada suatu kondisi logika yang dievaluasi sebelum setiap iterasi.\n- **Kesalahan umum siswa**: Lupa memperbarui variabel penghitung di dalam `while` sehingga terjadi *infinite loop*.\n\n### 2. Contoh Kode Penjelas\n```python\n# Mencetak bilangan genap 2 sampai 10 dengan for\nfor angka in range(2, 11, 2):\n    print(angka)\n\n# Menghitung mundur dengan while\nhitung = 5\nwhile hitung > 0:\n    print(hitung)\n    hitung -= 1\n```\n\n### 3. Tiga Latihan Bertahap\n1. **Level Dasar (Lacak Nilai)**: Tentukan output dari perulangan `for` dengan langkah penambahan 3.\n2. **Level Menengah (Perbaiki Kode)**: Diberikan kode `while` yang mengalami *infinite loop*, siswa diminta menambahkan baris pembaruan variabel.\n3. **Level Tantangan (Studi Kasus)**: Buat program penghitung rata-rata nilai rapor yang terus meminta input hingga pengguna mengetik `-1`.",
        createdAt: "08:11",
        sources: ["Modul_04_Perulangan_Dasar.pdf · Bab 2 & 3"],
      },
    ],
  },
  {
    id: "m2",
    title: "Normalisasi tabel (1NF hingga 3NF)",
    className: "XI RPL 1",
    subject: "Basis Data",
    fileCount: 1,
    updatedAt: "20 Okt 2026, 14:20",
    status: "DISETUJUI",
    sources: [
      { id: "src-3", title: "Panduan_Normalisasi_Basis_Data.pdf", fileType: "PDF", sizeLabel: "1,8 MB", status: "EXTRACTED" },
    ],
    messages: [
      {
        id: "msg-3",
        role: "USER",
        content: "Susun studi kasus nota pembelian kantin sekolah yang belum ternormalisasi, lalu tunjukkan langkah perubahan dari 1NF ke 3NF.",
        createdAt: "14:18",
        attachment: { id: "src-3", title: "Panduan_Normalisasi_Basis_Data.pdf", fileType: "PDF", sizeLabel: "1,8 MB", status: "EXTRACTED" },
      },
      {
        id: "msg-4",
        role: "ASSISTANT",
        content:
          "Berikut rancangan studi kasus **Nota Kantin Sekolah** untuk kelas **XI RPL 1**:\n\n### Tabel Awal (Belum Normal)\nSatu baris nota masih menyimpan beberapa menu sekaligus (`Nasi Goreng, Es Teh`) dan mencampur data siswa, barang, serta transaksi.\n\n### Langkah Normalisasi\n1. **Bentuk Normal Pertama (1NF)**: Pisahkan kolom menu yang bernilai ganda sehingga setiap sel hanya menyimpan satu nilai atomik.\n2. **Bentuk Normal Kedua (2NF)**: Pisahkan tabel menjadi `Transaksi` dan `Detail_Transaksi` agar atribut non-kunci bergantung penuh pada kunci utama komposit.\n3. **Bentuk Normal Ketiga (3NF)**: Pindahkan `nama_siswa` dan `kelas` ke tabel `Siswa`, serta `nama_menu` dan `harga_satuan` ke tabel `Menu` untuk menghilangkan ketergantungan transitif.",
        createdAt: "14:20",
        sources: ["Panduan_Normalisasi_Basis_Data.pdf · Halaman 6–11"],
      },
    ],
  },
  {
    id: "m3",
    title: "Percabangan if-else dan switch",
    className: "X RPL 2",
    subject: "Pemrograman Dasar",
    fileCount: 1,
    updatedAt: "19 Okt 2026, 10:05",
    status: "DIPUBLIKASIKAN",
    sources: [
      { id: "src-4", title: "Materi_Percabangan_Logika.docx", fileType: "DOCX", sizeLabel: "940 KB", status: "EXTRACTED" },
    ],
    messages: [
      {
        id: "msg-5",
        role: "USER",
        content: "Buatkan 5 soal diagnostik pilihan ganda untuk mengecek miskonsepsi urutan kondisi if-elif-else.",
        createdAt: "10:02",
        attachment: { id: "src-4", title: "Materi_Percabangan_Logika.docx", fileType: "DOCX", sizeLabel: "940 KB", status: "EXTRACTED" },
      },
      {
        id: "msg-6",
        role: "ASSISTANT",
        content:
          "Saya telah menyusun 5 soal diagnostik dengan fokus pada **urutan evaluasi kondisi (`if-elif-else`)** dan **operator perbandingan (`==` vs `=`)**:\n\n- **Soal 1–2**: Menguji pemahaman ketika kondisi yang lebih longgar (`nilai >= 60`) diletakkan sebelum kondisi yang lebih ketat (`nilai >= 85`).\n- **Soal 3–4**: Menguji ekspresi logika majemuk menggunakan operator `and` serta `or`.\n- **Soal 5**: Studi kasus penentuan kategori kelulusan dan remedial.",
        createdAt: "10:05",
        sources: ["Materi_Percabangan_Logika.docx · Bagian Evaluasi"],
      },
    ],
  },
  {
    id: "m4",
    title: "Perancangan endpoint REST API",
    className: "XII RPL 2",
    subject: "Proyek Akhir",
    fileCount: 1,
    updatedAt: "17 Okt 2026, 16:40",
    status: "DRAF",
    sources: [
      { id: "src-5", title: "Standar_REST_API_Proyek.pptx", fileType: "PPTX", sizeLabel: "3,2 MB", status: "EXTRACTED" },
    ],
    messages: [
      {
        id: "msg-7",
        role: "USER",
        content: "Rangkum aturan penamaan endpoint dan kode status HTTP yang wajib dipakai siswa pada proyek akhir.",
        createdAt: "16:38",
        attachment: { id: "src-5", title: "Standar_REST_API_Proyek.pptx", fileType: "PPTX", sizeLabel: "3,2 MB", status: "EXTRACTED" },
      },
      {
        id: "msg-8",
        role: "ASSISTANT",
        content:
          "Berikut panduan ringkas standar **REST API Proyek Akhir** untuk siswa kelas **XII RPL 2**:\n\n1. **Penamaan Resource**: Gunakan kata benda jamak dalam huruf kecil (`GET /books`, `POST /loans`).\n2. **Kode Status Utama**:\n   - `200 OK` untuk pembacaan atau pembaruan berhasil.\n   - `201 Created` saat baris baru berhasil disimpan.\n   - `400 Bad Request` saat validasi input gagal.\n   - `404 Not Found` saat ID data tidak ditemukan.",
        createdAt: "16:40",
        sources: ["Standar_REST_API_Proyek.pptx · Slide 4–9"],
      },
    ],
  },
];

export const STARTER_PROMPTS = [
  {
    title: "Ringkas berkas menjadi modul ajar",
    description: "Susun konsep inti, contoh kode, dan langkah penjelasan di kelas",
    prompt: "Tolong ringkas berkas materi ini menjadi modul ajar yang rapi lengkap dengan tujuan pembelajaran, penjelasan konsep inti, dan contoh kode sederhana.",
  },
  {
    title: "Buat soal latihan & diagnostik",
    description: "5 soal pilihan ganda untuk mendeteksi miskonsepsi siswa",
    prompt: "Buatkan 5 soal latihan pilihan ganda beserta kunci jawaban dan alasan pengecohnya untuk menguji pemahaman siswa terhadap materi ini.",
  },
  {
    title: "Susun studi kasus praktik",
    description: "Latihan berpikir komputasional bertahap dari dasar ke mahir",
    prompt: "Susun 3 latihan pemrograman bertahap (dasar, menengah, tantangan) dengan tema kehidupan sehari-hari di sekolah berdasarkan materi ini.",
  },
  {
    title: "Identifikasi kesulitan umum siswa",
    description: "Peta konsep yang sering disalahpahami beserta cara menjelaskannya",
    prompt: "Apa saja bagian dari materi ini yang biasanya paling sulit dipahami siswa SMK, dan bagaimana analogi sederhana untuk menjelaskannya?",
  },
] as const;
