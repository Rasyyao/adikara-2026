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
