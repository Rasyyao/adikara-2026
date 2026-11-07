import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { CLASS } from "../helpers/fake-database.js";
import { ADMIN_AUTH, OTHER_TEACHER_AUTH, SESSION_PATHS, TEACHER_AUTH, auth, createSession, joinSession, studentAuth } from "../helpers/sessions.js";

const QUESTIONS = [
  { question: "x = 5 lalu x = 7. Berapa isi x?", options: [{ key: "A", text: "5" }, { key: "B", text: "7" }], answer: "B", explanation: "", source: "Variabel" },
  { question: "Tipe dari 3.5?", options: [{ key: "A", text: "int" }, { key: "B", text: "float" }], answer: "B", explanation: "", source: "Tipe data" },
];

/** Kelas 7A (3 students): satu and dua join; satu gets both right, dua misses question 1 by picking A; tiga never joins. */
async function classWithResults() {
  const built = await buildTestApp();
  const { app } = built;
  const { id, code } = await createSession(app);
  await joinSession(app, code, "satu");
  await joinSession(app, code, "dua");
  await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
  const created = await request(app).post(`/api/v1/sessions/${id}/quizzes`).set(auth(TEACHER_AUTH)).send({ title: "Pre-Test", kind: "pretest", questions: QUESTIONS });
  const base = `/api/v1/sessions/${id}/quizzes/${created.body.quiz.id}`;
  const take = async (s: "satu" | "dua", picks: string[]) => {
    await request(app).post(`${base}/attempt`).set(auth(studentAuth(s))).send({});
    for (const [i, choice] of picks.entries()) {
      await request(app).put(`${base}/attempt/answers`).set(auth(studentAuth(s))).send({ question_id: i + 1, choice, time_ms: 1000 });
    }
    await request(app).post(`${base}/attempt/submit`).set(auth(studentAuth(s)));
  };
  await take("satu", ["B", "B"]);
  await take("dua", ["A", "B"]);
  return { app, id, db: built.db };
}

