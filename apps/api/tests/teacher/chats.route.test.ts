import request from "supertest";
import { describe, expect, it } from "vitest";
import { createObjectStorage } from "../../src/lib/storage.js";
import { buildTestApp } from "../helpers/app.js";
import { UNKNOWN_ID } from "../helpers/admin.js";
import { IDS } from "../helpers/fake-database.js";
import { ADMIN_AUTH, OTHER_TEACHER_AUTH, TEACHER_AUTH, auth, studentAuth } from "../helpers/sessions.js";

const CHATS = "/api/v1/chats";
const ONE = (id: string) => `${CHATS}/${id}`;
const MESSAGES = (id: string) => `${CHATS}/${id}/messages`;

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

async function newChat(app: Parameters<typeof request>[0], as = TEACHER_AUTH) {
  const res = await request(app).post(CHATS).set(auth(as)).send({});
  return res.body.chat.id as string;
}

describe("teacher · chats (/api/v1/chats)", () => {
  describe("success", () => {
    it("starts a chat with a default title, or the title given", async () => {
      const { app } = await buildTestApp();
      const plain = await request(app).post(CHATS).set(auth(TEACHER_AUTH)).send({});
      const named = await request(app).post(CHATS).set(auth(TEACHER_AUTH)).send({ title: "  Persiapan 7A  " });

      expect(plain.status).toBe(201);
      expect(plain.body.chat.title).toBe("Percakapan baru");
      expect(named.body.chat.title).toBe("Persiapan 7A");
    });

    it("lists only my chats, newest first; an admin sees all", async () => {
      const { app } = await buildTestApp();
      const first = await newChat(app);
      const second = await newChat(app);
      await newChat(app, OTHER_TEACHER_AUTH);

      const mine = await request(app).get(CHATS).set(auth(TEACHER_AUTH));
      expect(mine.body.items.map((c: { id: string }) => c.id)).toEqual([second, first]);
      expect((await request(app).get(CHATS).set(auth(ADMIN_AUTH))).body.items).toHaveLength(3);
    });

    it("text only (JSON): saves the message and queues one reply job, then wakes the worker", async () => {
      const { app, db } = await buildTestApp();
      const id = await newChat(app);
      const res = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).send({ text: "  Buatkan ringkasan  " });

      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({ message: { role: "USER", content: "Buatkan ringkasan" }, material: null, reply_pending: true });
      expect(db.jobs.map((j) => j.type)).toEqual(["CHAT_REPLY"]);
      expect(db.jobs[0].payload).toEqual({ chatId: id, messageId: res.body.message.id });
      expect(db.queue.notified).toBe(1);
    });

    it("text + file (multipart): stores the file and queues one extract job and one reply job", async () => {
      const { app, db, storage } = await buildTestApp();
      const id = await newChat(app);
      const res = await request(app)
        .post(MESSAGES(id))
        .set(auth(TEACHER_AUTH))
        .field("text", "Tolong pelajari modul ini")
        .attach("file", PDF, "Modul Perulangan.pdf");

      expect(res.status).toBe(202);
      expect(res.body.material).toMatchObject({ title: "Modul Perulangan", file_type: "pdf", status: "UPLOADED", error: null });

      const [key] = [...storage.objects.keys()];
      expect(key).toMatch(new RegExp(`^materials/${IDS.teacher}/[0-9a-f-]{36}\\.pdf$`));
      expect(storage.objects.get(key)).toMatchObject({ contentType: "application/pdf", body: PDF });
      expect([...db.materials.values()][0]).toMatchObject({ filePath: key, teacherId: IDS.teacher, chatId: id });
      expect(db.jobs.map((j) => j.type)).toEqual(["EXTRACT", "CHAT_REPLY"]);
      expect(db.jobs[0].payload).toEqual({ materialId: res.body.material.id });
      expect(db.queue.notified).toBe(1); // one NOTIFY for both jobs, after they were saved
    });

    it("accepts DOCX and PPTX too", async () => {
      const { app, storage } = await buildTestApp();
      const id = await newChat(app);
      for (const name of ["a.docx", "b.pptx"]) {
        const res = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).field("text", "hi").attach("file", ZIP, name);
        expect(res.status).toBe(202);
      }
      expect([...storage.objects.keys()].map((k) => k.split(".").pop()).sort()).toEqual(["docx", "pptx"]);
    });

    it("shows the chat with its materials and whether a reply is pending", async () => {
      const { app } = await buildTestApp();
      const id = await newChat(app);
      expect((await request(app).get(ONE(id)).set(auth(TEACHER_AUTH))).body).toMatchObject({ materials: [], reply_pending: false });

      await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).field("text", "hi").attach("file", PDF, "m.pdf");
      const detail = await request(app).get(ONE(id)).set(auth(TEACHER_AUTH));
      expect(detail.body.reply_pending).toBe(true);
      expect(detail.body.materials).toHaveLength(1);
    });

    it("reads the conversation oldest first, and polls with ?after=<last message id>", async () => {
      const { app } = await buildTestApp();
      const id = await newChat(app);
      const ids: string[] = [];
      for (const text of ["satu", "dua", "tiga"]) {
        ids.push((await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).send({ text })).body.message.id);
      }

      const all = await request(app).get(MESSAGES(id)).set(auth(TEACHER_AUTH));
      expect(all.body.items.map((m: { content: string }) => m.content)).toEqual(["satu", "dua", "tiga"]);
      expect(all.body.reply_pending).toBe(true);

      const newer = await request(app).get(`${MESSAGES(id)}?after=${ids[0]}`).set(auth(TEACHER_AUTH));
      expect(newer.body.items.map((m: { id: string }) => m.id)).toEqual([ids[1], ids[2]]);
      expect((await request(app).get(`${MESSAGES(id)}?limit=1`).set(auth(TEACHER_AUTH))).body.items[0].content).toBe("tiga");
    });

    it("an admin can read and write in any chat; the material still belongs to the chat's teacher", async () => {
      const { app, db } = await buildTestApp();
      const id = await newChat(app);
      const res = await request(app).post(MESSAGES(id)).set(auth(ADMIN_AUTH)).field("text", "hi").attach("file", PDF, "m.pdf");
      expect(res.status).toBe(202);
      expect([...db.materials.values()][0].teacherId).toBe(IDS.teacher);
    });
  });

  describe("edit an AI reply", () => {
    it("replaces the content of an assistant message; the teacher's own message cannot be edited", async () => {
      const { app, db } = await buildTestApp();
      const id = await newChat(app);
      const sent = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).send({ text: "Buat mindmap" });
      db.chatMessages.push({ id: UNKNOWN_ID, chatId: id, role: "ASSISTANT", content: "lama", sources: null, createdAt: new Date() });

      const ok = await request(app).patch(`${MESSAGES(id)}/${UNKNOWN_ID}`).set(auth(TEACHER_AUTH)).send({ content: "  baru  " });
      expect(ok.status).toBe(200);
      expect(ok.body.message).toMatchObject({ id: UNKNOWN_ID, role: "ASSISTANT", content: "baru" });

      const own = await request(app).patch(`${MESSAGES(id)}/${sent.body.message.id}`).set(auth(TEACHER_AUTH)).send({ content: "x" });
      expect(own.status).toBe(404);
    });

    it("validates the content and hides other teachers' chats", async () => {
      const { app, db } = await buildTestApp();
      const id = await newChat(app);
      db.chatMessages.push({ id: UNKNOWN_ID, chatId: id, role: "ASSISTANT", content: "lama", sources: null, createdAt: new Date() });
      expect((await request(app).patch(`${MESSAGES(id)}/${UNKNOWN_ID}`).set(auth(TEACHER_AUTH)).send({ content: "  " })).status).toBe(400);
      expect((await request(app).patch(`${MESSAGES(id)}/${UNKNOWN_ID}`).set(auth(OTHER_TEACHER_AUTH)).send({ content: "x" })).status).toBe(404);
      expect((await request(app).patch(`${MESSAGES(id)}/nope`).set(auth(TEACHER_AUTH)).send({ content: "x" })).status).toBe(400);
    });
  });

  describe("stop", () => {
    it("cancels the pending reply so reply_pending turns false, and keeps the message", async () => {
      const { app } = await buildTestApp();
      const id = await newChat(app);
      await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).send({ text: "Rangkum" });
      expect((await request(app).get(MESSAGES(id)).set(auth(TEACHER_AUTH))).body.reply_pending).toBe(true);

      expect((await request(app).post(`${ONE(id)}/stop`).set(auth(TEACHER_AUTH))).status).toBe(204);

      const after = await request(app).get(MESSAGES(id)).set(auth(TEACHER_AUTH));
      expect(after.body.reply_pending).toBe(false);
      expect(after.body.items).toHaveLength(1);
    });

    it("is harmless when nothing is pending, and 404 for another teacher's chat", async () => {
      const { app } = await buildTestApp();
      const id = await newChat(app);
      expect((await request(app).post(`${ONE(id)}/stop`).set(auth(TEACHER_AUTH))).status).toBe(204);
      expect((await request(app).post(`${ONE(id)}/stop`).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
    });
  });

  describe("delete", () => {
    it("deletes the chat, its messages and the stored file", async () => {
      const { app, storage } = await buildTestApp();
      const id = await newChat(app);
      await request(app)
        .post(MESSAGES(id))
        .set(auth(TEACHER_AUTH))
        .field("text", "Rangkum")
        .attach("file", PDF, { filename: "modul.pdf", contentType: "application/pdf" });
      expect(storage.objects.size).toBe(1);

      const res = await request(app).delete(ONE(id)).set(auth(TEACHER_AUTH));
      expect(res.status).toBe(204);
      expect(storage.objects.size).toBe(0);
      expect((await request(app).get(ONE(id)).set(auth(TEACHER_AUTH))).status).toBe(404);
      expect((await request(app).get(CHATS).set(auth(TEACHER_AUTH))).body.items).toEqual([]);
    });

    it("answers 404 for another teacher's chat or an unknown one, and leaves it alone", async () => {
      const { app } = await buildTestApp();
      const id = await newChat(app);
      expect((await request(app).delete(ONE(id)).set(auth(OTHER_TEACHER_AUTH))).status).toBe(404);
      expect((await request(app).delete(ONE(UNKNOWN_ID)).set(auth(TEACHER_AUTH))).status).toBe(404);
      expect((await request(app).get(ONE(id)).set(auth(TEACHER_AUTH))).status).toBe(200);
    });
  });

  describe("failure", () => {
    it("another teacher's chat is 404, the same as a missing one, for every chat route", async () => {
      const { app, db } = await buildTestApp();
      const id = await newChat(app);
      const other = auth(OTHER_TEACHER_AUTH);

      const foreign = [
        await request(app).get(ONE(id)).set(other),
        await request(app).get(MESSAGES(id)).set(other),
        await request(app).post(MESSAGES(id)).set(other).send({ text: "hi" }),
        await request(app).post(MESSAGES(id)).set(other).field("text", "hi").attach("file", PDF, "m.pdf"),
      ];
      const missing = await request(app).get(ONE(UNKNOWN_ID)).set(other);
      for (const res of foreign) expect(res.status).toBe(404);
      expect(foreign[0].body).toEqual(missing.body);
      expect(db.jobs).toHaveLength(0);
    });

    it("rejects missing, blank and over-long text with 400 and queues nothing", async () => {
      const { app, db } = await buildTestApp();
      const id = await newChat(app);
      for (const body of [{}, { text: "   " }, { text: 5 }, { text: "x".repeat(4001) }]) {
        const res = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).send(body);
        expect(res.status).toBe(400);
        expect(res.body.error.details.fields).toHaveProperty("text");
      }
      expect(db.jobs).toHaveLength(0);
    });

    it("rejects a file without text (the text is required)", async () => {
      const { app, storage } = await buildTestApp();
      const id = await newChat(app);
      const res = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).attach("file", PDF, "m.pdf");
      expect(res.status).toBe(400);
      expect(storage.objects.size).toBe(0);
    });

    it("rejects other file types and files that only wear a document's name; nothing is stored or queued", async () => {
      const { app, db, storage } = await buildTestApp();
      const id = await newChat(app);
      const attempts: [Buffer, string][] = [
        [Buffer.from("MZ binary"), "virus.exe"],
        [Buffer.from("<script>alert(1)</script>"), "fake.pdf"], // wrong first bytes
        [Buffer.from("just text"), "fake.docx"],
        [Buffer.alloc(0), "empty.pdf"],
        [PDF, "noextension"],
      ];
      for (const [content, name] of attempts) {
        const res = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).field("text", "hi").attach("file", content, name);
        expect(res.status, name).toBe(400);
        expect(res.body.error.details.fields, name).toHaveProperty("file");
      }
      expect(storage.objects.size).toBe(0);
      expect(db.jobs).toHaveLength(0);
    });

    it("cuts off a file over the limit with 413", async () => {
      const { app, db, storage } = await buildTestApp(); // test limit: 1 MB
      const id = await newChat(app);
      const big = Buffer.concat([PDF, Buffer.alloc(1024 * 1024 + 1)]);
      const res = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).field("text", "hi").attach("file", big, "big.pdf");
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("file_too_large");
      expect(storage.objects.size).toBe(0);
      expect(db.jobs).toHaveLength(0);
    });

    it("rejects two files and a file under another field name", async () => {
      const { app } = await buildTestApp();
      const id = await newChat(app);
      const two = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).field("text", "hi").attach("file", PDF, "a.pdf").attach("file", PDF, "b.pdf");
      const wrong = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).field("text", "hi").attach("upload", PDF, "a.pdf");
      expect(two.status).toBe(400);
      expect(wrong.status).toBe(400);
    });

    it("answers 503 when file storage is not configured, and saves nothing", async () => {
      const { app, db } = await buildTestApp({ storage: createObjectStorage(null) as never });
      const id = await newChat(app);
      const res = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).field("text", "hi").attach("file", PDF, "m.pdf");
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("storage_unavailable");
      expect(db.chatMessages).toHaveLength(0);
      // text-only messages never touch storage, so they still work
      expect((await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).send({ text: "hi" })).status).toBe(202);
    });

    it("saves nothing when the upload to storage fails", async () => {
      const { app, db, storage } = await buildTestApp();
      const id = await newChat(app);
      storage.state.failNext = true;
      const res = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).field("text", "hi").attach("file", PDF, "m.pdf");
      expect(res.status).toBe(500);
      expect(db.chatMessages).toHaveLength(0);
      expect(db.jobs).toHaveLength(0);
    });

    it("removes the stored file again when the database write fails, so no orphan is left in storage", async () => {
      const { app, db, storage } = await buildTestApp();
      const id = await newChat(app);
      db.repositories.teacher.chats.addMessage = async () => {
        throw new Error("database down");
      };
      const res = await request(app).post(MESSAGES(id)).set(auth(TEACHER_AUTH)).field("text", "hi").attach("file", PDF, "m.pdf");
      expect(res.status).toBe(500);
      expect(storage.objects.size).toBe(0);
    });

    it("validates ids and the poll query", async () => {
      const { app } = await buildTestApp();
      const id = await newChat(app);
      expect((await request(app).get(ONE("nope")).set(auth(TEACHER_AUTH))).status).toBe(400);
      expect((await request(app).get(`${MESSAGES(id)}?limit=0`).set(auth(TEACHER_AUTH))).status).toBe(400);
      expect((await request(app).get(`${MESSAGES(id)}?after=zzz`).set(auth(TEACHER_AUTH))).status).toBe(400);
      expect((await request(app).post(CHATS).set(auth(TEACHER_AUTH)).send({ title: "x".repeat(101) })).status).toBe(400);
    });

    it("a student gets 403 and no token gets 401, on every chat route", async () => {
      const { app } = await buildTestApp();
      const id = await newChat(app);
      for (const [method, path] of [["get", CHATS], ["post", CHATS], ["get", ONE(id)], ["delete", ONE(id)], ["post", `${ONE(id)}/stop`], ["get", MESSAGES(id)], ["post", MESSAGES(id)]] as const) {
        expect((await request(app)[method](path).set(auth(studentAuth("satu"))).send({ text: "hi" })).status, `${method} ${path}`).toBe(403);
        expect((await request(app)[method](path).send({ text: "hi" })).status, `${method} ${path}`).toBe(401);
      }
    });
  });
});
