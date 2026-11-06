import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { openStream, type OpenStream } from "../helpers/sse.js";
import { OTHER_TEACHER_AUTH, SESSION_PATHS, TEACHER_AUTH, auth, createSession, joinSession, studentAuth } from "../helpers/sessions.js";

const open: OpenStream[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((stream) => stream.close()));
});

const CHALLENGE = {
  prompt: "Susun program robot.",
  hint: "Ulangi langkahnya.",
  ordered: true,
  blocks: [
    { id: "a", kind: "event", text: "ketika mulai" },
    { id: "b", kind: "loop", text: "ulangi 2 kali" },
    { id: "c", kind: "action", text: "maju" },
    { id: "d", kind: "action", text: "lompat" },
  ],
  solution: [{ block: "a" }, { block: "b", children: [{ block: "c" }] }],
  code: { fn: "langkah", params: ["n"], starter: "function langkah(n) {\n}\n", reference: "function langkah(n) { return n * 2; }", tests: [{ args: [2], expected: 4 }, { args: [3], expected: 6 }] },
};

/** A live class of three, and a ready problem of the teacher sent to it. */
async function classWithProblem() {
  const { app } = await buildTestApp();
  const { id, code } = await createSession(app);
  for (const s of ["satu", "dua", "tiga"] as const) await joinSession(app, code, s);
  await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
  const draft = await request(app).post("/api/v1/problems").set(auth(TEACHER_AUTH)).send({ title: "Robot", story: "Robot harus maju." });
  const problemId = draft.body.problem.id as string;
  await request(app).put(`/api/v1/problems/${problemId}`).set(auth(TEACHER_AUTH)).send({ title: "Robot", story: "Robot harus maju.", challenge: CHALLENGE });
  const send = () => request(app).post(`/api/v1/sessions/${id}/problems`).set(auth(TEACHER_AUTH)).send({ problem_id: problemId });
  return { app, id, problemId, send };
}