describe("teacher insights", () => {
  it("sums up participation, quizzes, the hardest questions and topics, and the students who need help", async () => {
    const { app, id } = await classWithResults();
    const res = await request(app).get("/api/v1/insights").set(auth(TEACHER_AUTH));
    expect(res.status).toBe(200);
    const body = res.body;

    expect(body.totals).toMatchObject({ classes: 1, students: 3, sessions: 1, live_sessions: 1, quizzes: 1, submissions: 2, correct_rate: 0.75 });
    expect(body.totals.participation_rate).toBeCloseTo(0.667, 3);
    expect(body.sessions[0]).toMatchObject({ id, class_name: "Kelas 7A", joined: 2, class_size: 3, quizzes: 1, correct_rate: 0.75 });
    expect(body.quizzes[0]).toMatchObject({ title: "Pre-Test", joined: 2, started: 2, submitted: 2, average_percent: 75 });

    expect(body.hardest_questions).toHaveLength(1);
    expect(body.hardest_questions[0]).toMatchObject({
      question_id: 1,
      topic: "Variabel",
      answered: 2,
      wrong: 1,
      correct_rate: 0.5,
      answer_text: "7",
      top_wrong: { key: "A", text: "5", count: 1 },
      missed_by: ["Siswa Dua"],
    });
    expect(body.topics.map((t: { topic: string; correct_rate: number }) => [t.topic, t.correct_rate])).toEqual([
      ["Variabel", 0.5],
      ["Tipe data", 1],
    ]);

    expect(body.students.map((s: { name: string }) => s.name)).toEqual(["Siswa Dua", "Siswa Satu"]);
    expect(body.students[0]).toMatchObject({ sessions_joined: 1, class_sessions: 1, quizzes_taken: 1, answered: 2, correct: 1, correct_rate: 0.5, weakest_topic: "Variabel" });
    expect(body.students[0].missed[0]).toMatchObject({ question: QUESTIONS[0].question, picked: "A", picked_text: "5", answer: "B", answer_text: "7" });
  });

  it("shows a teacher only their own sessions", async () => {
    const { app } = await classWithResults();
    const other = (await request(app).get("/api/v1/insights").set(auth(OTHER_TEACHER_AUTH))).body;
    expect(other.totals).toMatchObject({ sessions: 0, quizzes: 0, correct_rate: null });
    expect(other.students).toEqual([]);
  });

  it("is for staff only", async () => {
    const { app } = await buildTestApp();
    expect((await request(app).get("/api/v1/insights").set(auth(studentAuth("satu")))).status).toBe(403);
  });

  describe("one class", () => {
    const path = `/api/v1/insights/classes/${CLASS.id}`;

    it("shows the class's results, every student on the roster and who attended which session", async () => {
      const { app, id } = await classWithResults();
      const res = await request(app).get(path).set(auth(TEACHER_AUTH));
      expect(res.status).toBe(200);
      expect(res.body.class).toMatchObject({ id: CLASS.id, name: "Kelas 7A", student_count: 3 });
      expect(res.body.totals).toMatchObject({ sessions: 1, quizzes: 1, submissions: 2, correct_rate: 0.75 });
      expect(res.body.hardest_questions[0]).toMatchObject({ question_id: 1, missed_by: ["Siswa Dua"] });

      expect(res.body.attendance.sessions.map((s: { id: string }) => s.id)).toEqual([id]);
      const rows = Object.fromEntries(res.body.attendance.students.map((s: { name: string; present: boolean[]; rate: number }) => [s.name, [s.present, s.rate]]));
      expect(rows).toEqual({ "Siswa Satu": [[true], 1], "Siswa Dua": [[true], 1], "Siswa Tiga": [[false], 0] });
      // the one who lowered attendance comes first
      expect(res.body.attendance.students[0].name).toBe("Siswa Tiga");

      // tiga never joined, and is still in the student list
      expect(res.body.students.map((s: { name: string }) => s.name)).toEqual(["Siswa Dua", "Siswa Satu", "Siswa Tiga"]);
      expect(res.body.students[2]).toMatchObject({ sessions_joined: 0, class_sessions: 1, correct_rate: null });
      expect(res.body.report).toBeNull();
    });

    it("queues AI feedback from a snapshot of the results, and returns the pending one instead of a second", async () => {
      const { app, db } = await classWithResults();
      const first = await request(app).post(`${path}/feedback`).set(auth(TEACHER_AUTH));
      expect(first.status).toBe(202);
      expect(first.body.report).toMatchObject({ status: "pending", feedback: null });
      expect(db.jobs.filter((j) => j.type === "GENERATE_REPORT")).toEqual([{ type: "GENERATE_REPORT", payload: { reportId: first.body.report.id, classId: CLASS.id }, status: "QUEUED" }]);
      expect(db.reports[0].input).toMatchObject({
        class_name: "Kelas 7A",
        correct_rate: 0.75,
        hardest_questions: [{ topic: "Variabel", correct_answer: "7", most_picked_wrong: { answer: "5", students: 1 }, wrong: 1 }],
        students_needing_help: [{ name: "Siswa Dua", correct_rate: 0.5, weakest_topic: "Variabel" }],
        low_attendance: [{ name: "Siswa Tiga", attended: 0, of: 1 }],
      });

      const again = await request(app).post(`${path}/feedback`).set(auth(TEACHER_AUTH));
      expect(again.body.report.id).toBe(first.body.report.id);
      expect(db.reports).toHaveLength(1);
    });

    it("shows the feedback once the AI worker has written it, keeping only the expected fields", async () => {
      const { app, db } = await classWithResults();
      await request(app).post(`${path}/feedback`).set(auth(TEACHER_AUTH));
      Object.assign(db.reports[0], {
        status: "done",
        finishedAt: new Date(),
        feedback: { summary: "Kelas paham tipe data, tetapi belum paham variabel.", focus_topics: [{ topic: "Variabel", finding: "f", suggestion: "s" }, { finding: "tanpa topik" }], questions: [], students: [{ name: "Siswa Dua", reason: "r", action: "a" }], next_steps: ["Ulangi materi variabel", 7], extra: "dibuang" },
      });
      const res = await request(app).get(`${path}/feedback`).set(auth(TEACHER_AUTH));
      expect(res.status).toBe(200);
      expect(res.body.report).toMatchObject({ status: "done" });
      expect(res.body.report.feedback).toEqual({
        summary: "Kelas paham tipe data, tetapi belum paham variabel.",
        focus_topics: [{ topic: "Variabel", finding: "f", suggestion: "s" }],
        questions: [],
        students: [{ name: "Siswa Dua", reason: "r", action: "a" }],
        next_steps: ["Ulangi materi variabel"],
      });
      expect((await request(app).get(path).set(auth(TEACHER_AUTH))).body.report.feedback.summary).toMatch(/variabel/);
    });

    it("has nothing to analyse before a quiz is handed in", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).post(`${path}/feedback`).set(auth(TEACHER_AUTH));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("no_results");
    });

    it("is only for the class's own teacher (and admins)", async () => {
      const { app } = await classWithResults();
      expect((await request(app).get(path).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
      expect((await request(app).post(`${path}/feedback`).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
      expect((await request(app).get(path).set(auth(ADMIN_AUTH))).status).toBe(200);
      expect((await request(app).get(path).set(auth(studentAuth("satu")))).status).toBe(403);
      expect((await request(app).get("/api/v1/insights/classes/not-a-uuid").set(auth(TEACHER_AUTH))).status).toBe(400);
    });
  });
});
