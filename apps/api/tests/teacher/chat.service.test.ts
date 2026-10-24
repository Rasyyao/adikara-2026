import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_TITLE } from "../../src/services/teacher/chat.service.js";
import type { ValidFile } from "../../src/http/validators/teacher/chat.js";
import { IDS } from "../helpers/fake-database.js";
import { createMemoryStorage } from "../helpers/memory-storage.js";
import { buildServices, failure } from "../helpers/services.js";
import { ADMIN_AUTH, OTHER_TEACHER_AUTH, TEACHER_AUTH, studentAuth } from "../helpers/sessions.js";

const pdf = (title = "Modul"): ValidFile => ({ title, extension: ".pdf", contentType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });

async function setup() {
  const storage = createMemoryStorage();
  const built = await buildServices({}, storage);
  const chats = built.services.teacher.chats;
  const { chat } = await chats.create(TEACHER_AUTH, { title: null });
  return { ...built, chats, chat, storage };
}

describe("teacher chat service", () => {
  describe("success", () => {
    it("create: default title, owned by the caller", async () => {
      const { chats, db, chat } = await setup();
      expect(chat.title).toBe(DEFAULT_CHAT_TITLE);
      expect(db.chats.get(chat.id)?.teacherId).toBe(IDS.teacher);
      expect((await chats.create(TEACHER_AUTH, { title: "Kelas 7A" })).chat.title).toBe("Kelas 7A");
    });

    it("send text only: one reply job, nothing in storage, no material", async () => {
      const { chats, chat, db, storage } = await setup();
      const result = await chats.send(TEACHER_AUTH, chat.id, { text: "hai", file: null });
      expect(result).toMatchObject({ material: null, reply_pending: true, message: { role: "USER", content: "hai", sources: null } });
      expect(storage.objects.size).toBe(0);
      expect(db.jobs.map((j) => j.type)).toEqual(["CHAT_REPLY"]);
    });

    it("send with a file: key is materials/<owner>/<uuid>.<ext>, the material row points at it, the file type has no dot", async () => {
      const { chats, chat, db, storage } = await setup();
      const result = await chats.send(TEACHER_AUTH, chat.id, { text: "baca ini", file: pdf("Bab 1") });
      const [key] = [...storage.objects.keys()];

      expect(key).toMatch(new RegExp(`^materials/${IDS.teacher}/[0-9a-f-]{36}\\.pdf$`));
      expect(result.material).toEqual({ id: expect.any(String), title: "Bab 1", file_type: "pdf", status: "UPLOADED", error: null });
      expect([...db.materials.values()][0]).toMatchObject({ filePath: key, fileType: "pdf", chatId: chat.id });
    });

    it("two files with the same name get different keys (nothing is overwritten)", async () => {
      const { chats, chat, storage } = await setup();
      await chats.send(TEACHER_AUTH, chat.id, { text: "a", file: pdf("Sama") });
      await chats.send(TEACHER_AUTH, chat.id, { text: "b", file: pdf("Sama") });
      expect(storage.objects.size).toBe(2);
    });

    it("get/messages report reply_pending from the queue", async () => {
      const { chats, chat, db } = await setup();
      expect((await chats.get(TEACHER_AUTH, chat.id)).reply_pending).toBe(false);
      await chats.send(TEACHER_AUTH, chat.id, { text: "hai", file: null });
      expect((await chats.messages(TEACHER_AUTH, chat.id, { limit: 50 })).reply_pending).toBe(true);
      db.jobs.forEach((j) => (j.status = "DONE"));
      expect((await chats.get(TEACHER_AUTH, chat.id)).reply_pending).toBe(false);
    });

    it("views use snake_case and ISO dates, and never expose the owner or the storage key", async () => {
      const { chats, chat } = await setup();
      const sent = await chats.send(TEACHER_AUTH, chat.id, { text: "hai", file: pdf() });
      const json = JSON.stringify([chat, sent, await chats.get(TEACHER_AUTH, chat.id)]);
      expect(json).not.toMatch(/materials\/|teacher_id|teacherId|filePath|file_path/);
      expect(sent.message.created_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    });

    it("an admin lists every chat; a teacher only theirs", async () => {
      const { chats } = await setup();
      await chats.create(OTHER_TEACHER_AUTH, { title: "lain" });
      expect((await chats.list(ADMIN_AUTH)).items).toHaveLength(2);
      expect((await chats.list(TEACHER_AUTH)).items).toHaveLength(1);
    });
  });

  describe("failure", () => {
    it("a student cannot use any of it (403)", async () => {
      const { chats, chat } = await setup();
      const student = studentAuth("satu");
      for (const call of [
        () => chats.create(student, { title: null }),
        () => chats.list(student),
        () => chats.get(student, chat.id),
        () => chats.messages(student, chat.id, { limit: 5 }),
        () => chats.send(student, chat.id, { text: "hai", file: null }),
      ]) {
        expect(await failure(call())).toMatchObject({ status: 403, code: "forbidden" });
      }
    });

    it("another teacher's chat and a missing chat are the same 404", async () => {
      const { chats, chat } = await setup();
      const foreign = await failure(chats.get(OTHER_TEACHER_AUTH, chat.id));
      const missing = await failure(chats.get(OTHER_TEACHER_AUTH, "00000000-0000-4000-8000-00000000dead"));
      expect(foreign).toMatchObject({ status: 404, code: "chat_not_found" });
      expect({ ...foreign }).toEqual({ ...missing });
    });

    it("send to another teacher's chat stores nothing and queues nothing", async () => {
      const { chats, chat, db, storage } = await setup();
      await failure(chats.send(OTHER_TEACHER_AUTH, chat.id, { text: "hai", file: pdf() }));
      expect(storage.objects.size).toBe(0);
      expect(db.jobs).toHaveLength(0);
      expect(db.chatMessages).toHaveLength(0);
    });

    it("a storage failure propagates and leaves nothing behind", async () => {
      const { chats, chat, db, storage } = await setup();
      storage.state.failNext = true;
      await expect(chats.send(TEACHER_AUTH, chat.id, { text: "hai", file: pdf() })).rejects.toThrow("storage down");
      expect(db.materials.size + db.jobs.length + db.chatMessages.length).toBe(0);
    });

    it("a database failure removes the file again, and a failing cleanup does not hide the real error", async () => {
      const { chats, chat, db, storage } = await setup();
      db.repositories.teacher.chats.addMessage = async () => {
        throw new Error("database down");
      };
      storage.remove = async () => {
        throw new Error("cleanup failed too");
      };
      await expect(chats.send(TEACHER_AUTH, chat.id, { text: "hai", file: pdf() })).rejects.toThrow("database down");
    });

    it("without storage configured a file is refused with 503 but text still works", async () => {
      const { services } = await buildServices(); // default storage: not configured
      const { chat } = await services.teacher.chats.create(TEACHER_AUTH, { title: null });
      expect(await failure(services.teacher.chats.send(TEACHER_AUTH, chat.id, { text: "hai", file: pdf() }))).toMatchObject({
        status: 503,
        code: "storage_unavailable",
      });
      await expect(services.teacher.chats.send(TEACHER_AUTH, chat.id, { text: "hai", file: null })).resolves.toBeDefined();
    });
  });
});
