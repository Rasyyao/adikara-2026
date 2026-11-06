import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { ADMIN_AUTH, OTHER_TEACHER_AUTH, TEACHER_AUTH, auth, studentAuth } from "../helpers/sessions.js";

const BASE = "/api/v1/problems";

const finished = (challenge: Record<string, unknown>) => ({
  ...challenge,
  blocks: [
    { id: "a", kind: "event", text: "ketika mulai" },
    { id: "b", kind: "loop", text: "ulangi 2 kali" },
    { id: "c", kind: "action", text: "maju" },
    { id: "d", kind: "action", text: "lompat" },
  ],
  solution: [{ block: "a" }, { block: "b", children: [{ block: "c" }] }],
});

const CODE = { fn: "luas", params: ["p", "l"], starter: "function luas(p, l) {\n}\n", reference: "function luas(p, l) { return p * l; }", tests: [{ args: [2, 3], expected: 6 }] };

async function draft() {
  const { app } = await buildTestApp();
  const res = await request(app).post(BASE).set(auth(TEACHER_AUTH)).send({ title: "Robot ke bendera" });
  return { app, problem: res.body.problem, status: res.status };
}

describe("teacher problems", () => {
  it("starts an empty challenge, listing what is unfinished", async () => {
    const { app, problem, status } = await draft();
    expect(status).toBe(201);
    expect(problem.status).toBe("draft");
    expect(problem.challenge).toMatchObject({ blocks: [], solution: [], code: null });
    expect(problem.issues).toEqual([{ code: "story_missing" }, { code: "no_mode" }]);

    const list = await request(app).get(BASE).set(auth(TEACHER_AUTH));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: problem.id, issues: 2, answer_blocks: 0, modes: { blocks: false, code: false } });
  });

  it("saves a JavaScript task with its tests, alone or next to blocks", async () => {
    const { app, problem } = await draft();
    const codeOnly = await request(app).put(`${BASE}/${problem.id}`).set(auth(TEACHER_AUTH)).send({ title: "Luas", story: "Hitung luas.", challenge: { ...problem.challenge, code: CODE } });
    expect(codeOnly.status).toBe(200);
    expect(codeOnly.body.problem).toMatchObject({ issues: [], challenge: { code: CODE } });
    const both = await request(app).put(`${BASE}/${problem.id}`).set(auth(TEACHER_AUTH)).send({ title: "Luas", story: "Hitung luas.", challenge: { ...finished(problem.challenge), code: CODE } });
    expect((await request(app).get(BASE).set(auth(TEACHER_AUTH))).body.items[0].modes).toEqual({ blocks: true, code: true });
    expect(both.body.problem.issues).toEqual([]);

    const bad = await request(app)
      .put(`${BASE}/${problem.id}`)
      .set(auth(TEACHER_AUTH))
      .send({ title: "Luas", challenge: { ...problem.challenge, code: { ...CODE, fn: "1 bad", tests: [{ args: [1], expected: 1 }] } } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields).toMatchObject({ "challenge.code.fn": expect.any(String), "challenge.code.tests[0].args": "must give 2 argument(s)" });
  });

  it("saves the challenge, becomes ready once finished, and goes back to draft when an edit breaks it", async () => {
    const { app, problem } = await draft();
    const early = await request(app).post(`${BASE}/${problem.id}/status`).set(auth(TEACHER_AUTH)).send({ status: "ready" });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("problem_incomplete");

    const body = { title: "Robot ke bendera", story: "Robot harus sampai ke bendera.", challenge: finished(problem.challenge) };
    const saved = await request(app).put(`${BASE}/${problem.id}`).set(auth(TEACHER_AUTH)).send(body);
    expect(saved.status).toBe(200);
    expect(saved.body.problem.issues).toEqual([]);

    const ready = await request(app).post(`${BASE}/${problem.id}/status`).set(auth(TEACHER_AUTH)).send({ status: "ready" });
    expect(ready.body.problem.status).toBe("ready");

    const broken = await request(app).put(`${BASE}/${problem.id}`).set(auth(TEACHER_AUTH)).send({ ...body, story: "" });
    expect(broken.body.problem.status).toBe("draft");
  });

  it("refuses an answer key that uses a block twice or nests under a step", async () => {
    const { app, problem } = await draft();
    const challenge = { ...finished(problem.challenge), solution: [{ block: "c", children: [{ block: "d" }] }] };
    const res = await request(app).put(`${BASE}/${problem.id}`).set(auth(TEACHER_AUTH)).send({ title: "x", challenge });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields["challenge.solution"]).toMatch(/cannot hold/);
  });

  it("grades blocks the way a student would be graded", async () => {
    const { app, problem } = await draft();
    await request(app).put(`${BASE}/${problem.id}`).set(auth(TEACHER_AUTH)).send({ title: "x", story: "y", challenge: finished(problem.challenge) });
    const right = await request(app).post(`${BASE}/${problem.id}/check`).set(auth(TEACHER_AUTH)).send({ answer: [{ block: "a" }, { block: "b", children: [{ block: "c" }] }] });
    expect(right.body).toMatchObject({ correct: true, missing: 0 });
    const wrong = await request(app).post(`${BASE}/${problem.id}/check`).set(auth(TEACHER_AUTH)).send({ answer: [{ block: "d" }, { block: "a" }] });
    expect(wrong.body).toMatchObject({ correct: false, missing: 2, blocks: { a: "right", d: "extra" } });
  });

  it("copies and deletes", async () => {
    const { app, problem } = await draft();
    const copy = await request(app).post(`${BASE}/${problem.id}/duplicate`).set(auth(TEACHER_AUTH)).send({});
    expect(copy.status).toBe(201);
    expect(copy.body.problem.title).toBe("Robot ke bendera (salinan)");
    expect((await request(app).delete(`${BASE}/${problem.id}`).set(auth(TEACHER_AUTH))).status).toBe(204);
    expect((await request(app).get(`${BASE}/${problem.id}`).set(auth(TEACHER_AUTH))).status).toBe(404);
  });

  it("keeps drafts private to their teacher (admins see all) and away from students", async () => {
    const { app, problem } = await draft();
    expect((await request(app).get(`${BASE}/${problem.id}`).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
    expect((await request(app).get(BASE).set(auth(OTHER_TEACHER_AUTH))).body.items).toEqual([]);
    expect((await request(app).get(`${BASE}/${problem.id}`).set(auth(ADMIN_AUTH))).status).toBe(200);
    expect((await request(app).get(BASE).set(auth(studentAuth("satu")))).status).toBe(403);
  });
});