describe("problems sent to a session", () => {
  it("only sends a ready problem, and announces it to everyone", async () => {
    const { app, id, problemId, send } = await classWithProblem();
    const early = await send();
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("problem_not_ready");

    await request(app).post(`/api/v1/problems/${problemId}/status`).set(auth(TEACHER_AUTH)).send({ status: "ready" });
    const stream = await openStream(app, SESSION_PATHS.events(id), auth(studentAuth("satu")));
    open.push(stream);
    expect((await stream.next()).type).toBe("snapshot");

    const sent = await send();
    expect(sent.status).toBe(201);
    expect(sent.body.problem).toMatchObject({ title: "Robot", status: "open", modes: { blocks: true, code: true } });
    expect(await stream.next()).toMatchObject({ type: "problem_opened", data: { problem: { id: sent.body.problem.id } } });

    // another teacher cannot send it, and a student learns of it after joining late
    expect((await request(app).post(`/api/v1/sessions/${id}/problems`).set(auth(OTHER_TEACHER_AUTH)).send({ problem_id: problemId })).status).toBe(404);
    const openNow = await request(app).get(`/api/v1/sessions/${id}/open-problems`).set(auth(studentAuth("dua")));
    expect(openNow.body.items).toMatchObject([{ id: sent.body.problem.id, solved: false }]);
  });

  it("hides the answers, grades blocks, records code, and shows the teacher who solved it how", async () => {
    const { app, id, problemId, send } = await classWithProblem();
    await request(app).post(`/api/v1/problems/${problemId}/status`).set(auth(TEACHER_AUTH)).send({ status: "ready" });
    const sentId = (await send()).body.problem.id as string;
    const base = `/api/v1/sessions/${id}/problems/${sentId}`;

    const seen = (await request(app).get(base).set(auth(studentAuth("satu")))).body;
    expect(seen.problem.challenge).not.toHaveProperty("solution");
    expect(seen.problem.challenge.code).not.toHaveProperty("reference");
    expect(seen.problem.challenge).toMatchObject({ answer_blocks: 3, code: { fn: "langkah", tests: CHALLENGE.code.tests } });
    expect(seen.attempt).toMatchObject({ solved_at: null, block_checks: 0 });

    // satu: wrong blocks, then right ones
    const wrong = await request(app).post(`${base}/check`).set(auth(studentAuth("satu"))).send({ answer: [{ block: "d" }] });
    expect(wrong.body.grade).toMatchObject({ correct: false, blocks: { d: "extra" } });
    const right = await request(app).post(`${base}/check`).set(auth(studentAuth("satu"))).send({ answer: CHALLENGE.solution });
    expect(right.body).toMatchObject({ grade: { correct: true }, attempt: { solved_with: "blocks", block_checks: 2 } });

    // dua: code that fails a test, then code that passes them all
    await request(app).get(base).set(auth(studentAuth("dua")));
    const half = await request(app).post(`${base}/code`).set(auth(studentAuth("dua"))).send({ code: "function langkah(n) { return 4; }", passed: 1, total: 2 });
    expect(half.body).toMatchObject({ solved: false, attempt: { code_runs: 1, code_passed: 1 } });
    const all = await request(app).post(`${base}/code`).set(auth(studentAuth("dua"))).send({ code: "function langkah(n) { return n + n; }", passed: 2, total: 2 });
    expect(all.body).toMatchObject({ solved: true, attempt: { solved_with: "code", code_runs: 2 } });
    // a report that does not match the tests is refused
    expect((await request(app).post(`${base}/code`).set(auth(studentAuth("dua"))).send({ code: "x", passed: 5, total: 5 })).status).toBe(400);

    const results = (await request(app).get(`${base}/results`).set(auth(TEACHER_AUTH))).body;
    expect(results.summary).toEqual({ joined: 3, opened: 2, solved: 2, solved_blocks: 1, solved_code: 1 });
    expect(results.problem.challenge.code.reference).toBe(CHALLENGE.code.reference);
    expect(results.students.map((s: { name: string; status: string; solved_with: string | null }) => [s.name, s.status, s.solved_with])).toEqual(
      expect.arrayContaining([
        ["Siswa Satu", "solved", "blocks"],
        ["Siswa Dua", "solved", "code"],
        ["Siswa Tiga", "waiting", null],
      ]),
    );
    expect(results.students.find((s: { name: string }) => s.name === "Siswa Dua").code).toBe("function langkah(n) { return n + n; }");

    const list = (await request(app).get(`/api/v1/sessions/${id}/problems`).set(auth(TEACHER_AUTH))).body;
    expect(list.items).toMatchObject([{ id: sentId, opened: 2, solved: 2 }]);
  });

  it("stops checks once the teacher closes it, and keeps a sent copy when the problem changes", async () => {
    const { app, id, problemId, send } = await classWithProblem();
    await request(app).post(`/api/v1/problems/${problemId}/status`).set(auth(TEACHER_AUTH)).send({ status: "ready" });
    const sentId = (await send()).body.problem.id as string;
    const base = `/api/v1/sessions/${id}/problems/${sentId}`;
    await request(app).put(`/api/v1/problems/${problemId}`).set(auth(TEACHER_AUTH)).send({ title: "Diubah", story: "Lain.", challenge: { ...CHALLENGE, prompt: "Baru" } });
    expect((await request(app).get(base).set(auth(studentAuth("satu")))).body.problem).toMatchObject({ title: "Robot", challenge: { prompt: "Susun program robot." } });

    const closed = await request(app).post(`${base}/close`).set(auth(TEACHER_AUTH)).send({});
    expect(closed.body.problem.status).toBe("closed");
    const late = await request(app).post(`${base}/check`).set(auth(studentAuth("satu"))).send({ answer: CHALLENGE.solution });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("problem_closed");
    expect((await request(app).get(`/api/v1/sessions/${id}/open-problems`).set(auth(studentAuth("satu")))).body.items).toEqual([]);
  });
});
