/** Dummy data for the student dashboard. Replace with API calls once the endpoints exist. */

export interface StudentSession {
  id: string;
  subject: string;
  teacher: string;
  date: string;
  status: "PRESENT" | "LATE" | "ABSENT";
}

export const STUDENT_PROFILE = { className: "X RPL 1", nis: "2026101" };

export const STUDENT_STATS = [
  { label: "Kehadiran bulan ini", value: "92%", delta: 4.2, hint: "dibanding bulan lalu", icon: "attendance" },
  { label: "Sesi diikuti", value: "11", delta: 10, hint: "dari 12 sesi", icon: "sessions" },
  { label: "Terlambat", value: "1", delta: 0, hint: "bulan ini", icon: "late" },
  { label: "Tidak hadir", value: "1", delta: -50, hint: "dibanding bulan lalu", icon: "absent" },
] as const;

export const STUDENT_SESSIONS: StudentSession[] = [
  { id: "h1", subject: "Pemrograman Dasar", teacher: "Bu Sari Wulandari", date: "21 Okt 2026, 07:30", status: "PRESENT" },
  { id: "h2", subject: "Matematika", teacher: "Pak Hendra Putra", date: "20 Okt 2026, 09:15", status: "PRESENT" },
  { id: "h3", subject: "Bahasa Indonesia", teacher: "Bu Ratna Dewi", date: "20 Okt 2026, 07:30", status: "LATE" },
  { id: "h4", subject: "Pemrograman Dasar", teacher: "Bu Sari Wulandari", date: "17 Okt 2026, 07:30", status: "PRESENT" },
  { id: "h5", subject: "Bahasa Inggris", teacher: "Pak Dimas Aryo", date: "16 Okt 2026, 10:00", status: "ABSENT" },
  { id: "h6", subject: "Matematika", teacher: "Pak Hendra Putra", date: "15 Okt 2026, 09:15", status: "PRESENT" },
  { id: "h7", subject: "Pemrograman Dasar", teacher: "Bu Sari Wulandari", date: "14 Okt 2026, 07:30", status: "PRESENT" },
  { id: "h8", subject: "Bahasa Indonesia", teacher: "Bu Ratna Dewi", date: "13 Okt 2026, 07:30", status: "PRESENT" },
];