describe("teacher problems from a material, drafted by the AI", () => {
  async function withMaterial(status: "EXTRACTED" | "UPLOADED" = "EXTRACTED") {
    const built = await buildTestApp();
    const { db } = built;
    const chat = { id: "6f1c2a4e-1b7d-4c55-9a51-0f1f2b3c4d5e", teacherId: TEACHER_AUTH.userId, title: "Perulangan Python", createdAt: new Date() };
    db.chats.set(chat.id, chat);
    db.materials.set("m1", { id: "m1", chatId: chat.id, title: "modul.pdf", fileType: "pdf", status, error: null, filePath: "x", buffer: Buffer.from("") } as never);
    return { ...built, chat };
  }

  it("lists the teacher's materials with their read files and problems", async () => {
    const { app, chat } = await withMaterial();
    const res = await request(app).get(`${BASE}/materials`).set(auth(TEACHER_AUTH));
    expect(res.body.items).toEqual([{ id: chat.id, title: "Perulangan Python", ready_files: 1, pending_files: 0, problems: 0 }]);
    expect((await request(app).get(`${BASE}/materials`).set(auth(OTHER_TEACHER_AUTH))).body.items).toEqual([]);
  });

  it("queues one job per draft and keeps the drafts locked until the worker writes them", async () => {
    const { app, db, chat } = await withMaterial();
    const res = await request(app).post(`${BASE}/generate`).set(auth(TEACHER_AUTH)).send({ material_id: chat.id, focus: "for loop", count: 2 });
    expect(res.status).toBe(202);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({ generation: "pending", origin: "ai", ai_focus: "for loop", material: { id: chat.id, title: "Perulangan Python" } });
    expect(db.problems.jobs.map((j) => j.payload)).toEqual(res.body.items.map((p: { id: string }) => ({ problemId: p.id, chatId: chat.id, focus: "for loop" })));

    const id = res.body.items[0].id;
    const locked = await request(app).put(`${BASE}/${id}`).set(auth(TEACHER_AUTH)).send({ title: "x", challenge: res.body.items[0].challenge });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("problem_generating");

    // the worker fills one in
    const row = db.problems.rows.get(id)!;
    db.problems.rows.set(id, { ...row, generation: null, title: "Robot berhitung", story: "Cerita." });
    const mine = await request(app).get(`${BASE}?material=${chat.id}`).set(auth(TEACHER_AUTH));
    expect(mine.body.items.map((p: { title: string }) => p.title).sort()).toEqual(["Robot berhitung", "Soal dari Perulangan Python"]);
    expect((await request(app).get(`${BASE}?material=none`).set(auth(TEACHER_AUTH))).body.items).toEqual([]);
    expect((await request(app).put(`${BASE}/${id}`).set(auth(TEACHER_AUTH)).send({ title: "x", challenge: res.body.items[0].challenge })).status).toBe(200);

    // deleting a draft the worker has not started drops its job
    await request(app).delete(`${BASE}/${res.body.items[1].id}`).set(auth(TEACHER_AUTH));
    expect(db.problems.jobs).toHaveLength(1);
  });

  it("asks again after a failure, keeping the focus unless a new one is given", async () => {
    const { app, db, chat } = await withMaterial();
    const res = await request(app).post(`${BASE}/generate`).set(auth(TEACHER_AUTH)).send({ material_id: chat.id, focus: "for loop" });
    const id = res.body.items[0].id;
    db.problems.rows.set(id, { ...db.problems.rows.get(id)!, generation: "failed", generationError: "Layanan AI sedang bermasalah." });
    expect((await request(app).get(`${BASE}/${id}`).set(auth(TEACHER_AUTH))).body.problem).toMatchObject({ generation: "failed", generation_error: "Layanan AI sedang bermasalah." });

    const again = await request(app).post(`${BASE}/${id}/regenerate`).set(auth(TEACHER_AUTH)).send({});
    expect(again.status).toBe(202);
    expect(again.body.problem).toMatchObject({ generation: "pending", generation_error: null, ai_focus: "for loop" });
    expect(db.problems.jobs.at(-1)!.payload).toEqual({ problemId: id, chatId: chat.id, focus: "for loop" });
  });

  it("turns a failed AI draft into a normal one when the teacher saves it by hand", async () => {
    const { app, db, chat } = await withMaterial();
    const res = await request(app).post(`${BASE}/generate`).set(auth(TEACHER_AUTH)).send({ material_id: chat.id });
    const { id, challenge } = res.body.items[0];
    db.problems.rows.set(id, { ...db.problems.rows.get(id)!, generation: "failed", generationError: "x" });
    const saved = await request(app).put(`${BASE}/${id}`).set(auth(TEACHER_AUTH)).send({ title: "Sendiri", challenge });
    expect(saved.body.problem).toMatchObject({ generation: null, generation_error: null });
  });

  it("refuses a material that is not read yet, or not the teacher's", async () => {
    const { app, chat } = await withMaterial("UPLOADED");
    const early = await request(app).post(`${BASE}/generate`).set(auth(TEACHER_AUTH)).send({ material_id: chat.id });
    expect(early.status).toBe(409);
    expect(early.body.error).toMatchObject({ code: "material_not_ready", details: { pending_files: 1 } });
    expect((await request(app).post(`${BASE}/generate`).set(auth(OTHER_TEACHER_AUTH)).send({ material_id: chat.id })).status).toBe(404);
    expect((await request(app).post(BASE).set(auth(OTHER_TEACHER_AUTH)).send({ title: "x", material_id: chat.id })).status).toBe(404);
    expect((await request(app).post(`${BASE}/generate`).set(auth(TEACHER_AUTH)).send({ material_id: chat.id, count: 9 })).status).toBe(400);
  });

  it("files a hand-made problem under a material", async () => {
    const { app, chat } = await withMaterial();
    const res = await request(app).post(BASE).set(auth(TEACHER_AUTH)).send({ title: "Manual", material_id: chat.id });
    expect(res.body.problem).toMatchObject({ origin: "manual", generation: null, material: { id: chat.id } });
    const moved = await request(app).put(`${BASE}/${res.body.problem.id}`).set(auth(TEACHER_AUTH)).send({ title: "Manual", challenge: res.body.problem.challenge, material_id: null });
    expect(moved.body.problem.material).toBeNull();
  });
});
