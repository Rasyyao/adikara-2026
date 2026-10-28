import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { OTHER_TEACHER_AUTH, SESSION_PATHS, TEACHER_AUTH, auth, createSession, studentAuth } from "../helpers/sessions.js";

const rect = (id: string) => ({ id, type: "rectangle", x: 10, y: 20, width: 100, height: 50, version: 1 });

describe("the session whiteboard", () => {
  it("is empty (board null) until something is saved", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    const res = await request(app).get(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ board: null, updated_at: null });
  });

  it("saves a scene and returns it; the latest save wins", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    const first = await request(app).put(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH)).send({ elements: [rect("a")], appState: { viewBackgroundColor: "#fff" } });
    expect(first.status).toBe(200);
    expect(first.body.updated_at).toEqual(expect.any(String));

    await request(app).put(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH)).send({ elements: [rect("a"), rect("b")] });
    const res = await request(app).get(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH));
    expect(res.body.board.elements.map((e: { id: string }) => e.id)).toEqual(["a", "b"]);
  });

  it("keeps only the background colour of appState (zoom, selection and the like are dropped)", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    await request(app).put(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH)).send({ elements: [], appState: { viewBackgroundColor: "#eee", zoom: { value: 2 }, selectedElementIds: { a: true } } });
    const res = await request(app).get(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH));
    expect(res.body.board.appState).toEqual({ viewBackgroundColor: "#eee" });
  });

  it("accepts a scene larger than the default 10 KB body limit", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    const elements = Array.from({ length: 400 }, (_, i) => rect(`el-${i}`));
    const res = await request(app).put(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH)).send({ elements });
    expect(JSON.stringify({ elements }).length).toBeGreaterThan(10_000);
    expect(res.status).toBe(200);
  });

  it("refuses a body over 2 MB (413)", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    const res = await request(app).put(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH)).send({ elements: [{ ...rect("big"), blob: "x".repeat(2_100_000) }] });
    expect(res.status).toBe(413);
  });

  it("can still be read after the class ended, but not saved (409 session_ended)", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    await request(app).put(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH)).send({ elements: [rect("a")] });
    await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));

    expect((await request(app).get(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH))).body.board.elements).toHaveLength(1);
    const save = await request(app).put(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH)).send({ elements: [] });
    expect(save.status).toBe(409);
    expect(save.body.error.code).toBe("session_ended");
  });

  it.each([{}, { elements: "no" }, { elements: [1] }, { elements: [{ id: "a" }] }, { elements: [], appState: { viewBackgroundColor: 5 } }])("rejects the body %j (400)", async (body) => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    const res = await request(app).put(SESSION_PATHS.board(id)).set(auth(TEACHER_AUTH)).send(body);
    expect(res.status).toBe(400);
  });

  it("belongs to the session's teacher; others and students are refused", async () => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    expect((await request(app).get(SESSION_PATHS.board(id)).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
    expect((await request(app).put(SESSION_PATHS.board(id)).set(auth(OTHER_TEACHER_AUTH)).send({ elements: [] })).status).toBe(404);
    expect((await request(app).get(SESSION_PATHS.board(id)).set(auth(studentAuth("satu")))).status).toBe(403);
  });
});

describe("saving an edited AI reply larger than 10 KB", () => {
  it("is accepted (the body limit is raised for this route)", async () => {
    const { app, db } = await buildTestApp();
    const chat = await db.repositories.teacher.chats.create(TEACHER_AUTH.userId, "Materi");
    const messageId = "00000000-0000-4000-8000-0000000000aa";
    db.chatMessages.push({ id: messageId, chatId: chat.id, role: "ASSISTANT", content: "lama", sources: null, createdAt: new Date() });
    const content = "y".repeat(30_000);
    const res = await request(app).patch(`/api/v1/chats/${chat.id}/messages/${messageId}`).set(auth(TEACHER_AUTH)).send({ content });
    expect(res.status).toBe(200);
    expect(res.body.message.content).toHaveLength(30_000);
  });
});
