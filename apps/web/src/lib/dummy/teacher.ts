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
