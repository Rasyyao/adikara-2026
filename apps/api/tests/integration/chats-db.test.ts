import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrisma } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createRepositories, type Repositories } from "../../src/repositories/index.js";
import { createTokenService } from "../../src/lib/token.js";
import { createServices } from "../../src/services/index.js";
import { createMemoryStorage } from "../helpers/memory-storage.js";
import { TEST_SECRET } from "../helpers/config.js";

/**
 * The real Prisma chat repository against PostgreSQL: what the in-memory fake cannot prove — the transaction that
 * saves message + material + jobs together, the cursor, the pending-reply query on the JSON payload, the
 * cascades, and the NOTIFY that wakes the Python worker.
 * Runs against the local development database (DATABASE_URL) and wipes its tables.
 */
// the local development database (the same one the Python worker listens on)
const url = process.env.DATABASE_URL;
const safe = Boolean(url);

describe.skipIf(!safe)("chats against a real database", () => {
  let prisma: PrismaClient;
  let repos: Repositories;
  let teacher: { id: string };
  let other: { id: string };
  let chats: Repositories["teacher"]["chats"];

  const newChat = (teacherId = teacher.id) => chats.create(teacherId, "uji");
  const material = (teacherId = teacher.id) => ({ teacherId, title: "Modul", filePath: `materials/${teacherId}/a.pdf`, fileType: "pdf" });
  const jobsOf = (chatId: string) =>
    prisma.job.findMany({ where: { OR: [{ payload: { path: ["chatId"], equals: chatId } }, { type: "EXTRACT" }] }, orderBy: { type: "asc" } });

  beforeAll(() => {
    prisma = createPrisma(url as string);
    repos = createRepositories(prisma);
    chats = repos.teacher.chats;
  });

  // children first: jobs and chats do not cascade from teachers
  const clean = async () => {
    await prisma.job.deleteMany();
    await prisma.chat.deleteMany(); // cascades messages and chat_materials
    await prisma.material.deleteMany(); // cascades chunks
    await prisma.sessionParticipant.deleteMany();
    await prisma.classSession.deleteMany();
    await prisma.student.deleteMany();
    await prisma.classroom.deleteMany();
    await prisma.teacher.deleteMany();
  };

  beforeEach(async () => {
    await clean();
    teacher = await prisma.teacher.create({ data: { email: "t@example.com", name: "T", passwordHash: "x" } });
    other = await prisma.teacher.create({ data: { email: "o@example.com", name: "O", passwordHash: "x" } });
  });

  afterAll(async () => {
    await clean();
    await prisma?.$disconnect();
  });

  describe("create / list / find", () => {
    it("creates, finds, and lists newest first, per teacher or for all", async () => {
      const a = await newChat();
      const b = await newChat();
      const foreign = await newChat(other.id);

      expect(await chats.findById(a.id)).toMatchObject({ id: a.id, teacherId: teacher.id, title: "uji" });
      expect(await chats.findById("00000000-0000-4000-8000-00000000dead")).toBeNull();
      expect((await chats.list(teacher.id)).map((c) => c.id)).toEqual([b.id, a.id]);
      expect((await chats.list(null)).map((c) => c.id).sort()).toEqual([a.id, b.id, foreign.id].sort());
    });
  });

  describe("addMessage", () => {
    it("text only: saves the message and queues exactly one reply job pointing at it", async () => {
      const chat = await newChat();
      const { message, material: saved } = await chats.addMessage({ chatId: chat.id, content: "hai" });

      expect(saved).toBeNull();
      expect(message).toMatchObject({ chatId: chat.id, role: "USER", content: "hai", sources: null });
      const jobs = await prisma.job.findMany();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ type: "CHAT_REPLY", status: "QUEUED", attempts: 0, payload: { chatId: chat.id, messageId: message.id } });
    });

    it("with a file: message, material (UPLOADED), the chat link, an extract job and a reply job — all saved together", async () => {
      const chat = await newChat();
      const { message, material: saved } = await chats.addMessage({ chatId: chat.id, content: "baca", material: material() });

      expect(saved).toMatchObject({ title: "Modul", fileType: "pdf", status: "UPLOADED", error: null });
      const row = await prisma.material.findUniqueOrThrow({ where: { id: saved!.id } });
      expect(row).toMatchObject({ teacherId: teacher.id, filePath: `materials/${teacher.id}/a.pdf`, status: "UPLOADED" });
      expect(await prisma.chatMaterial.count({ where: { chatId: chat.id, materialId: saved!.id } })).toBe(1);

      const jobs = await prisma.job.findMany();
      expect(jobs.map((j) => j.type).sort()).toEqual(["CHAT_REPLY", "EXTRACT"]);
      expect(jobs.find((j) => j.type === "EXTRACT")?.payload).toEqual({ materialId: saved!.id });
      expect(jobs.find((j) => j.type === "CHAT_REPLY")?.payload).toEqual({ chatId: chat.id, messageId: message.id });
    });

    it("is all-or-nothing: when the material cannot be saved, the message and the jobs are rolled back too", async () => {
      const chat = await newChat();
      const ghostTeacher = "00000000-0000-4000-8000-00000000dead";
      await expect(chats.addMessage({ chatId: chat.id, content: "baca", material: material(ghostTeacher) })).rejects.toThrow();

      expect(await prisma.chatMessage.count()).toBe(0);
      expect(await prisma.material.count()).toBe(0);
      expect(await prisma.job.count()).toBe(0);
    });

    it("refuses a message for a chat that does not exist and leaves no job", async () => {
      await expect(chats.addMessage({ chatId: "00000000-0000-4000-8000-00000000dead", content: "hai" })).rejects.toThrow();
      expect(await prisma.job.count()).toBe(0);
    });

    it("wakes the worker with NOTIFY jobs, and only after the rows are visible", async () => {
      const listener = new pg.Client({ connectionString: url });
      await listener.connect();
      try {
        await listener.query("LISTEN jobs");
        const chat = await newChat();
        const seenAtNotify = new Promise<number>((resolve) => {
          listener.on("notification", async () => resolve((await prisma.job.count()) as number));
        });
        await chats.addMessage({ chatId: chat.id, content: "hai", material: material() });
        expect(await seenAtNotify).toBe(2); // both jobs were already committed when the worker was woken
      } finally {
        await listener.end();
      }
    });
  });

  describe("messages", () => {
    const send = async (chatId: string, n: number) => {
      const ids: string[] = [];
      for (let i = 1; i <= n; i++) ids.push((await chats.addMessage({ chatId, content: `m${i}` })).message.id);
      return ids;
    };

    it("without a cursor: the latest messages, in reading order", async () => {
      const chat = await newChat();
      await send(chat.id, 5);
      expect((await chats.listMessages(chat.id, { limit: 3 })).map((m) => m.content)).toEqual(["m3", "m4", "m5"]);
      expect((await chats.listMessages(chat.id, { limit: 50 })).map((m) => m.content)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    });

    it("with a cursor: exactly the messages after it — no gaps and no repeats, even when sent in the same millisecond", async () => {
      const chat = await newChat();
      const ids = await Promise.all(Array.from({ length: 8 }, (_, i) => chats.addMessage({ chatId: chat.id, content: `p${i}` }).then((r) => r.message.id)));
      const all = (await chats.listMessages(chat.id, { limit: 50 })).map((m) => m.id);
      expect(new Set(all).size).toBe(ids.length);

      for (let i = 0; i < all.length; i++) {
        const after = await chats.listMessages(chat.id, { limit: 50, after: all[i] });
        expect(after.map((m) => m.id)).toEqual(all.slice(i + 1));
      }
    });

    it("a cursor from another chat finds nothing (no leak across chats)", async () => {
      const mine = await newChat();
      const theirs = await newChat(other.id);
      const [foreignId] = await send(theirs.id, 1);
      await send(mine.id, 2);
      expect(await chats.listMessages(mine.id, { limit: 50, after: foreignId })).toEqual([]);
    });

    it("an unknown cursor finds nothing", async () => {
      const chat = await newChat();
      await send(chat.id, 2);
      expect(await chats.listMessages(chat.id, { limit: 50, after: "00000000-0000-4000-8000-00000000dead" })).toEqual([]);
    });

    it("reads assistant sources back as a list of ids, and null when there are none", async () => {
      const chat = await newChat();
      const at = (ms: number) => new Date(Date.now() - 10_000 + ms); // explicit, so the order does not depend on the clock
      await prisma.chatMessage.create({ data: { chatId: chat.id, role: "ASSISTANT", content: "jawab", sources: ["a", "b"], createdAt: at(0) } });
      await prisma.chatMessage.create({ data: { chatId: chat.id, role: "ASSISTANT", content: "tanpa", createdAt: at(1000) } });
      const [withSources, without] = await chats.listMessages(chat.id, { limit: 5 });
      expect(withSources.sources).toEqual(["a", "b"]);
      expect(without.sources).toBeNull();
    });
  });

  describe("hasPendingReply", () => {
    it("is true while a reply job is queued or running, false once it is done or failed", async () => {
      const chat = await newChat();
      expect(await chats.hasPendingReply(chat.id)).toBe(false);
      await chats.addMessage({ chatId: chat.id, content: "hai" });
      expect(await chats.hasPendingReply(chat.id)).toBe(true);

      await prisma.job.updateMany({ data: { status: "RUNNING" } });
      expect(await chats.hasPendingReply(chat.id)).toBe(true);
      await prisma.job.updateMany({ data: { status: "FAILED" } });
      expect(await chats.hasPendingReply(chat.id)).toBe(false);
      await prisma.job.updateMany({ data: { status: "DONE" } });
      expect(await chats.hasPendingReply(chat.id)).toBe(false);
    });

    it("only counts reply jobs of THIS chat, and ignores extract jobs", async () => {
      const a = await newChat();
      const b = await newChat();
      await chats.addMessage({ chatId: a.id, content: "hai", material: material() });
      await prisma.job.updateMany({ where: { type: "CHAT_REPLY" }, data: { status: "DONE" } }); // extract still queued
      expect(await chats.hasPendingReply(a.id)).toBe(false);
      expect(await chats.hasPendingReply(b.id)).toBe(false);

      await chats.addMessage({ chatId: b.id, content: "hai" });
      expect(await chats.hasPendingReply(b.id)).toBe(true);
      expect(await chats.hasPendingReply(a.id)).toBe(false);
    });
  });

  describe("materials", () => {
    it("lists a chat's materials oldest first with the status and error the worker wrote", async () => {
      const chat = await newChat();
      const first = (await chats.addMessage({ chatId: chat.id, content: "1", material: { ...material(), title: "Satu" } })).material!;
      await chats.addMessage({ chatId: chat.id, content: "2", material: { ...material(), title: "Dua", filePath: "materials/x/b.pdf" } });
      await prisma.material.update({ where: { id: first.id }, data: { status: "FAILED", error: "PDF ini tidak berisi teks." } });

      const list = await chats.listMaterials(chat.id);
      expect(list.map((m) => [m.title, m.status, m.error])).toEqual([
        ["Satu", "FAILED", "PDF ini tidak berisi teks."],
        ["Dua", "UPLOADED", null],
      ]);
    });

    it("a chat sees only its own materials", async () => {
      const a = await newChat();
      const b = await newChat();
      await chats.addMessage({ chatId: a.id, content: "1", material: material() });
      expect(await chats.listMaterials(b.id)).toEqual([]);
    });
  });

  describe("cascades", () => {
    it("deleting a chat removes its messages and links but keeps the material and the sessions that pointed at it", async () => {
      const chat = await newChat();
      const { material: saved } = await chats.addMessage({ chatId: chat.id, content: "hai", material: material() });
      const classroom = await prisma.classroom.create({ data: { name: "7A", classCode: "KELAS7A", teacherId: teacher.id } });
      const session = await prisma.classSession.create({
        data: { classId: classroom.id, teacherId: teacher.id, chatId: chat.id, joinCode: "123456", expiresAt: new Date(Date.now() + 60_000) },
      });

      await prisma.chat.delete({ where: { id: chat.id } });

      expect(await prisma.chatMessage.count()).toBe(0);
      expect(await prisma.chatMaterial.count()).toBe(0);
      expect(await prisma.material.count({ where: { id: saved!.id } })).toBe(1);
      expect((await prisma.classSession.findUniqueOrThrow({ where: { id: session.id } })).chatId).toBeNull();
    });

    it("deleting a material removes its link to the chat but keeps the chat and its messages", async () => {
      const chat = await newChat();
      const { material: saved } = await chats.addMessage({ chatId: chat.id, content: "hai", material: material() });
      await prisma.material.delete({ where: { id: saved!.id } });
      expect(await chats.listMaterials(chat.id)).toEqual([]);
      expect(await prisma.chatMessage.count()).toBe(1);
    });

    it("one chat can serve many sessions", async () => {
      const chat = await newChat();
      const classroom = await prisma.classroom.create({ data: { name: "7A", classCode: "KELAS7A", teacherId: teacher.id } });
      const data = (joinCode: string) => ({ classId: classroom.id, teacherId: teacher.id, chatId: chat.id, joinCode, expiresAt: new Date(Date.now() + 60_000) });
      await prisma.classSession.create({ data: { ...data("111111"), status: "ENDED", joinCode: null } });
      await prisma.classSession.create({ data: data("222222") });
      expect(await prisma.classSession.count({ where: { chatId: chat.id } })).toBe(2);
    });
  });

  describe("through the service, end to end on the real repository", () => {
    it("send a message with a file: stored, saved, queued; the other teacher cannot read it", async () => {
      const storage = createMemoryStorage();
      const tokens = createTokenService({ secret: TEST_SECRET, ttlSeconds: 60 });
      const services = await createServices(repos, tokens, { bcryptCost: 4, session: {}, storage });
      const owner = { userId: teacher.id, role: "TEACHER" as const, kind: "teacher" as const };
      const stranger = { userId: other.id, role: "TEACHER" as const, kind: "teacher" as const };

      const { chat } = await services.teacher.chats.create(owner, { title: null });
      const sent = await services.teacher.chats.send(owner, chat.id, {
        text: "pelajari",
        file: { title: "Bab 1", extension: ".pdf", contentType: "application/pdf", buffer: Buffer.from("%PDF-1.4") },
      });

      const [key] = [...storage.objects.keys()];
      expect(key).toMatch(new RegExp(`^materials/${teacher.id}/`));
      expect((await prisma.material.findUniqueOrThrow({ where: { id: sent.material!.id } })).filePath).toBe(key);
      expect((await services.teacher.chats.get(owner, chat.id)).reply_pending).toBe(true);
      await expect(services.teacher.chats.get(stranger, chat.id)).rejects.toMatchObject({ status: 404 });
    });
  });
});
