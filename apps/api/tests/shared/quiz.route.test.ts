import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { openStream, type OpenStream } from "../helpers/sse.js";
import { SESSION_PATHS, TEACHER_AUTH, auth, createSession, joinSession, studentAuth } from "../helpers/sessions.js";

const open: OpenStream[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((stream) => stream.close()));
});

const QUESTIONS = [
  { question: "x = 5 lalu x = 7. Berapa isi x?", options: [{ key: "A", text: "5" }, { key: "B", text: "7" }, { key: "C", text: "12" }], answer: "B", explanation: "Nilai baru menimpa nilai lama." },
  { question: "Tipe dari 3.5?", options: [{ key: "A", text: "int" }, { key: "B", text: "float" }], answer: "B", explanation: "Ada koma." },
];

async function classWithQuiz() {
  const { app } = await buildTestApp();
  const { id, code } = await createSession(app);
  for (const s of ["satu", "dua", "tiga"] as const) await joinSession(app, code, s);
  await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
  const created = await request(app).post(`/api/v1/sessions/${id}/quizzes`).set(auth(TEACHER_AUTH)).send({ title: "Pre-Test", kind: "pretest", questions: QUESTIONS });
  const quizId = created.body.quiz.id as string;
  const base = `/api/v1/sessions/${id}/quizzes/${quizId}`;
  const as = (s: "satu" | "dua" | "tiga") => ({
    start: () => request(app).post(`${base}/attempt`).set(auth(studentAuth(s))).send({ entry: "qr", client: { platform: "Android", touch: true } }),
    answer: (body: object) => request(app).put(`${base}/attempt/answers`).set(auth(studentAuth(s))).send(body),
    submit: () => request(app).post(`${base}/attempt/submit`).set(auth(studentAuth(s))),
    play: () => request(app).get(base).set(auth(studentAuth(s))),
  });
  const teacher = (path = "") => request(app).get(`${base}${path}`).set(auth(TEACHER_AUTH));
  return { app, id, quizId, base, created, as, teacher };
}

describe("quizzes in a session", () => {
  it("opens a quiz for everyone and hides the answers from a student until they hand in", async () => {
    const { app, id, created, as } = await classWithQuiz();
    expect(created.status).toBe(201);
    expect(created.body.quiz).toMatchObject({ title: "Pre-Test", kind: "pretest", status: "open", question_count: 2 });

    const stream = await openStream(app, SESSION_PATHS.events(id), auth(studentAuth("satu")));
    open.push(stream);
    expect((await stream.next()).type).toBe("snapshot");

    const quiz = (await as("satu").play()).body;
    expect(quiz.questions[0]).not.toHaveProperty("answer");
    expect(quiz.attempt).toBeNull();
  });

  it("keeps every pick, grades on hand-in, and ranks by score then time", async () => {
    const { as, teacher } = await classWithQuiz();
    await as("satu").start();
    // changed from A to B: first pick wrong, final right
    await as("satu").answer({ question_id: 1, choice: "B", time_ms: 9000, visits: 2, changes: [{ choice: "A", at_ms: 3000 }, { choice: "B", at_ms: 9000 }] });
    await as("satu").answer({ question_id: 2, choice: "B", time_ms: 4000 });
    const mine = await as("satu").submit();
    expect(mine.body.attempt).toMatchObject({ score: 2, total: 2, rank: 1, ranked: 1 });
    expect(mine.body.questions[0]).toMatchObject({ answer: "B", explanation: "Nilai baru menimpa nilai lama." });

    await as("dua").start();
    await as("dua").answer({ question_id: 1, choice: "A", time_ms: 2000 });
    await as("dua").submit();
    await as("tiga").start(); // still answering

    const results = (await teacher("/results")).body;
    expect(results.summary).toMatchObject({ joined: 3, started: 3, submitted: 2, highest: 2, lowest: 0, average_score: 1 });
    expect(results.leaderboard.map((r: { name: string; rank: number | null; status: string }) => [r.name, r.rank, r.status])).toEqual([
      ["Siswa Satu", 1, "submitted"],
      ["Siswa Dua", 2, "submitted"],
      ["Siswa Tiga", null, "in_progress"],
    ]);
    const q1 = results.questions[0];
    expect(q1).toMatchObject({ answered: 2, correct: 1, correct_rate: 0.5, changed: 1, wrong_to_right: 1, right_to_wrong: 0, top_wrong: { key: "A", text: "5", count: 1 } });

    const data = (await teacher("/export")).body;
    expect(data.schema_version).toBe(1);
    const row = data.rows.find((r: { student_name: string; question_id: number }) => r.student_name === "Siswa Satu" && r.question_id === 1);
    expect(row).toMatchObject({ choice: "B", choice_text: "7", first_choice: "A", first_choice_text: "5", changed: true, time_ms: 9000, visits: 2, answer_order: 1, entry: "qr" });
    expect(row.client).toMatchObject({ platform: "Android", touch: true });
    expect(data.rows.filter((r: { student_name: string }) => r.student_name === "Siswa Dua").map((r: { answered: boolean }) => r.answered)).toEqual([true, false]);
  });

  it("lists the students in the session who have not opened the quiz yet", async () => {
    const { as, teacher } = await classWithQuiz();
    await as("satu").start();
    const results = (await teacher("/results")).body;
    expect(results.waiting.map((w: { name: string; online: boolean }) => [w.name, w.online])).toEqual([
      ["Siswa Dua", true],
      ["Siswa Tiga", true],
    ]);
    await as("dua").start();
    expect((await teacher("/results")).body.waiting.map((w: { name: string }) => w.name)).toEqual(["Siswa Tiga"]);
  });

  it("closing hands in whoever is still answering and stops new answers", async () => {
    const { app, id, quizId, as, teacher } = await classWithQuiz();
    await as("tiga").start();
    await as("tiga").answer({ question_id: 2, choice: "B", time_ms: 1000 });
    const closed = await request(app).post(`/api/v1/sessions/${id}/quizzes/${quizId}/close`).set(auth(TEACHER_AUTH));
    expect(closed.body.quiz.status).toBe("closed");

    expect((await as("tiga").answer({ question_id: 1, choice: "B", time_ms: 1000 })).body.error.code).toBe("quiz_closed");
    expect((await as("satu").start()).status).toBe(409);
    expect((await teacher("/results")).body.leaderboard[0]).toMatchObject({ name: "Siswa Tiga", score: 1, status: "submitted" });
  });

  it("refuses a bad answer, a quiz of another session, and a student outside the session", async () => {
    const { app, base, as } = await classWithQuiz();
    await as("satu").start();
    expect((await as("satu").answer({ question_id: 2, choice: "C", time_ms: 1 })).status).toBe(400); // question 2 has no C
    expect((await as("satu").answer({ question_id: 9, choice: "A", time_ms: 1 })).status).toBe(400);
    expect((await request(app).get(base.replace(/quizzes\/[^/]+/, "quizzes/00000000-0000-4000-8000-0000000000ff")).set(auth(studentAuth("satu")))).status).toBe(404);
    expect((await request(app).get(base).set(auth(studentAuth("luar")))).status).toBe(403);
  });

  it("rejects a quiz whose answer is not one of its options", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    const bad = await request(app)
      .post(`/api/v1/sessions/${id}/quizzes`)
      .set(auth(TEACHER_AUTH))
      .send({ title: "X", kind: "quiz", questions: [{ question: "?", options: [{ key: "A", text: "a" }, { key: "B", text: "b" }], answer: "D" }] });
    expect(bad.status).toBe(400);
  });
});
