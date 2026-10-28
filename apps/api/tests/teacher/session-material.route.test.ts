import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { ADMIN_AUTH, OTHER_TEACHER_AUTH, SESSION_PATHS, TEACHER_AUTH, auth, createSession } from "../helpers/sessions.js";

async function newChat(db: Awaited<ReturnType<typeof buildTestApp>>["db"], teacherId: string, title = "Struktur data") {
  return db.repositories.teacher.chats.create(teacherId, title);
}

describe("assigning a prepared material to a live session", () => {
  it("a session created with chat_id returns that material", async () => {
    const { app, db } = await buildTestApp();
    const chat = await newChat(db, TEACHER_AUTH.userId);
    const res = await request(app).post(SESSION_PATHS.create).set(auth(TEACHER_AUTH)).send({ class_code: "KELAS7A", chat_id: chat.id });

    expect(res.status).toBe(201);
    expect(res.body.session.chat_id).toBe(chat.id);
    expect(res.body.material).toEqual({ id: chat.id, title: "Struktur data" });
  });

  it("a session without material has material null", async () => {
    const { app } = await buildTestApp();
    const res = await request(app).post(SESSION_PATHS.create).set(auth(TEACHER_AUTH)).send({ class_code: "KELAS7A" });
    expect(res.body.material).toBeNull();
    expect(res.body.session.chat_id).toBeNull();
  });

  it("PUT /sessions/:id/material assigns, replaces and removes the material", async () => {
    const { app, db } = await buildTestApp();
    const { id } = await createSession(app);
    const first = await newChat(db, TEACHER_AUTH.userId, "Pertemuan 1");
    const second = await newChat(db, TEACHER_AUTH.userId, "Pertemuan 2");

    const assigned = await request(app).put(SESSION_PATHS.material(id)).set(auth(TEACHER_AUTH)).send({ chat_id: first.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.material.title).toBe("Pertemuan 1");

    const replaced = await request(app).put(SESSION_PATHS.material(id)).set(auth(TEACHER_AUTH)).send({ chat_id: second.id });
    expect(replaced.body.material.title).toBe("Pertemuan 2");

    const removed = await request(app).put(SESSION_PATHS.material(id)).set(auth(TEACHER_AUTH)).send({ chat_id: null });
    expect(removed.status).toBe(200);
    expect(removed.body.material).toBeNull();

    const reread = await request(app).get(SESSION_PATHS.one(id)).set(auth(TEACHER_AUTH));
    expect(reread.body.material).toBeNull();
  });

  it("another teacher's chat is 404 material_not_found, on create and on assign", async () => {
    const { app, db } = await buildTestApp();
    const foreign = await newChat(db, OTHER_TEACHER_AUTH.userId);

    const created = await request(app).post(SESSION_PATHS.create).set(auth(TEACHER_AUTH)).send({ class_code: "KELAS7A", chat_id: foreign.id });
    expect(created.status).toBe(404);
    expect(created.body.error.code).toBe("material_not_found");

    const { id } = await createSession(app);
    const assigned = await request(app).put(SESSION_PATHS.material(id)).set(auth(TEACHER_AUTH)).send({ chat_id: foreign.id });
    expect(assigned.status).toBe(404);
    expect(assigned.body.error.code).toBe("material_not_found");
  });

  it("an admin may assign a chat of the class's teacher", async () => {
    const { app, db } = await buildTestApp();
    const chat = await newChat(db, TEACHER_AUTH.userId);
    const { id } = await createSession(app);
    const res = await request(app).put(SESSION_PATHS.material(id)).set(auth(ADMIN_AUTH)).send({ chat_id: chat.id });
    expect(res.status).toBe(200);
  });

  it("an ended session refuses a material (409 session_ended)", async () => {
    const { app, db } = await buildTestApp();
    const chat = await newChat(db, TEACHER_AUTH.userId);
    const { id } = await createSession(app);
    await request(app).post(SESSION_PATHS.end(id)).set(auth(TEACHER_AUTH));
    const res = await request(app).put(SESSION_PATHS.material(id)).set(auth(TEACHER_AUTH)).send({ chat_id: chat.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("session_ended");
  });

  it("another teacher cannot change a session that is not theirs", async () => {
    const { app, db } = await buildTestApp();
    const chat = await newChat(db, OTHER_TEACHER_AUTH.userId);
    const { id } = await createSession(app);
    const res = await request(app).put(SESSION_PATHS.material(id)).set(auth(OTHER_TEACHER_AUTH)).send({ chat_id: chat.id });
    expect(res.status).toBe(404);
  });

  it.each([{}, { chat_id: "nope" }, { chat_id: 5 }])("rejects the body %j (400)", async (body) => {
    const { app } = await buildTestApp();
    const { id } = await createSession(app);
    const res = await request(app).put(SESSION_PATHS.material(id)).set(auth(TEACHER_AUTH)).send(body);
    expect(res.status).toBe(400);
  });
});
